import { config } from '@/config';
import type { SingBoxConfig } from '@/types/singbox-config';
import { BadRequestError, ConfigValidationError, NotFoundError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { backupService } from './backup';

export interface TaggedEntity {
	tag: string;
	type?: string;
}

export type ConfigKey = keyof SingBoxConfig;

export interface CrudContext {
	getConfig: () => Promise<SingBoxConfig>;
	getConfigRaw: () => Promise<string | null>;
	validateConfig: (
		cfg: SingBoxConfig,
	) => Promise<{ valid: boolean; errors: { path: string; message: string }[] }>;
	atomicWrite: (cfg: SingBoxConfig) => Promise<void>;
	reloadIfRunning: () => Promise<void>;
	acquireLock: () => Promise<() => void>;
}

export function createTaggedCrud<T extends TaggedEntity>(
	configKey: ConfigKey,
	entityName: string,
	ctx: CrudContext,
) {
	const getArray = async (): Promise<T[]> => {
		const cfg = await ctx.getConfig();
		return (cfg[configKey] as T[] | undefined) || [];
	};

	const getOne = async (tag: string): Promise<T | null> => {
		const items = await getArray();
		return items.find((i) => i.tag === tag) || null;
	};

	const create = async (entity: T): Promise<T> => {
		const release = await ctx.acquireLock();

		try {
			const cfg = await ctx.getConfig();
			const items = (cfg[configKey] as T[] | undefined) || [];

			if (items.some((i) => i.tag === entity.tag)) {
				throw new BadRequestError(`${entityName} with tag '${entity.tag}' already exists`);
			}

			const newConfig: SingBoxConfig = {
				...cfg,
				[configKey]: [...items, entity],
			};

			const validation = await ctx.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await ctx.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, `before-create-${configKey}`);
				}
			}

			await ctx.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await ctx.reloadIfRunning();
			}

			logger.info(`${entityName} created`, { tag: entity.tag, type: entity.type });
			return entity;
		} finally {
			release();
		}
	};

	const update = async (tag: string, entity: T): Promise<T> => {
		const release = await ctx.acquireLock();

		try {
			const cfg = await ctx.getConfig();
			const items = (cfg[configKey] as T[] | undefined) || [];
			const index = items.findIndex((i) => i.tag === tag);

			if (index === -1) {
				throw new NotFoundError(`${entityName} with tag '${tag}' not found`);
			}

			if (entity.tag !== tag && items.some((i) => i.tag === entity.tag)) {
				throw new BadRequestError(`${entityName} with tag '${entity.tag}' already exists`);
			}

			const newItems = [...items];
			newItems[index] = entity;

			const newConfig: SingBoxConfig = {
				...cfg,
				[configKey]: newItems,
			};

			const validation = await ctx.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await ctx.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, `before-update-${configKey}`);
				}
			}

			await ctx.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await ctx.reloadIfRunning();
			}

			logger.info(`${entityName} updated`, { tag: entity.tag, type: entity.type });
			return entity;
		} finally {
			release();
		}
	};

	const patch = async (tag: string, patchData: Partial<T>): Promise<T> => {
		const release = await ctx.acquireLock();

		try {
			const cfg = await ctx.getConfig();
			const items = (cfg[configKey] as T[] | undefined) || [];
			const index = items.findIndex((i) => i.tag === tag);

			if (index === -1) {
				throw new NotFoundError(`${entityName} with tag '${tag}' not found`);
			}

			const current = items[index];
			const updated = { ...current, ...patchData } as T;

			if (patchData.tag && patchData.tag !== tag && items.some((i) => i.tag === patchData.tag)) {
				throw new BadRequestError(`${entityName} with tag '${patchData.tag}' already exists`);
			}

			const newItems = [...items];
			newItems[index] = updated;

			const newConfig: SingBoxConfig = {
				...cfg,
				[configKey]: newItems,
			};

			const validation = await ctx.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await ctx.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, `before-patch-${configKey}`);
				}
			}

			await ctx.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await ctx.reloadIfRunning();
			}

			logger.info(`${entityName} patched`, { tag: updated.tag, type: updated.type });
			return updated;
		} finally {
			release();
		}
	};

	const remove = async (tag: string): Promise<boolean> => {
		const release = await ctx.acquireLock();

		try {
			const cfg = await ctx.getConfig();
			const items = (cfg[configKey] as T[] | undefined) || [];
			const index = items.findIndex((i) => i.tag === tag);

			if (index === -1) {
				return false;
			}

			const newItems = items.filter((i) => i.tag !== tag);

			const newConfig: SingBoxConfig = {
				...cfg,
				[configKey]: newItems,
			};

			const validation = await ctx.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await ctx.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, `before-delete-${configKey}`);
				}
			}

			await ctx.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await ctx.reloadIfRunning();
			}

			logger.info(`${entityName} deleted`, { tag });
			return true;
		} finally {
			release();
		}
	};

	return {
		getAll: getArray,
		getOne,
		create,
		update,
		patch,
		delete: remove,
	};
}

