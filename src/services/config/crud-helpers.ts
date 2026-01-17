import { config } from '@/config';
import type { SingBoxConfig } from '@/types/singbox';
import { BadRequestError, ConfigValidationError, NotFoundError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { backupService } from '../backup';
import type { BaseConfigService, ValidationResult } from './base';

export interface TaggedItem {
	tag: string;
}

export interface CrudContext<T extends TaggedItem> {
	service: BaseConfigService;
	arrayKey: keyof SingBoxConfig;
	entityName: string;
	getArray: (cfg: SingBoxConfig) => T[];
}

export async function getItems<T extends TaggedItem>(ctx: CrudContext<T>): Promise<T[]> {
	const cfg = await ctx.service.getConfig();
	return ctx.getArray(cfg);
}

export async function getItem<T extends TaggedItem>(
	ctx: CrudContext<T>,
	tag: string,
): Promise<T | null> {
	const items = await getItems(ctx);
	return items.find((i) => i.tag === tag) || null;
}

export async function createItem<T extends TaggedItem>(
	ctx: CrudContext<T>,
	item: T,
	acquireLock: () => Promise<() => void>,
	validateConfig: (cfg: unknown) => Promise<ValidationResult>,
	getConfigRaw: () => Promise<string | null>,
	atomicWrite: (cfg: SingBoxConfig) => Promise<void>,
	reloadIfRunning: () => Promise<void>,
): Promise<T> {
	const release = await acquireLock();

	try {
		const cfg = await ctx.service.getConfig();
		const items = ctx.getArray(cfg);

		if (items.some((i) => i.tag === item.tag)) {
			throw new BadRequestError(`${ctx.entityName} with tag '${item.tag}' already exists`);
		}

		const newConfig: SingBoxConfig = {
			...cfg,
			[ctx.arrayKey]: [...items, item],
		};

		const validation = await validateConfig(newConfig);
		if (!validation.valid) {
			throw new ConfigValidationError(
				validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
			);
		}

		if (config.configApi.backupEnabled) {
			const currentContent = await getConfigRaw();
			if (currentContent) {
				await backupService.create(currentContent, `before-create-${ctx.entityName.toLowerCase()}`);
			}
		}

		await atomicWrite(newConfig);

		if (config.configApi.autoReload) {
			await reloadIfRunning();
		}

		logger.info(`${ctx.entityName} created`, { tag: item.tag });
		return item;
	} finally {
		release();
	}
}

export async function updateItem<T extends TaggedItem>(
	ctx: CrudContext<T>,
	tag: string,
	item: T,
	acquireLock: () => Promise<() => void>,
	validateConfig: (cfg: unknown) => Promise<ValidationResult>,
	getConfigRaw: () => Promise<string | null>,
	atomicWrite: (cfg: SingBoxConfig) => Promise<void>,
	reloadIfRunning: () => Promise<void>,
): Promise<T> {
	const release = await acquireLock();

	try {
		const cfg = await ctx.service.getConfig();
		const items = ctx.getArray(cfg);
		const index = items.findIndex((i) => i.tag === tag);

		if (index === -1) {
			throw new NotFoundError(`${ctx.entityName} with tag '${tag}' not found`);
		}

		if (item.tag !== tag && items.some((i) => i.tag === item.tag)) {
			throw new BadRequestError(`${ctx.entityName} with tag '${item.tag}' already exists`);
		}

		const newItems = [...items];
		newItems[index] = item;

		const newConfig: SingBoxConfig = {
			...cfg,
			[ctx.arrayKey]: newItems,
		};

		const validation = await validateConfig(newConfig);
		if (!validation.valid) {
			throw new ConfigValidationError(
				validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
			);
		}

		if (config.configApi.backupEnabled) {
			const currentContent = await getConfigRaw();
			if (currentContent) {
				await backupService.create(currentContent, `before-update-${ctx.entityName.toLowerCase()}`);
			}
		}

		await atomicWrite(newConfig);

		if (config.configApi.autoReload) {
			await reloadIfRunning();
		}

		logger.info(`${ctx.entityName} updated`, { tag: item.tag });
		return item;
	} finally {
		release();
	}
}

export async function patchItem<T extends TaggedItem>(
	ctx: CrudContext<T>,
	tag: string,
	patch: Partial<T>,
	acquireLock: () => Promise<() => void>,
	validateConfig: (cfg: unknown) => Promise<ValidationResult>,
	getConfigRaw: () => Promise<string | null>,
	atomicWrite: (cfg: SingBoxConfig) => Promise<void>,
	reloadIfRunning: () => Promise<void>,
): Promise<T> {
	const release = await acquireLock();

	try {
		const cfg = await ctx.service.getConfig();
		const items = ctx.getArray(cfg);
		const index = items.findIndex((i) => i.tag === tag);

		if (index === -1) {
			throw new NotFoundError(`${ctx.entityName} with tag '${tag}' not found`);
		}

		const current = items[index];
		const updated = { ...current, ...patch } as T;

		if (patch.tag && patch.tag !== tag && items.some((i) => i.tag === patch.tag)) {
			throw new BadRequestError(`${ctx.entityName} with tag '${patch.tag}' already exists`);
		}

		const newItems = [...items];
		newItems[index] = updated;

		const newConfig: SingBoxConfig = {
			...cfg,
			[ctx.arrayKey]: newItems,
		};

		const validation = await validateConfig(newConfig);
		if (!validation.valid) {
			throw new ConfigValidationError(
				validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
			);
		}

		if (config.configApi.backupEnabled) {
			const currentContent = await getConfigRaw();
			if (currentContent) {
				await backupService.create(currentContent, `before-patch-${ctx.entityName.toLowerCase()}`);
			}
		}

		await atomicWrite(newConfig);

		if (config.configApi.autoReload) {
			await reloadIfRunning();
		}

		logger.info(`${ctx.entityName} patched`, { tag: updated.tag });
		return updated;
	} finally {
		release();
	}
}

export async function deleteItem<T extends TaggedItem>(
	ctx: CrudContext<T>,
	tag: string,
	acquireLock: () => Promise<() => void>,
	validateConfig: (cfg: unknown) => Promise<ValidationResult>,
	getConfigRaw: () => Promise<string | null>,
	atomicWrite: (cfg: SingBoxConfig) => Promise<void>,
	reloadIfRunning: () => Promise<void>,
): Promise<boolean> {
	const release = await acquireLock();

	try {
		const cfg = await ctx.service.getConfig();
		const items = ctx.getArray(cfg);
		const index = items.findIndex((i) => i.tag === tag);

		if (index === -1) {
			return false;
		}

		const newItems = items.filter((i) => i.tag !== tag);

		const newConfig: SingBoxConfig = {
			...cfg,
			[ctx.arrayKey]: newItems,
		};

		const validation = await validateConfig(newConfig);
		if (!validation.valid) {
			throw new ConfigValidationError(
				validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
			);
		}

		if (config.configApi.backupEnabled) {
			const currentContent = await getConfigRaw();
			if (currentContent) {
				await backupService.create(currentContent, `before-delete-${ctx.entityName.toLowerCase()}`);
			}
		}

		await atomicWrite(newConfig);

		if (config.configApi.autoReload) {
			await reloadIfRunning();
		}

		logger.info(`${ctx.entityName} deleted`, { tag });
		return true;
	} finally {
		release();
	}
}
