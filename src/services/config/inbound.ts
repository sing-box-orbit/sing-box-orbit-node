import type { Inbound, SingBoxConfig } from '@/types/singbox';
import { NotFoundError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { BaseConfigService } from './base';
import {
	type CrudContext,
	createItem,
	deleteItem,
	getItem,
	getItems,
	patchItem,
	updateItem,
} from './crud-helpers';

export interface InboundUser {
	name: string;
	uuid?: string;
	password?: string;
	flow?: string;
	alterId?: number;
	[key: string]: unknown;
}

export class InboundConfigService extends BaseConfigService {
	private getCrudContext(): CrudContext<Inbound> {
		return {
			service: this,
			arrayKey: 'inbounds',
			entityName: 'Inbound',
			getArray: (cfg: SingBoxConfig) => (cfg.inbounds || []) as Inbound[],
		};
	}

	async getInbounds(): Promise<Inbound[]> {
		return getItems(this.getCrudContext());
	}

	async getInbound(tag: string): Promise<Inbound | null> {
		return getItem(this.getCrudContext(), tag);
	}

	async createInbound(inbound: Inbound): Promise<Inbound> {
		return createItem(
			this.getCrudContext(),
			inbound,
			() => this.acquireLock(),
			(cfg) => this.validateConfig(cfg),
			() => this.getConfigRaw(),
			(cfg) => this.atomicWrite(cfg),
			() => this.reloadIfRunning(),
		);
	}

	async updateInbound(tag: string, inbound: Inbound): Promise<Inbound> {
		return updateItem(
			this.getCrudContext(),
			tag,
			inbound,
			() => this.acquireLock(),
			(cfg) => this.validateConfig(cfg),
			() => this.getConfigRaw(),
			(cfg) => this.atomicWrite(cfg),
			() => this.reloadIfRunning(),
		);
	}

	async patchInbound(tag: string, patch: Partial<Inbound>): Promise<Inbound> {
		return patchItem(
			this.getCrudContext(),
			tag,
			patch,
			() => this.acquireLock(),
			(cfg) => this.validateConfig(cfg),
			() => this.getConfigRaw(),
			(cfg) => this.atomicWrite(cfg),
			() => this.reloadIfRunning(),
		);
	}

	async deleteInbound(tag: string): Promise<boolean> {
		return deleteItem(
			this.getCrudContext(),
			tag,
			() => this.acquireLock(),
			(cfg) => this.validateConfig(cfg),
			() => this.getConfigRaw(),
			(cfg) => this.atomicWrite(cfg),
			() => this.reloadIfRunning(),
		);
	}

	/**
	 * Get users from a specific inbound
	 */
	async getInboundUsers(tag: string): Promise<InboundUser[]> {
		const inbound = await this.getInbound(tag);
		if (!inbound) {
			throw new NotFoundError(`Inbound '${tag}' not found`);
		}

		// Users can be in different places depending on inbound type
		const users = (inbound as unknown as { users?: InboundUser[] }).users;
		return users || [];
	}

	/**
	 * Replace all users in a specific inbound
	 * This is the main method for backend to sync client configs
	 */
	async setInboundUsers(
		tag: string,
		users: InboundUser[],
		options: { autoReload?: boolean } = {},
	): Promise<{ usersCount: number; reloadRequired: boolean }> {
		const release = await this.acquireLock();

		try {
			const config = await this.getConfig();
			const inbounds = (config.inbounds || []) as Inbound[];
			const index = inbounds.findIndex((i) => (i as { tag?: string }).tag === tag);

			if (index === -1) {
				throw new NotFoundError(`Inbound '${tag}' not found`);
			}

			// Update users in the inbound
			const updatedInbound = {
				...inbounds[index],
				users,
			} as Inbound;

			const newInbounds = [...inbounds];
			newInbounds[index] = updatedInbound;

			const newConfig = {
				...config,
				inbounds: newInbounds,
			};

			// Validate before applying
			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new Error(validation.errors.map((e) => e.message).join('; '));
			}

			// Write config
			await this.atomicWrite(newConfig);

			logger.info('Inbound users updated', { tag, usersCount: users.length });

			// Reload if requested
			if (options.autoReload !== false) {
				await this.reloadIfRunning();
			}

			return {
				usersCount: users.length,
				reloadRequired: options.autoReload === false,
			};
		} finally {
			release();
		}
	}

	/**
	 * Add a single user to an inbound
	 */
	async addInboundUser(tag: string, user: InboundUser): Promise<InboundUser[]> {
		const currentUsers = await this.getInboundUsers(tag);

		// Check if user already exists (by name or uuid)
		const exists = currentUsers.some(
			(u) => u.name === user.name || (u.uuid && user.uuid && u.uuid === user.uuid),
		);

		if (exists) {
			throw new Error(`User '${user.name}' already exists in inbound '${tag}'`);
		}

		const newUsers = [...currentUsers, user];
		await this.setInboundUsers(tag, newUsers);

		return newUsers;
	}

	/**
	 * Remove a user from an inbound by name
	 */
	async removeInboundUser(tag: string, userName: string): Promise<InboundUser[]> {
		const currentUsers = await this.getInboundUsers(tag);
		const newUsers = currentUsers.filter((u) => u.name !== userName);

		if (newUsers.length === currentUsers.length) {
			throw new NotFoundError(`User '${userName}' not found in inbound '${tag}'`);
		}

		await this.setInboundUsers(tag, newUsers);

		return newUsers;
	}
}

export const inboundConfigService = new InboundConfigService();