export type NestedConfigPath = 'route.rules' | 'route.rule_set' | 'dns.servers' | 'dns.rules';

export interface NestedCrudOptions {
	parentKey: 'route' | 'dns';
	arrayKey: string;
	entityName: string;
}

export function createNestedTaggedCrud<T extends TaggedEntity>(
	options: NestedCrudOptions,
	ctx: CrudContext,
) {
	const { parentKey, arrayKey, entityName } = options;

	const getParent = async () => {
		const cfg = await ctx.getConfig();
		return (cfg[parentKey] as Record<string, unknown> | undefined) || {};
	};

	const getArray = async (): Promise<T[]> => {
		const parent = await getParent();
		return (parent[arrayKey] as T[] | undefined) || [];
	};

	const getOne = async (tag: string): Promise<T | null> => {
		const items = await getArray();
		return items.find((i) => i.tag === tag) || null;
	};

	const create = async (entity: T): Promise<T> => {
		const release = await ctx.acquireLock();

		try {
			const cfg = await ctx.getConfig();
			const parent = (cfg[parentKey] as Record<string, unknown> | undefined) || {};
			const items = (parent[arrayKey] as T[] | undefined) || [];

			if (items.some((i) => i.tag === entity.tag)) {
				throw new BadRequestError(`${entityName} with tag '${entity.tag}' already exists`);
			}

			const newConfig: SingBoxConfig = {
				...cfg,
				[parentKey]: {
					...parent,
					[arrayKey]: [...items, entity],
				},
			};

			const validation = await ctx.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await ctx.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, `before-create-${parentKey}-${arrayKey}`);
				}
			}

			await ctx.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await ctx.reloadIfRunning();
			}

			logger.info(`${entityName} created`, { tag: entity.tag, type: entity.type });
			return entity;
		} finally {
			release();
		}
	};

	const update = async (tag: string, entity: T): Promise<T> => {
		const release = await ctx.acquireLock();

		try {
			const cfg = await ctx.getConfig();
			const parent = (cfg[parentKey] as Record<string, unknown> | undefined) || {};
			const items = (parent[arrayKey] as T[] | undefined) || [];
			const index = items.findIndex((i) => i.tag === tag);

			if (index === -1) {
				throw new NotFoundError(`${entityName} with tag '${tag}' not found`);
			}

			if (entity.tag !== tag && items.some((i) => i.tag === entity.tag)) {
				throw new BadRequestError(`${entityName} with tag '${entity.tag}' already exists`);
			}

			const newItems = [...items];
			newItems[index] = entity;

			const newConfig: SingBoxConfig = {
				...cfg,
				[parentKey]: {
					...parent,
					[arrayKey]: newItems,
				},
			};

			const validation = await ctx.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await ctx.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, `before-update-${parentKey}-${arrayKey}`);
				}
			}

			await ctx.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await ctx.reloadIfRunning();
			}

			logger.info(`${entityName} updated`, { tag: entity.tag, type: entity.type });
			return entity;
		} finally {
			release();
		}
	};

	const patch = async (tag: string, patchData: Partial<T>): Promise<T> => {
		const release = await ctx.acquireLock();

		try {
			const cfg = await ctx.getConfig();
			const parent = (cfg[parentKey] as Record<string, unknown> | undefined) || {};
			const items = (parent[arrayKey] as T[] | undefined) || [];
			const index = items.findIndex((i) => i.tag === tag);

			if (index === -1) {
				throw new NotFoundError(`${entityName} with tag '${tag}' not found`);
			}

			const current = items[index];
			const updated = { ...current, ...patchData } as T;

			if (patchData.tag && patchData.tag !== tag && items.some((i) => i.tag === patchData.tag)) {
				throw new BadRequestError(`${entityName} with tag '${patchData.tag}' already exists`);
			}

			const newItems = [...items];
			newItems[index] = updated;

			const newConfig: SingBoxConfig = {
				...cfg,
				[parentKey]: {
					...parent,
					[arrayKey]: newItems,
				},
			};

			const validation = await ctx.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await ctx.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, `before-patch-${parentKey}-${arrayKey}`);
				}
			}

			await ctx.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await ctx.reloadIfRunning();
			}

			logger.info(`${entityName} patched`, { tag: updated.tag, type: updated.type });
			return updated;
		} finally {
			release();
		}
	};

	const remove = async (tag: string): Promise<boolean> => {
		const release = await ctx.acquireLock();

		try {
			const cfg = await ctx.getConfig();
			const parent = (cfg[parentKey] as Record<string, unknown> | undefined) || {};
			const items = (parent[arrayKey] as T[] | undefined) || [];
			const index = items.findIndex((i) => i.tag === tag);

			if (index === -1) {
				return false;
			}

			const newItems = items.filter((i) => i.tag !== tag);

			const newConfig: SingBoxConfig = {
				...cfg,
				[parentKey]: {
					...parent,
					[arrayKey]: newItems,
				},
			};

			const validation = await ctx.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await ctx.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, `before-delete-${parentKey}-${arrayKey}`);
				}
			}

			await ctx.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await ctx.reloadIfRunning();
			}

			logger.info(`${entityName} deleted`, { tag });
			return true;
		} finally {
			release();
		}
	};

	return {
		getAll: getArray,
		getOne,
		create,
		update,
		patch,
		delete: remove,
	};
}

