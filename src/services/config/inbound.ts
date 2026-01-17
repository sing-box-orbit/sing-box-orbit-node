import type { Inbound, SingBoxConfig } from '@/types/singbox';
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
}

export const inboundConfigService = new InboundConfigService();
