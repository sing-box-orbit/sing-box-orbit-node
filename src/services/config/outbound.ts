import type { Outbound, SingBoxConfig } from '@/types/singbox';
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

export class OutboundConfigService extends BaseConfigService {
	private getCrudContext(): CrudContext<Outbound> {
		return {
			service: this,
			arrayKey: 'outbounds',
			entityName: 'Outbound',
			getArray: (cfg: SingBoxConfig) => (cfg.outbounds || []) as Outbound[],
		};
	}

	async getOutbounds(): Promise<Outbound[]> {
		return getItems(this.getCrudContext());
	}

	async getOutbound(tag: string): Promise<Outbound | null> {
		return getItem(this.getCrudContext(), tag);
	}

	async createOutbound(outbound: Outbound): Promise<Outbound> {
		return createItem(
			this.getCrudContext(),
			outbound,
			() => this.acquireLock(),
			(cfg) => this.validateConfig(cfg),
			() => this.getConfigRaw(),
			(cfg) => this.atomicWrite(cfg),
			() => this.reloadIfRunning(),
		);
	}

	async updateOutbound(tag: string, outbound: Outbound): Promise<Outbound> {
		return updateItem(
			this.getCrudContext(),
			tag,
			outbound,
			() => this.acquireLock(),
			(cfg) => this.validateConfig(cfg),
			() => this.getConfigRaw(),
			(cfg) => this.atomicWrite(cfg),
			() => this.reloadIfRunning(),
		);
	}

	async patchOutbound(tag: string, patch: Partial<Outbound>): Promise<Outbound> {
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

	async deleteOutbound(tag: string): Promise<boolean> {
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

export const outboundConfigService = new OutboundConfigService();
