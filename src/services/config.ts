import { mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawn } from 'bun';
import { config } from '@/config';
import type {
	CertificateConfig,
	DnsConfig,
	DnsRule,
	DnsServer,
	Endpoint,
	ExperimentalConfig,
	Inbound,
	LogConfig,
	NtpConfig,
	Outbound,
	RouteConfig,
	RouteRule,
	RuleSet,
	Service,
	SingBoxConfig,
} from '@/types/singbox';
import { BadRequestError, ConfigValidationError, NotFoundError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { RWLock } from '@/utils/rwlock';
import { type Backup, backupService } from './backup';
import { processService } from './process';

export interface ValidationError {
	path: string;
	message: string;
	code: string;
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
}

export interface ConfigChange {
	type: 'added' | 'removed' | 'modified';
	path: string;
	oldValue?: unknown;
	newValue?: unknown;
}

const DEFAULT_CONFIG: SingBoxConfig = {
	log: { level: 'info' },
	inbounds: [],
	outbounds: [{ type: 'direct', tag: 'direct' }],
};

class ConfigService {
	private readonly configPath = config.singbox.configPath;
	private readonly binary = config.singbox.binary;
	private readonly rwlock = new RWLock();
	private configCache: SingBoxConfig | null = null;

	async ensureConfig(): Promise<boolean> {
		const file = Bun.file(this.configPath);

		if (await file.exists()) {
			return false;
		}

		await mkdir(dirname(this.configPath), { recursive: true });
		await Bun.write(this.configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
		logger.info('Created default configuration', { path: this.configPath });

		return true;
	}

	async getConfig(): Promise<SingBoxConfig> {
		const release = await this.acquireReadLock();

		try {
			if (this.configCache) {
				return this.configCache;
			}

			const file = Bun.file(this.configPath);

			if (!(await file.exists())) {
				throw new NotFoundError('Configuration file not found');
			}

			const configData = (await file.json()) as SingBoxConfig;
			this.configCache = configData;
			return configData;
		} catch (error) {
			if (error instanceof NotFoundError) {
				throw error;
			}
			throw new BadRequestError(
				`Failed to parse configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		} finally {
			release();
		}
	}

	async setConfig(newConfig: SingBoxConfig, reason = 'api-update'): Promise<void> {
		const release = await this.acquireLock();

		try {
			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Configuration updated', { reason });
		} finally {
			release();
		}
	}

	async patchConfig(patch: Partial<SingBoxConfig>, reason = 'api-patch'): Promise<SingBoxConfig> {
		const release = await this.acquireLock();

		try {
			const current = await this.getConfig();
			const merged = this.deepMerge(current, patch);

			const validation = await this.validateConfig(merged);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(merged);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Configuration patched', { reason });
			return merged;
		} finally {
			release();
		}
	}

	async validateConfig(configToValidate: SingBoxConfig): Promise<ValidationResult> {
		const errors: ValidationError[] = [];

		if (typeof configToValidate !== 'object' || configToValidate === null) {
			errors.push({
				path: '',
				message: 'Configuration must be an object',
				code: 'INVALID_TYPE',
			});
			return { valid: false, errors };
		}

		const singboxValidation = await this.validateWithSingbox(configToValidate);
		if (!singboxValidation.valid) {
			errors.push(...singboxValidation.errors);
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	async createBackup(reason = 'manual'): Promise<Backup> {
		const content = await this.getConfigRaw();
		if (!content) {
			throw new NotFoundError('No configuration to backup');
		}
		return backupService.create(content, reason);
	}

	async listBackups(): Promise<Backup[]> {
		return backupService.list();
	}

	async restoreBackup(backupId: string): Promise<void> {
		const release = await this.acquireLock();

		try {
			const content = await backupService.getContent(backupId);
			if (!content) {
				throw new NotFoundError(`Backup not found: ${backupId}`);
			}

			const restoredConfig = JSON.parse(content) as SingBoxConfig;

			const validation = await this.validateConfig(restoredConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					`Backup configuration is invalid: ${validation.errors.map((e) => e.message).join('; ')}`,
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-restore');
				}
			}

			await this.atomicWrite(restoredConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Configuration restored from backup', { backupId });
		} finally {
			release();
		}
	}

	async deleteBackup(backupId: string): Promise<boolean> {
		return backupService.delete(backupId);
	}

	async getInbounds(): Promise<Inbound[]> {
		const cfg = await this.getConfig();
		return cfg.inbounds || [];
	}

	async getInbound(tag: string): Promise<Inbound | null> {
		const inbounds = await this.getInbounds();
		return inbounds.find((i) => i.tag === tag) || null;
	}

	async createInbound(inbound: Inbound): Promise<Inbound> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const inbounds = cfg.inbounds || [];

			if (inbounds.some((i) => i.tag === inbound.tag)) {
				throw new BadRequestError(`Inbound with tag '${inbound.tag}' already exists`);
			}

			const newConfig: SingBoxConfig = {
				...cfg,
				inbounds: [...inbounds, inbound],
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-create-inbound');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Inbound created', { tag: inbound.tag, type: inbound.type });
			return inbound;
		} finally {
			release();
		}
	}

	async updateInbound(tag: string, inbound: Inbound): Promise<Inbound> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const inbounds = cfg.inbounds || [];
			const index = inbounds.findIndex((i) => i.tag === tag);

			if (index === -1) {
				throw new NotFoundError(`Inbound with tag '${tag}' not found`);
			}

			if (inbound.tag !== tag && inbounds.some((i) => i.tag === inbound.tag)) {
				throw new BadRequestError(`Inbound with tag '${inbound.tag}' already exists`);
			}

			const newInbounds = [...inbounds];
			newInbounds[index] = inbound;

			const newConfig: SingBoxConfig = {
				...cfg,
				inbounds: newInbounds,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-update-inbound');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Inbound updated', { tag: inbound.tag, type: inbound.type });
			return inbound;
		} finally {
			release();
		}
	}

	async patchInbound(tag: string, patch: Partial<Inbound>): Promise<Inbound> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const inbounds = cfg.inbounds || [];
			const index = inbounds.findIndex((i) => i.tag === tag);

			if (index === -1) {
				throw new NotFoundError(`Inbound with tag '${tag}' not found`);
			}

			const current = inbounds[index];
			const updated = { ...current, ...patch } as Inbound;

			if (patch.tag && patch.tag !== tag && inbounds.some((i) => i.tag === patch.tag)) {
				throw new BadRequestError(`Inbound with tag '${patch.tag}' already exists`);
			}

			const newInbounds = [...inbounds];
			newInbounds[index] = updated;

			const newConfig: SingBoxConfig = {
				...cfg,
				inbounds: newInbounds,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-patch-inbound');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Inbound patched', { tag: updated.tag, type: updated.type });
			return updated;
		} finally {
			release();
		}
	}

	async deleteInbound(tag: string): Promise<boolean> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const inbounds = cfg.inbounds || [];
			const index = inbounds.findIndex((i) => i.tag === tag);

			if (index === -1) {
				return false;
			}

			const newInbounds = inbounds.filter((i) => i.tag !== tag);

			const newConfig: SingBoxConfig = {
				...cfg,
				inbounds: newInbounds,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-delete-inbound');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Inbound deleted', { tag });
			return true;
		} finally {
			release();
		}
	}

	async getOutbounds(): Promise<Outbound[]> {
		const cfg = await this.getConfig();
		return cfg.outbounds || [];
	}

	async getOutbound(tag: string): Promise<Outbound | null> {
		const outbounds = await this.getOutbounds();
		return outbounds.find((o) => o.tag === tag) || null;
	}

	async createOutbound(outbound: Outbound): Promise<Outbound> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const outbounds = cfg.outbounds || [];

			if (outbounds.some((o) => o.tag === outbound.tag)) {
				throw new BadRequestError(`Outbound with tag '${outbound.tag}' already exists`);
			}

			const newConfig: SingBoxConfig = {
				...cfg,
				outbounds: [...outbounds, outbound],
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-create-outbound');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Outbound created', { tag: outbound.tag, type: outbound.type });
			return outbound;
		} finally {
			release();
		}
	}

	async updateOutbound(tag: string, outbound: Outbound): Promise<Outbound> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const outbounds = cfg.outbounds || [];
			const index = outbounds.findIndex((o) => o.tag === tag);

			if (index === -1) {
				throw new NotFoundError(`Outbound with tag '${tag}' not found`);
			}

			if (outbound.tag !== tag && outbounds.some((o) => o.tag === outbound.tag)) {
				throw new BadRequestError(`Outbound with tag '${outbound.tag}' already exists`);
			}

			const newOutbounds = [...outbounds];
			newOutbounds[index] = outbound;

			const newConfig: SingBoxConfig = {
				...cfg,
				outbounds: newOutbounds,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-update-outbound');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Outbound updated', { tag: outbound.tag, type: outbound.type });
			return outbound;
		} finally {
			release();
		}
	}

	async patchOutbound(tag: string, patch: Partial<Outbound>): Promise<Outbound> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const outbounds = cfg.outbounds || [];
			const index = outbounds.findIndex((o) => o.tag === tag);

			if (index === -1) {
				throw new NotFoundError(`Outbound with tag '${tag}' not found`);
			}

			const current = outbounds[index];
			const updated = { ...current, ...patch } as Outbound;

			if (patch.tag && patch.tag !== tag && outbounds.some((o) => o.tag === patch.tag)) {
				throw new BadRequestError(`Outbound with tag '${patch.tag}' already exists`);
			}

			const newOutbounds = [...outbounds];
			newOutbounds[index] = updated;

			const newConfig: SingBoxConfig = {
				...cfg,
				outbounds: newOutbounds,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-patch-outbound');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Outbound patched', { tag: updated.tag, type: updated.type });
			return updated;
		} finally {
			release();
		}
	}

	async deleteOutbound(tag: string): Promise<boolean> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const outbounds = cfg.outbounds || [];
			const index = outbounds.findIndex((o) => o.tag === tag);

			if (index === -1) {
				return false;
			}

			const newOutbounds = outbounds.filter((o) => o.tag !== tag);

			const newConfig: SingBoxConfig = {
				...cfg,
				outbounds: newOutbounds,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-delete-outbound');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Outbound deleted', { tag });
			return true;
		} finally {
			release();
		}
	}

	async getRoute(): Promise<RouteConfig> {
		const cfg = await this.getConfig();
		return cfg.route || {};
	}

	async setRoute(route: RouteConfig, reason = 'api-update-route'): Promise<RouteConfig> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const newConfig: SingBoxConfig = {
				...cfg,
				route,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Route config updated', { reason });
			return route;
		} finally {
			release();
		}
	}

	async patchRoute(patch: Partial<RouteConfig>, reason = 'api-patch-route'): Promise<RouteConfig> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const currentRoute = cfg.route || {};
			const updatedRoute = { ...currentRoute, ...patch } as RouteConfig;

			const newConfig: SingBoxConfig = {
				...cfg,
				route: updatedRoute,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Route config patched', { reason });
			return updatedRoute;
		} finally {
			release();
		}
	}

	async getRouteRules(): Promise<RouteRule[]> {
		const route = await this.getRoute();
		return route.rules || [];
	}

	async getRouteRule(index: number): Promise<RouteRule | null> {
		const rules = await this.getRouteRules();
		if (index < 0 || index >= rules.length) {
			return null;
		}
		return rules[index];
	}

	async createRouteRule(rule: RouteRule): Promise<{ rule: RouteRule; index: number }> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const route = cfg.route || {};
			const rules = route.rules || [];

			const newRules = [...rules, rule];
			const newRoute: RouteConfig = { ...route, rules: newRules };

			const newConfig: SingBoxConfig = {
				...cfg,
				route: newRoute,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-create-route-rule');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			const newIndex = newRules.length - 1;
			logger.info('Route rule created', {
				index: newIndex,
				outbound: 'outbound' in rule ? rule.outbound : undefined,
			});
			return { rule, index: newIndex };
		} finally {
			release();
		}
	}

	async updateRouteRule(index: number, rule: RouteRule): Promise<RouteRule> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const route = cfg.route || {};
			const rules = route.rules || [];

			if (index < 0 || index >= rules.length) {
				throw new NotFoundError(`Route rule at index ${index} not found`);
			}

			const newRules = [...rules];
			newRules[index] = rule;

			const newRoute: RouteConfig = { ...route, rules: newRules };
			const newConfig: SingBoxConfig = {
				...cfg,
				route: newRoute,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-update-route-rule');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Route rule updated', {
				index,
				outbound: 'outbound' in rule ? rule.outbound : undefined,
			});
			return rule;
		} finally {
			release();
		}
	}

	async deleteRouteRule(index: number): Promise<boolean> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const route = cfg.route || {};
			const rules = route.rules || [];

			if (index < 0 || index >= rules.length) {
				return false;
			}

			const newRules = rules.filter((_, i) => i !== index);
			const newRoute: RouteConfig = { ...route, rules: newRules };

			const newConfig: SingBoxConfig = {
				...cfg,
				route: newRoute,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-delete-route-rule');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Route rule deleted', { index });
			return true;
		} finally {
			release();
		}
	}

	async reorderRouteRules(fromIndex: number, toIndex: number): Promise<RouteRule[]> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const route = cfg.route || {};
			const rules = route.rules || [];

			if (fromIndex < 0 || fromIndex >= rules.length) {
				throw new BadRequestError(`Invalid fromIndex: ${fromIndex}`);
			}
			if (toIndex < 0 || toIndex >= rules.length) {
				throw new BadRequestError(`Invalid toIndex: ${toIndex}`);
			}

			const newRules = [...rules];
			const [movedRule] = newRules.splice(fromIndex, 1);
			newRules.splice(toIndex, 0, movedRule);

			const newRoute: RouteConfig = { ...route, rules: newRules };
			const newConfig: SingBoxConfig = {
				...cfg,
				route: newRoute,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-reorder-route-rules');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Route rules reordered', { fromIndex, toIndex });
			return newRules;
		} finally {
			release();
		}
	}

	async getRuleSets(): Promise<RuleSet[]> {
		const route = await this.getRoute();
		return route.rule_set || [];
	}

	async getRuleSet(tag: string): Promise<RuleSet | null> {
		const ruleSets = await this.getRuleSets();
		return ruleSets.find((rs) => rs.tag === tag) || null;
	}

	async createRuleSet(ruleSet: RuleSet): Promise<RuleSet> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const route = cfg.route || {};
			const ruleSets = route.rule_set || [];

			if (ruleSets.some((rs) => rs.tag === ruleSet.tag)) {
				throw new BadRequestError(`Rule set with tag '${ruleSet.tag}' already exists`);
			}

			const newRuleSets = [...ruleSets, ruleSet];
			const newRoute: RouteConfig = { ...route, rule_set: newRuleSets };

			const newConfig: SingBoxConfig = {
				...cfg,
				route: newRoute,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-create-rule-set');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Rule set created', { tag: ruleSet.tag, type: ruleSet.type });
			return ruleSet;
		} finally {
			release();
		}
	}

	async updateRuleSet(tag: string, ruleSet: RuleSet): Promise<RuleSet> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const route = cfg.route || {};
			const ruleSets = route.rule_set || [];
			const index = ruleSets.findIndex((rs) => rs.tag === tag);

			if (index === -1) {
				throw new NotFoundError(`Rule set with tag '${tag}' not found`);
			}

			if (ruleSet.tag !== tag && ruleSets.some((rs) => rs.tag === ruleSet.tag)) {
				throw new BadRequestError(`Rule set with tag '${ruleSet.tag}' already exists`);
			}

			const newRuleSets = [...ruleSets];
			newRuleSets[index] = ruleSet;

			const newRoute: RouteConfig = { ...route, rule_set: newRuleSets };
			const newConfig: SingBoxConfig = {
				...cfg,
				route: newRoute,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-update-rule-set');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Rule set updated', { tag: ruleSet.tag, type: ruleSet.type });
			return ruleSet;
		} finally {
			release();
		}
	}

	async deleteRuleSet(tag: string): Promise<boolean> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const route = cfg.route || {};
			const ruleSets = route.rule_set || [];
			const index = ruleSets.findIndex((rs) => rs.tag === tag);

			if (index === -1) {
				return false;
			}

			const newRuleSets = ruleSets.filter((rs) => rs.tag !== tag);
			const newRoute: RouteConfig = { ...route, rule_set: newRuleSets };

			const newConfig: SingBoxConfig = {
				...cfg,
				route: newRoute,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-delete-rule-set');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Rule set deleted', { tag });
			return true;
		} finally {
			release();
		}
	}

	async getDns(): Promise<DnsConfig> {
		const cfg = await this.getConfig();
		return cfg.dns || {};
	}

	async setDns(dns: DnsConfig, reason = 'api-update-dns'): Promise<DnsConfig> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const newConfig: SingBoxConfig = {
				...cfg,
				dns,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('DNS config updated', { reason });
			return dns;
		} finally {
			release();
		}
	}

	async patchDns(patch: Partial<DnsConfig>, reason = 'api-patch-dns'): Promise<DnsConfig> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const currentDns = cfg.dns || {};
			const updatedDns = { ...currentDns, ...patch } as DnsConfig;

			const newConfig: SingBoxConfig = {
				...cfg,
				dns: updatedDns,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('DNS config patched', { reason });
			return updatedDns;
		} finally {
			release();
		}
	}

	async getDnsServers(): Promise<DnsServer[]> {
		const dns = await this.getDns();
		return dns.servers || [];
	}

	async getDnsServer(tag: string): Promise<DnsServer | null> {
		const servers = await this.getDnsServers();
		return servers.find((s) => s.tag === tag) || null;
	}

	async createDnsServer(server: DnsServer): Promise<DnsServer> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const dns = cfg.dns || {};
			const servers = dns.servers || [];

			if (servers.some((s) => s.tag === server.tag)) {
				throw new BadRequestError(`DNS server with tag '${server.tag}' already exists`);
			}

			const newServers = [...servers, server];
			const newDns: DnsConfig = { ...dns, servers: newServers };

			const newConfig: SingBoxConfig = {
				...cfg,
				dns: newDns,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-create-dns-server');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('DNS server created', {
				tag: server.tag,
				type: 'type' in server ? server.type : 'legacy',
			});
			return server;
		} finally {
			release();
		}
	}

	async updateDnsServer(tag: string, server: DnsServer): Promise<DnsServer> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const dns = cfg.dns || {};
			const servers = dns.servers || [];
			const index = servers.findIndex((s) => s.tag === tag);

			if (index === -1) {
				throw new NotFoundError(`DNS server with tag '${tag}' not found`);
			}

			if (server.tag !== tag && servers.some((s) => s.tag === server.tag)) {
				throw new BadRequestError(`DNS server with tag '${server.tag}' already exists`);
			}

			const newServers = [...servers];
			newServers[index] = server;

			const newDns: DnsConfig = { ...dns, servers: newServers };
			const newConfig: SingBoxConfig = {
				...cfg,
				dns: newDns,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-update-dns-server');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('DNS server updated', {
				tag: server.tag,
				type: 'type' in server ? server.type : 'legacy',
			});
			return server;
		} finally {
			release();
		}
	}

	async deleteDnsServer(tag: string): Promise<boolean> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const dns = cfg.dns || {};
			const servers = dns.servers || [];
			const index = servers.findIndex((s) => s.tag === tag);

			if (index === -1) {
				return false;
			}

			const newServers = servers.filter((s) => s.tag !== tag);
			const newDns: DnsConfig = { ...dns, servers: newServers };

			const newConfig: SingBoxConfig = {
				...cfg,
				dns: newDns,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-delete-dns-server');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('DNS server deleted', { tag });
			return true;
		} finally {
			release();
		}
	}

	async getDnsRules(): Promise<DnsRule[]> {
		const dns = await this.getDns();
		return dns.rules || [];
	}

	async getDnsRule(index: number): Promise<DnsRule | null> {
		const rules = await this.getDnsRules();
		if (index < 0 || index >= rules.length) {
			return null;
		}
		return rules[index];
	}

	async createDnsRule(rule: DnsRule): Promise<{ rule: DnsRule; index: number }> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const dns = cfg.dns || {};
			const rules = dns.rules || [];

			const newRules = [...rules, rule];
			const newDns: DnsConfig = { ...dns, rules: newRules };

			const newConfig: SingBoxConfig = {
				...cfg,
				dns: newDns,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-create-dns-rule');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			const newIndex = newRules.length - 1;
			logger.info('DNS rule created', {
				index: newIndex,
				action: 'action' in rule ? rule.action : 'route',
			});
			return { rule, index: newIndex };
		} finally {
			release();
		}
	}

	async updateDnsRule(index: number, rule: DnsRule): Promise<DnsRule> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const dns = cfg.dns || {};
			const rules = dns.rules || [];

			if (index < 0 || index >= rules.length) {
				throw new NotFoundError(`DNS rule at index ${index} not found`);
			}

			const newRules = [...rules];
			newRules[index] = rule;

			const newDns: DnsConfig = { ...dns, rules: newRules };
			const newConfig: SingBoxConfig = {
				...cfg,
				dns: newDns,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-update-dns-rule');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('DNS rule updated', { index, action: 'action' in rule ? rule.action : 'route' });
			return rule;
		} finally {
			release();
		}
	}

	async deleteDnsRule(index: number): Promise<boolean> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const dns = cfg.dns || {};
			const rules = dns.rules || [];

			if (index < 0 || index >= rules.length) {
				return false;
			}

			const newRules = rules.filter((_, i) => i !== index);
			const newDns: DnsConfig = { ...dns, rules: newRules };

			const newConfig: SingBoxConfig = {
				...cfg,
				dns: newDns,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-delete-dns-rule');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('DNS rule deleted', { index });
			return true;
		} finally {
			release();
		}
	}

	async reorderDnsRules(fromIndex: number, toIndex: number): Promise<DnsRule[]> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const dns = cfg.dns || {};
			const rules = dns.rules || [];

			if (fromIndex < 0 || fromIndex >= rules.length) {
				throw new BadRequestError(`Invalid fromIndex: ${fromIndex}`);
			}
			if (toIndex < 0 || toIndex >= rules.length) {
				throw new BadRequestError(`Invalid toIndex: ${toIndex}`);
			}

			const newRules = [...rules];
			const [movedRule] = newRules.splice(fromIndex, 1);
			newRules.splice(toIndex, 0, movedRule);

			const newDns: DnsConfig = { ...dns, rules: newRules };
			const newConfig: SingBoxConfig = {
				...cfg,
				dns: newDns,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-reorder-dns-rules');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('DNS rules reordered', { fromIndex, toIndex });
			return newRules;
		} finally {
			release();
		}
	}

	async getLog(): Promise<LogConfig> {
		const cfg = await this.getConfig();
		return cfg.log || {};
	}

	async setLog(log: LogConfig, reason = 'api-update-log'): Promise<LogConfig> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const newConfig: SingBoxConfig = {
				...cfg,
				log,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Log config updated', { reason });
			return log;
		} finally {
			release();
		}
	}

	async patchLog(patch: Partial<LogConfig>, reason = 'api-patch-log'): Promise<LogConfig> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const currentLog = cfg.log || {};
			const updatedLog = { ...currentLog, ...patch } as LogConfig;

			const newConfig: SingBoxConfig = {
				...cfg,
				log: updatedLog,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Log config patched', { reason });
			return updatedLog;
		} finally {
			release();
		}
	}

	async getNtp(): Promise<NtpConfig> {
		const cfg = await this.getConfig();
		return cfg.ntp || {};
	}

	async setNtp(ntp: NtpConfig, reason = 'api-update-ntp'): Promise<NtpConfig> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const newConfig: SingBoxConfig = {
				...cfg,
				ntp,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('NTP config updated', { reason });
			return ntp;
		} finally {
			release();
		}
	}

	async patchNtp(patch: Partial<NtpConfig>, reason = 'api-patch-ntp'): Promise<NtpConfig> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const currentNtp = cfg.ntp || {};
			const updatedNtp = { ...currentNtp, ...patch } as NtpConfig;

			const newConfig: SingBoxConfig = {
				...cfg,
				ntp: updatedNtp,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('NTP config patched', { reason });
			return updatedNtp;
		} finally {
			release();
		}
	}

	async getExperimental(): Promise<ExperimentalConfig> {
		const cfg = await this.getConfig();
		return cfg.experimental || {};
	}

	async setExperimental(
		experimental: ExperimentalConfig,
		reason = 'api-update-experimental',
	): Promise<ExperimentalConfig> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const newConfig: SingBoxConfig = {
				...cfg,
				experimental,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Experimental config updated', { reason });
			return experimental;
		} finally {
			release();
		}
	}

	async patchExperimental(
		patch: Partial<ExperimentalConfig>,
		reason = 'api-patch-experimental',
	): Promise<ExperimentalConfig> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const currentExperimental = cfg.experimental || {};
			const updatedExperimental = { ...currentExperimental, ...patch } as ExperimentalConfig;

			const newConfig: SingBoxConfig = {
				...cfg,
				experimental: updatedExperimental,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Experimental config patched', { reason });
			return updatedExperimental;
		} finally {
			release();
		}
	}

	async testOutbound(
		tag: string,
		testUrl = 'https://www.google.com/generate_204',
		timeout = 5000,
	): Promise<{ success: boolean; latency?: number; error?: string }> {
		const outbound = await this.getOutbound(tag);
		if (!outbound) {
			throw new NotFoundError(`Outbound with tag '${tag}' not found`);
		}

		const startTime = Date.now();

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), timeout);

			try {
				const response = await fetch(testUrl, {
					method: 'HEAD',
					signal: controller.signal,
				});

				clearTimeout(timeoutId);
				const latency = Date.now() - startTime;

				if (response.ok || response.status === 204) {
					logger.info('Outbound test successful', { tag, latency, status: response.status });
					return { success: true, latency };
				}

				return {
					success: false,
					latency,
					error: `HTTP ${response.status}: ${response.statusText}`,
				};
			} catch (fetchError) {
				clearTimeout(timeoutId);
				const latency = Date.now() - startTime;

				if (fetchError instanceof Error && fetchError.name === 'AbortError') {
					return { success: false, latency, error: 'Connection timeout' };
				}

				return {
					success: false,
					latency,
					error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
				};
			}
		} catch (error) {
			const latency = Date.now() - startTime;
			logger.warn('Outbound test failed', {
				tag,
				error: error instanceof Error ? error.message : String(error),
			});
			return {
				success: false,
				latency,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}

	async getOutboundLatency(
		tag: string,
		testUrl = 'https://www.google.com/generate_204',
		timeout = 5000,
		samples = 3,
	): Promise<{ latency: number | null; samples: number[]; error?: string }> {
		const outbound = await this.getOutbound(tag);
		if (!outbound) {
			throw new NotFoundError(`Outbound with tag '${tag}' not found`);
		}

		const latencies: number[] = [];
		let lastError: string | undefined;

		for (let i = 0; i < samples; i++) {
			const result = await this.testOutbound(tag, testUrl, timeout);
			if (result.success && result.latency !== undefined) {
				latencies.push(result.latency);
			} else if (result.error) {
				lastError = result.error;
			}
		}

		if (latencies.length === 0) {
			logger.warn('Outbound latency test failed - no successful samples', { tag });
			return { latency: null, samples: [], error: lastError || 'All samples failed' };
		}

		const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
		logger.info('Outbound latency measured', { tag, avgLatency, sampleCount: latencies.length });

		return { latency: avgLatency, samples: latencies };
	}

	async getSingboxVersion(): Promise<{
		version: string;
		tags: string[];
		revision: string;
		cgo: boolean;
	}> {
		const proc = spawn({
			cmd: [this.binary, 'version'],
			stdout: 'pipe',
			stderr: 'pipe',
		});

		const stdout = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;

		if (exitCode !== 0) {
			throw new BadRequestError('Failed to get sing-box version');
		}

		const lines = stdout.trim().split('\n');
		const versionMatch = lines[0]?.match(/sing-box version (.+)/);
		const tagsMatch = lines.find((l) => l.startsWith('Tags:'))?.match(/Tags: (.+)/);
		const cgoMatch = lines.find((l) => l.startsWith('CGO:'))?.match(/CGO: (.+)/);
		const revisionMatch = lines.find((l) => l.startsWith('Revision:'))?.match(/Revision: (.+)/);

		return {
			version: versionMatch?.[1] || 'unknown',
			tags: tagsMatch?.[1]?.split(',') || [],
			revision: revisionMatch?.[1] || 'unknown',
			cgo: cgoMatch?.[1] === 'enabled',
		};
	}

	async checkSingboxBinary(): Promise<{
		available: boolean;
		path: string;
		version?: string;
		error?: string;
	}> {
		try {
			const proc = spawn({
				cmd: [this.binary, 'version'],
				stdout: 'pipe',
				stderr: 'pipe',
			});

			const stdout = await new Response(proc.stdout).text();
			const exitCode = await proc.exited;

			if (exitCode !== 0) {
				return {
					available: false,
					path: this.binary,
					error: 'Binary exists but failed to execute',
				};
			}

			const versionMatch = stdout.match(/sing-box version (.+)/);

			return {
				available: true,
				path: this.binary,
				version: versionMatch?.[1] || 'unknown',
			};
		} catch (error) {
			return {
				available: false,
				path: this.binary,
				error: error instanceof Error ? error.message : 'Binary not found or not executable',
			};
		}
	}

	async getEndpoints(): Promise<Endpoint[]> {
		const cfg = await this.getConfig();
		return cfg.endpoints || [];
	}

	async getEndpoint(tag: string): Promise<Endpoint | null> {
		const endpoints = await this.getEndpoints();
		return endpoints.find((e) => e.tag === tag) || null;
	}

	async createEndpoint(endpoint: Endpoint): Promise<Endpoint> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const endpoints = cfg.endpoints || [];

			if (endpoints.some((e) => e.tag === endpoint.tag)) {
				throw new BadRequestError(`Endpoint with tag '${endpoint.tag}' already exists`);
			}

			const newConfig: SingBoxConfig = {
				...cfg,
				endpoints: [...endpoints, endpoint],
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-create-endpoint');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Endpoint created', { tag: endpoint.tag, type: endpoint.type });
			return endpoint;
		} finally {
			release();
		}
	}

	async updateEndpoint(tag: string, endpoint: Endpoint): Promise<Endpoint> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const endpoints = cfg.endpoints || [];
			const index = endpoints.findIndex((e) => e.tag === tag);

			if (index === -1) {
				throw new NotFoundError(`Endpoint with tag '${tag}' not found`);
			}

			if (endpoint.tag !== tag && endpoints.some((e) => e.tag === endpoint.tag)) {
				throw new BadRequestError(`Endpoint with tag '${endpoint.tag}' already exists`);
			}

			const newEndpoints = [...endpoints];
			newEndpoints[index] = endpoint;

			const newConfig: SingBoxConfig = {
				...cfg,
				endpoints: newEndpoints,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-update-endpoint');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Endpoint updated', { tag: endpoint.tag, type: endpoint.type });
			return endpoint;
		} finally {
			release();
		}
	}

	async patchEndpoint(tag: string, patch: Partial<Endpoint>): Promise<Endpoint> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const endpoints = cfg.endpoints || [];
			const index = endpoints.findIndex((e) => e.tag === tag);

			if (index === -1) {
				throw new NotFoundError(`Endpoint with tag '${tag}' not found`);
			}

			const current = endpoints[index];
			const updated = { ...current, ...patch } as Endpoint;

			if (patch.tag && patch.tag !== tag && endpoints.some((e) => e.tag === patch.tag)) {
				throw new BadRequestError(`Endpoint with tag '${patch.tag}' already exists`);
			}

			const newEndpoints = [...endpoints];
			newEndpoints[index] = updated;

			const newConfig: SingBoxConfig = {
				...cfg,
				endpoints: newEndpoints,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-patch-endpoint');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Endpoint patched', { tag: updated.tag, type: updated.type });
			return updated;
		} finally {
			release();
		}
	}

	async deleteEndpoint(tag: string): Promise<boolean> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const endpoints = cfg.endpoints || [];
			const index = endpoints.findIndex((e) => e.tag === tag);

			if (index === -1) {
				return false;
			}

			const newEndpoints = endpoints.filter((e) => e.tag !== tag);

			const newConfig: SingBoxConfig = {
				...cfg,
				endpoints: newEndpoints,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-delete-endpoint');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Endpoint deleted', { tag });
			return true;
		} finally {
			release();
		}
	}

	async getServices(): Promise<Service[]> {
		const cfg = await this.getConfig();
		return cfg.services || [];
	}

	async getService(tag: string): Promise<Service | null> {
		const services = await this.getServices();
		return services.find((s) => s.tag === tag) || null;
	}

	async createService(service: Service): Promise<Service> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const services = cfg.services || [];

			if (services.some((s) => s.tag === service.tag)) {
				throw new BadRequestError(`Service with tag '${service.tag}' already exists`);
			}

			const newConfig: SingBoxConfig = {
				...cfg,
				services: [...services, service],
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-create-service');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Service created', { tag: service.tag, type: service.type });
			return service;
		} finally {
			release();
		}
	}

	async updateService(tag: string, service: Service): Promise<Service> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const services = cfg.services || [];
			const index = services.findIndex((s) => s.tag === tag);

			if (index === -1) {
				throw new NotFoundError(`Service with tag '${tag}' not found`);
			}

			if (service.tag !== tag && services.some((s) => s.tag === service.tag)) {
				throw new BadRequestError(`Service with tag '${service.tag}' already exists`);
			}

			const newServices = [...services];
			newServices[index] = service;

			const newConfig: SingBoxConfig = {
				...cfg,
				services: newServices,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-update-service');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Service updated', { tag: service.tag, type: service.type });
			return service;
		} finally {
			release();
		}
	}

	async patchService(tag: string, patch: Partial<Service>): Promise<Service> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const services = cfg.services || [];
			const index = services.findIndex((s) => s.tag === tag);

			if (index === -1) {
				throw new NotFoundError(`Service with tag '${tag}' not found`);
			}

			const current = services[index];
			const updated = { ...current, ...patch } as Service;

			if (patch.tag && patch.tag !== tag && services.some((s) => s.tag === patch.tag)) {
				throw new BadRequestError(`Service with tag '${patch.tag}' already exists`);
			}

			const newServices = [...services];
			newServices[index] = updated;

			const newConfig: SingBoxConfig = {
				...cfg,
				services: newServices,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-patch-service');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Service patched', { tag: updated.tag, type: updated.type });
			return updated;
		} finally {
			release();
		}
	}

	async deleteService(tag: string): Promise<boolean> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const services = cfg.services || [];
			const index = services.findIndex((s) => s.tag === tag);

			if (index === -1) {
				return false;
			}

			const newServices = services.filter((s) => s.tag !== tag);

			const newConfig: SingBoxConfig = {
				...cfg,
				services: newServices,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-delete-service');
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Service deleted', { tag });
			return true;
		} finally {
			release();
		}
	}

	async getCertificate(): Promise<CertificateConfig> {
		const cfg = await this.getConfig();
		return cfg.certificate || {};
	}

	async setCertificate(
		certificate: CertificateConfig,
		reason = 'api-update-certificate',
	): Promise<CertificateConfig> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const newConfig: SingBoxConfig = {
				...cfg,
				certificate,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Certificate config updated', { reason });
			return certificate;
		} finally {
			release();
		}
	}

	async patchCertificate(
		patch: Partial<CertificateConfig>,
		reason = 'api-patch-certificate',
	): Promise<CertificateConfig> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const currentCertificate = cfg.certificate || {};
			const updatedCertificate = { ...currentCertificate, ...patch } as CertificateConfig;

			const newConfig: SingBoxConfig = {
				...cfg,
				certificate: updatedCertificate,
			};

			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Certificate config patched', { reason });
			return updatedCertificate;
		} finally {
			release();
		}
	}

	async deleteCertificate(reason = 'api-delete-certificate'): Promise<boolean> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();

			if (!cfg.certificate) {
				return false;
			}

			const { certificate: _, ...newConfig } = cfg;

			const validation = await this.validateConfig(newConfig as SingBoxConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(newConfig as SingBoxConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Certificate config deleted', { reason });
			return true;
		} finally {
			release();
		}
	}

	async exportConfig(): Promise<{
		config: SingBoxConfig;
		metadata: {
			exportedAt: string;
			version: string;
			singboxVersion?: string;
		};
	}> {
		const cfg = await this.getConfig();

		let singboxVersion: string | undefined;
		try {
			const versionInfo = await this.getSingboxVersion();
			singboxVersion = versionInfo.version;
		} catch (error) {
			logger.debug('Failed to get sing-box version for export', {
				error: error instanceof Error ? error.message : String(error),
			});
		}

		const metadata = {
			exportedAt: new Date().toISOString(),
			version: '1.0',
			singboxVersion,
		};

		logger.info('Configuration exported', { metadata });

		return {
			config: cfg,
			metadata,
		};
	}

	async importConfig(
		importData: {
			config: SingBoxConfig;
			metadata?: {
				exportedAt?: string;
				version?: string;
				singboxVersion?: string;
			};
		},
		options: {
			validate?: boolean;
			merge?: boolean;
			createBackup?: boolean;
		} = {},
	): Promise<{
		success: boolean;
		config: SingBoxConfig;
		warnings: string[];
	}> {
		const { validate = true, merge = false, createBackup = true } = options;
		const warnings: string[] = [];

		if (!importData.config) {
			throw new BadRequestError('Import data must contain a "config" property');
		}

		if (typeof importData.config !== 'object' || importData.config === null) {
			throw new BadRequestError('Configuration must be an object');
		}

		if (importData.metadata?.version && importData.metadata.version !== '1.0') {
			warnings.push(
				`Import format version ${importData.metadata.version} may not be fully compatible`,
			);
		}

		if (importData.metadata?.singboxVersion) {
			try {
				const currentVersion = await this.getSingboxVersion();
				if (importData.metadata.singboxVersion !== currentVersion.version) {
					warnings.push(
						`Configuration was exported from sing-box ${importData.metadata.singboxVersion}, current version is ${currentVersion.version}`,
					);
				}
			} catch (error) {
				logger.debug('Failed to compare sing-box versions during import', {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		let finalConfig: SingBoxConfig;

		if (merge) {
			const currentConfig = await this.getConfig();
			finalConfig = this.deepMerge(currentConfig, importData.config);
		} else {
			finalConfig = importData.config;
		}

		if (validate) {
			const validation = await this.validateConfig(finalConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}
		}

		const release = await this.acquireLock();

		try {
			if (createBackup && config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, 'before-import');
				}
			}

			await this.atomicWrite(finalConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Configuration imported', {
				merge,
				validate,
				createBackup,
				warningsCount: warnings.length,
			});

			return {
				success: true,
				config: finalConfig,
				warnings,
			};
		} finally {
			release();
		}
	}

	async diffWithBackup(backupId: string): Promise<{
		hasChanges: boolean;
		changes: ConfigChange[];
		current: SingBoxConfig;
		backup: SingBoxConfig;
	}> {
		const currentConfig = await this.getConfig();
		const backupContent = await backupService.getContent(backupId);

		if (!backupContent) {
			throw new NotFoundError(`Backup not found: ${backupId}`);
		}

		const backupConfig = JSON.parse(backupContent) as SingBoxConfig;
		const changes = this.compareConfigs(backupConfig, currentConfig);

		return {
			hasChanges: changes.length > 0,
			changes,
			current: currentConfig,
			backup: backupConfig,
		};
	}

	async diffBackups(
		backupId1: string,
		backupId2: string,
	): Promise<{
		hasChanges: boolean;
		changes: ConfigChange[];
		config1: SingBoxConfig;
		config2: SingBoxConfig;
	}> {
		const [content1, content2] = await Promise.all([
			backupService.getContent(backupId1),
			backupService.getContent(backupId2),
		]);

		if (!content1) {
			throw new NotFoundError(`Backup not found: ${backupId1}`);
		}
		if (!content2) {
			throw new NotFoundError(`Backup not found: ${backupId2}`);
		}

		const config1 = JSON.parse(content1) as SingBoxConfig;
		const config2 = JSON.parse(content2) as SingBoxConfig;
		const changes = this.compareConfigs(config1, config2);

		return {
			hasChanges: changes.length > 0,
			changes,
			config1,
			config2,
		};
	}

	private compareConfigs(oldConfig: SingBoxConfig, newConfig: SingBoxConfig): ConfigChange[] {
		const changes: ConfigChange[] = [];

		const compare = (
			oldObj: Record<string, unknown>,
			newObj: Record<string, unknown>,
			path = '',
		) => {
			const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

			for (const key of allKeys) {
				const currentPath = path ? `${path}.${key}` : key;
				const oldValue = oldObj?.[key];
				const newValue = newObj?.[key];

				if (oldValue === undefined && newValue !== undefined) {
					changes.push({
						type: 'added',
						path: currentPath,
						newValue,
					});
				} else if (oldValue !== undefined && newValue === undefined) {
					changes.push({
						type: 'removed',
						path: currentPath,
						oldValue,
					});
				} else if (typeof oldValue === 'object' && typeof newValue === 'object') {
					if (Array.isArray(oldValue) && Array.isArray(newValue)) {
						if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
							changes.push({
								type: 'modified',
								path: currentPath,
								oldValue,
								newValue,
							});
						}
					} else if (oldValue !== null && newValue !== null) {
						compare(
							oldValue as Record<string, unknown>,
							newValue as Record<string, unknown>,
							currentPath,
						);
					}
				} else if (oldValue !== newValue) {
					changes.push({
						type: 'modified',
						path: currentPath,
						oldValue,
						newValue,
					});
				}
			}
		};

		compare(
			oldConfig as unknown as Record<string, unknown>,
			newConfig as unknown as Record<string, unknown>,
		);

		return changes;
	}

	private async getConfigRaw(): Promise<string | null> {
		const file = Bun.file(this.configPath);
		if (!(await file.exists())) {
			return null;
		}
		return file.text();
	}

	private async validateWithSingbox(configToValidate: SingBoxConfig): Promise<ValidationResult> {
		const tempPath = join(dirname(this.configPath), `.config-validate-${crypto.randomUUID()}.json`);

		try {
			await Bun.write(tempPath, JSON.stringify(configToValidate, null, 2));

			const proc = spawn({
				cmd: [this.binary, 'check', '-c', tempPath],
				stdout: 'pipe',
				stderr: 'pipe',
			});

			const stderr = await new Response(proc.stderr).text();
			const exitCode = await proc.exited;

			if (exitCode !== 0) {
				const errorMatch = stderr.match(/decode config.*?: (.+)/);
				const errorMessage = errorMatch ? errorMatch[1] : stderr.trim();

				return {
					valid: false,
					errors: [
						{
							path: '',
							message: errorMessage || 'Invalid configuration',
							code: 'SINGBOX_VALIDATION_ERROR',
						},
					],
				};
			}

			return { valid: true, errors: [] };
		} finally {
			try {
				const file = Bun.file(tempPath);
				if (await file.exists()) {
					await file.unlink();
				}
			} catch (error) {
				logger.debug('Failed to cleanup temp validation file', {
					tempPath,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	private async atomicWrite(configToWrite: SingBoxConfig): Promise<void> {
		const tempPath = `${this.configPath}.${crypto.randomUUID()}.tmp`;
		const content = JSON.stringify(configToWrite, null, 2);

		await Bun.write(tempPath, content);
		await rename(tempPath, this.configPath);
		this.configCache = configToWrite;
	}

	private async reloadIfRunning(): Promise<void> {
		try {
			const status = await processService.getStatus();
			if (status.running) {
				await processService.reload();
				logger.info('sing-box reloaded after config update');
			}
		} catch (error) {
			logger.warn('Failed to reload sing-box', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private deepMerge(target: SingBoxConfig, source: Partial<SingBoxConfig>): SingBoxConfig {
		const result = { ...target } as Record<string, unknown>;

		for (const key of Object.keys(source) as (keyof SingBoxConfig)[]) {
			const sourceValue = source[key];
			const targetValue = result[key];

			if (
				sourceValue !== undefined &&
				typeof sourceValue === 'object' &&
				sourceValue !== null &&
				!Array.isArray(sourceValue) &&
				typeof targetValue === 'object' &&
				targetValue !== null &&
				!Array.isArray(targetValue)
			) {
				result[key] = this.deepMergeObject(
					targetValue as Record<string, unknown>,
					sourceValue as Record<string, unknown>,
				);
			} else if (sourceValue !== undefined) {
				result[key] = sourceValue;
			}
		}

		return result as SingBoxConfig;
	}

	private deepMergeObject(
		target: Record<string, unknown>,
		source: Record<string, unknown>,
	): Record<string, unknown> {
		const result = { ...target };

		for (const key of Object.keys(source)) {
			const sourceValue = source[key];
			const targetValue = result[key];

			if (
				sourceValue !== undefined &&
				typeof sourceValue === 'object' &&
				sourceValue !== null &&
				!Array.isArray(sourceValue) &&
				typeof targetValue === 'object' &&
				targetValue !== null &&
				!Array.isArray(targetValue)
			) {
				result[key] = this.deepMergeObject(
					targetValue as Record<string, unknown>,
					sourceValue as Record<string, unknown>,
				);
			} else if (sourceValue !== undefined) {
				result[key] = sourceValue;
			}
		}

		return result;
	}

	invalidateCache(): void {
		this.configCache = null;
	}

	private async acquireLock(): Promise<() => void> {
		return this.rwlock.acquireWrite();
	}

	private async acquireReadLock(): Promise<() => void> {
		return this.rwlock.acquireRead();
	}
}

export const configService = new ConfigService();
