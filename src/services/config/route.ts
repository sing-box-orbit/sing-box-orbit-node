import { config } from '@/config';
import type { RouteConfig, RouteRule, RuleSet, SingBoxConfig } from '@/types/singbox';
import { BadRequestError, ConfigValidationError, NotFoundError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { backupService } from '../backup';
import { BaseConfigService } from './base';

export class RouteConfigService extends BaseConfigService {
	async getRoute(): Promise<RouteConfig> {
		const cfg = await this.getConfig();
		return cfg.route || {};
	}

	async setRoute(route: RouteConfig, reason = 'api-update-route'): Promise<RouteConfig> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const newConfig: SingBoxConfig = { ...cfg, route };

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

			const newConfig: SingBoxConfig = { ...cfg, route: updatedRoute };

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
			const newConfig: SingBoxConfig = { ...cfg, route: newRoute };

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
			logger.info('Route rule created', { index: newIndex });
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
			const newConfig: SingBoxConfig = { ...cfg, route: newRoute };

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

			logger.info('Route rule updated', { index });
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
			const newConfig: SingBoxConfig = { ...cfg, route: newRoute };

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
			const newConfig: SingBoxConfig = { ...cfg, route: newRoute };

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
			const newConfig: SingBoxConfig = { ...cfg, route: newRoute };

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
			const newConfig: SingBoxConfig = { ...cfg, route: newRoute };

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
			const newConfig: SingBoxConfig = { ...cfg, route: newRoute };

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
}

export const routeConfigService = new RouteConfigService();