export function createIndexedCrud<T>(options: NestedCrudOptions, ctx: CrudContext) {
	const { parentKey, arrayKey, entityName } = options;

	const getParent = async () => {
		const cfg = await ctx.getConfig();
		return (cfg[parentKey] as Record<string, unknown> | undefined) || {};
	};

	const getArray = async (): Promise<T[]> => {
		const parent = await getParent();
		return (parent[arrayKey] as T[] | undefined) || [];
	};

	const getByIndex = async (index: number): Promise<T | null> => {
		const items = await getArray();
		return items[index] ?? null;
	};

	const create = async (entity: T): Promise<{ item: T; index: number }> => {
		const release = await ctx.acquireLock();

		try {
			const cfg = await ctx.getConfig();
			const parent = (cfg[parentKey] as Record<string, unknown> | undefined) || {};
			const items = (parent[arrayKey] as T[] | undefined) || [];

			const newItems = [...items, entity];
			const newIndex = newItems.length - 1;

			const newConfig: SingBoxConfig = {
				...cfg,
				[parentKey]: {
					...parent,
					[arrayKey]: newItems,
				},
			};

			const validation = await ctx.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await ctx.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, `before-create-${parentKey}-${arrayKey}`);
				}
			}

			await ctx.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await ctx.reloadIfRunning();
			}

			logger.info(`${entityName} created`, { index: newIndex });
			return { item: entity, index: newIndex };
		} finally {
			release();
		}
	};

	const update = async (index: number, entity: T): Promise<T> => {
		const release = await ctx.acquireLock();

		try {
			const cfg = await ctx.getConfig();
			const parent = (cfg[parentKey] as Record<string, unknown> | undefined) || {};
			const items = (parent[arrayKey] as T[] | undefined) || [];

			if (index < 0 || index >= items.length) {
				throw new NotFoundError(`${entityName} at index ${index} not found`);
			}

			const newItems = [...items];
			newItems[index] = entity;

			const newConfig: SingBoxConfig = {
				...cfg,
				[parentKey]: {
					...parent,
					[arrayKey]: newItems,
				},
			};

			const validation = await ctx.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await ctx.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, `before-update-${parentKey}-${arrayKey}`);
				}
			}

			await ctx.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await ctx.reloadIfRunning();
			}

			logger.info(`${entityName} updated`, { index });
			return entity;
		} finally {
			release();
		}
	};

	const patch = async (index: number, patchData: Partial<T>): Promise<T> => {
		const release = await ctx.acquireLock();

		try {
			const cfg = await ctx.getConfig();
			const parent = (cfg[parentKey] as Record<string, unknown> | undefined) || {};
			const items = (parent[arrayKey] as T[] | undefined) || [];

			if (index < 0 || index >= items.length) {
				throw new NotFoundError(`${entityName} at index ${index} not found`);
			}

			const current = items[index];
			const updated = { ...current, ...patchData } as T;

			const newItems = [...items];
			newItems[index] = updated;

			const newConfig: SingBoxConfig = {
				...cfg,
				[parentKey]: {
					...parent,
					[arrayKey]: newItems,
				},
			};

			const validation = await ctx.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await ctx.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, `before-patch-${parentKey}-${arrayKey}`);
				}
			}

			await ctx.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await ctx.reloadIfRunning();
			}

			logger.info(`${entityName} patched`, { index });
			return updated;
		} finally {
			release();
		}
	};

	const remove = async (index: number): Promise<boolean> => {
		const release = await ctx.acquireLock();

		try {
			const cfg = await ctx.getConfig();
			const parent = (cfg[parentKey] as Record<string, unknown> | undefined) || {};
			const items = (parent[arrayKey] as T[] | undefined) || [];

			if (index < 0 || index >= items.length) {
				return false;
			}

			const newItems = items.filter((_, i) => i !== index);

			const newConfig: SingBoxConfig = {
				...cfg,
				[parentKey]: {
					...parent,
					[arrayKey]: newItems,
				},
			};

			const validation = await ctx.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await ctx.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, `before-delete-${parentKey}-${arrayKey}`);
				}
			}

			await ctx.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await ctx.reloadIfRunning();
			}

			logger.info(`${entityName} deleted`, { index });
			return true;
		} finally {
			release();
		}
	};

	const reorder = async (fromIndex: number, toIndex: number): Promise<T[]> => {
		const release = await ctx.acquireLock();

		try {
			const cfg = await ctx.getConfig();
			const parent = (cfg[parentKey] as Record<string, unknown> | undefined) || {};
			const items = (parent[arrayKey] as T[] | undefined) || [];

			if (fromIndex < 0 || fromIndex >= items.length) {
				throw new BadRequestError(`Source index ${fromIndex} is out of bounds`);
			}
			if (toIndex < 0 || toIndex >= items.length) {
				throw new BadRequestError(`Target index ${toIndex} is out of bounds`);
			}

			const newItems = [...items];
			const [moved] = newItems.splice(fromIndex, 1);
			newItems.splice(toIndex, 0, moved);

			const newConfig: SingBoxConfig = {
				...cfg,
				[parentKey]: {
					...parent,
					[arrayKey]: newItems,
				},
			};

			const validation = await ctx.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await ctx.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, `before-reorder-${parentKey}-${arrayKey}`);
				}
			}

			await ctx.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await ctx.reloadIfRunning();
			}

			logger.info(`${entityName} reordered`, { fromIndex, toIndex });
			return newItems;
		} finally {
			release();
		}
	};

	return {
		getAll: getArray,
		getByIndex,
		create,
		update,
		patch,
		delete: remove,
		reorder,
	};
}
