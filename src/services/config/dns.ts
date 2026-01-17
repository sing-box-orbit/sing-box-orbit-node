import { config } from '@/config';
import type { DnsConfig, DnsRule, DnsServer, SingBoxConfig } from '@/types/singbox';
import { BadRequestError, ConfigValidationError, NotFoundError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { backupService } from '../backup';
import { BaseConfigService } from './base';

export class DnsConfigService extends BaseConfigService {
	async getDns(): Promise<DnsConfig> {
		const cfg = await this.getConfig();
		return cfg.dns || {};
	}

	async setDns(dns: DnsConfig, reason = 'api-update-dns'): Promise<DnsConfig> {
		const release = await this.acquireLock();

		try {
			const cfg = await this.getConfig();
			const newConfig: SingBoxConfig = { ...cfg, dns };

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

			const newConfig: SingBoxConfig = { ...cfg, dns: updatedDns };

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
				throw new BadRequestError(`DNS Server with tag '${server.tag}' already exists`);
			}

			const newServers = [...servers, server];
			const newDns: DnsConfig = { ...dns, servers: newServers };
			const newConfig: SingBoxConfig = { ...cfg, dns: newDns };

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

			logger.info('DNS Server created', { tag: server.tag });
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
				throw new NotFoundError(`DNS Server with tag '${tag}' not found`);
			}

			if (server.tag !== tag && servers.some((s) => s.tag === server.tag)) {
				throw new BadRequestError(`DNS Server with tag '${server.tag}' already exists`);
			}

			const newServers = [...servers];
			newServers[index] = server;

			const newDns: DnsConfig = { ...dns, servers: newServers };
			const newConfig: SingBoxConfig = { ...cfg, dns: newDns };

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

			logger.info('DNS Server updated', { tag: server.tag });
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
			const newConfig: SingBoxConfig = { ...cfg, dns: newDns };

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

			logger.info('DNS Server deleted', { tag });
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
			const newConfig: SingBoxConfig = { ...cfg, dns: newDns };

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
			logger.info('DNS rule created', { index: newIndex });
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
			const newConfig: SingBoxConfig = { ...cfg, dns: newDns };

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

			logger.info('DNS rule updated', { index });
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
			const newConfig: SingBoxConfig = { ...cfg, dns: newDns };

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
			const newConfig: SingBoxConfig = { ...cfg, dns: newDns };

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
}

export const dnsConfigService = new DnsConfigService();
