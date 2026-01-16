import { Response as FetsResponse, Type } from 'fets';
import {
	apiResponseSchema,
	authHeadersSchema,
	errorResponseSchema,
	genericObjectSchema,
	messageResponseSchema,
} from '@/api/schemas';
import { handleError } from '@/api/utils';
import { dnsConfigService } from '@/services';
import type { DnsConfig, DnsRule, DnsServer } from '@/types/singbox-config';
import { NotFoundError } from '@/utils/errors';
import type { RouterType } from '../types';

export function registerDnsRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/config/dns',
			description: 'Get DNS configuration',
			tags: ['Config', 'DNS'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(genericObjectSchema),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const dns = await dnsConfigService.getDns();
					return FetsResponse.json({
						success: true,
						data: dns,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PUT',
			path: '/config/dns',
			description: 'Replace DNS configuration',
			tags: ['Config', 'DNS'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: genericObjectSchema,
				},
				responses: {
					200: apiResponseSchema(genericObjectSchema),
					400: errorResponseSchema,
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const body = (await request.json()) as DnsConfig;
					const dns = await dnsConfigService.setDns(body);
					return FetsResponse.json({
						success: true,
						data: dns,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PATCH',
			path: '/config/dns',
			description: 'Partially update DNS configuration',
			tags: ['Config', 'DNS'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: genericObjectSchema,
				},
				responses: {
					200: apiResponseSchema(genericObjectSchema),
					400: errorResponseSchema,
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const body = (await request.json()) as Partial<DnsConfig>;
					const dns = await dnsConfigService.patchDns(body);
					return FetsResponse.json({
						success: true,
						data: dns,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'GET',
			path: '/config/dns/servers',
			description: 'List all DNS servers',
			tags: ['Config', 'DNS', 'Servers'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							servers: Type.Array(genericObjectSchema),
							total: Type.Number(),
						}),
					),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const servers = await dnsConfigService.getDnsServers();
					return FetsResponse.json({
						success: true,
						data: {
							servers,
							total: servers.length,
						},
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'GET',
			path: '/config/dns/servers/:tag',
			description: 'Get DNS server by tag',
			tags: ['Config', 'DNS', 'Servers'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						tag: Type.String(),
					}),
				},
				responses: {
					200: apiResponseSchema(genericObjectSchema),
					401: errorResponseSchema,
					404: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const { tag } = request.params;
					const server = await dnsConfigService.getDnsServer(tag);
					if (!server) {
						return FetsResponse.json(
							{
								success: false as const,
								error: `DNS server '${tag}' not found`,
								code: 'NOT_FOUND',
							},
							{ status: 404 },
						);
					}
					return FetsResponse.json({
						success: true,
						data: server,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'POST',
			path: '/config/dns/servers',
			description: 'Create a new DNS server',
			tags: ['Config', 'DNS', 'Servers'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: Type.Object(
						{
							tag: Type.String(),
							address: Type.String(),
						},
						{ additionalProperties: true },
					),
				},
				responses: {
					201: apiResponseSchema(genericObjectSchema),
					400: errorResponseSchema,
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const body = (await request.json()) as DnsServer;
					const server = await dnsConfigService.createDnsServer(body);
					return FetsResponse.json(
						{
							success: true,
							data: server,
						},
						{ status: 201 },
					);
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PUT',
			path: '/config/dns/servers/:tag',
			description: 'Replace a DNS server',
			tags: ['Config', 'DNS', 'Servers'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						tag: Type.String(),
					}),
					json: Type.Object(
						{
							tag: Type.String(),
							address: Type.String(),
						},
						{ additionalProperties: true },
					),
				},
				responses: {
					200: apiResponseSchema(genericObjectSchema),
					400: errorResponseSchema,
					401: errorResponseSchema,
					404: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const { tag } = request.params;
					const body = (await request.json()) as DnsServer;
					const server = await dnsConfigService.updateDnsServer(tag, body);
					return FetsResponse.json({
						success: true,
						data: server,
					});
				} catch (error) {
					if (error instanceof NotFoundError) {
						return FetsResponse.json(
							{ success: false as const, error: error.message, code: 'NOT_FOUND' },
							{ status: 404 },
						);
					}
					return handleError(error);
				}
			},
		})
		.route({
			method: 'DELETE',
			path: '/config/dns/servers/:tag',
			description: 'Delete a DNS server',
			tags: ['Config', 'DNS', 'Servers'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						tag: Type.String(),
					}),
				},
				responses: {
					200: apiResponseSchema(messageResponseSchema),
					401: errorResponseSchema,
					404: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const { tag } = request.params;
					const deleted = await dnsConfigService.deleteDnsServer(tag);
					if (!deleted) {
						return FetsResponse.json(
							{
								success: false as const,
								error: `DNS server '${tag}' not found`,
								code: 'NOT_FOUND',
							},
							{ status: 404 },
						);
					}
					return FetsResponse.json({
						success: true,
						data: { message: `DNS server '${tag}' deleted` },
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'GET',
			path: '/config/dns/rules',
			description: 'List all DNS rules',
			tags: ['Config', 'DNS', 'Rules'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							rules: Type.Array(genericObjectSchema),
							total: Type.Number(),
						}),
					),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const rules = await dnsConfigService.getDnsRules();
					return FetsResponse.json({
						success: true,
						data: {
							rules,
							total: rules.length,
						},
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'GET',
			path: '/config/dns/rules/:index',
			description: 'Get DNS rule by index',
			tags: ['Config', 'DNS', 'Rules'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						index: Type.String(),
					}),
				},
				responses: {
					200: apiResponseSchema(genericObjectSchema),
					400: errorResponseSchema,
					401: errorResponseSchema,
					404: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const index = Number.parseInt(request.params.index, 10);
					if (Number.isNaN(index)) {
						return FetsResponse.json(
							{ success: false as const, error: 'Invalid index', code: 'BAD_REQUEST' },
							{ status: 400 },
						);
					}
					const rule = await dnsConfigService.getDnsRule(index);
					if (!rule) {
						return FetsResponse.json(
							{
								success: false as const,
								error: `DNS rule at index ${index} not found`,
								code: 'NOT_FOUND',
							},
							{ status: 404 },
						);
					}
					return FetsResponse.json({
						success: true,
						data: rule,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'POST',
			path: '/config/dns/rules',
			description: 'Create a new DNS rule',
			tags: ['Config', 'DNS', 'Rules'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: Type.Object(
						{
							server: Type.String(),
						},
						{ additionalProperties: true },
					),
				},
				responses: {
					201: apiResponseSchema(
						Type.Object({
							rule: genericObjectSchema,
							index: Type.Number(),
						}),
					),
					400: errorResponseSchema,
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const body = (await request.json()) as DnsRule;
					const result = await dnsConfigService.createDnsRule(body);
					return FetsResponse.json(
						{
							success: true,
							data: result,
						},
						{ status: 201 },
					);
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PUT',
			path: '/config/dns/rules/:index',
			description: 'Replace a DNS rule',
			tags: ['Config', 'DNS', 'Rules'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						index: Type.String(),
					}),
					json: Type.Object(
						{
							server: Type.String(),
						},
						{ additionalProperties: true },
					),
				},
				responses: {
					200: apiResponseSchema(genericObjectSchema),
					400: errorResponseSchema,
					401: errorResponseSchema,
					404: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const index = Number.parseInt(request.params.index, 10);
					if (Number.isNaN(index)) {
						return FetsResponse.json(
							{ success: false as const, error: 'Invalid index', code: 'BAD_REQUEST' },
							{ status: 400 },
						);
					}
					const body = (await request.json()) as DnsRule;
					const rule = await dnsConfigService.updateDnsRule(index, body);
					return FetsResponse.json({
						success: true,
						data: rule,
					});
				} catch (error) {
					if (error instanceof NotFoundError) {
						return FetsResponse.json(
							{ success: false as const, error: error.message, code: 'NOT_FOUND' },
							{ status: 404 },
						);
					}
					return handleError(error);
				}
			},
		})
		.route({
			method: 'DELETE',
			path: '/config/dns/rules/:index',
			description: 'Delete a DNS rule',
			tags: ['Config', 'DNS', 'Rules'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						index: Type.String(),
					}),
				},
				responses: {
					200: apiResponseSchema(messageResponseSchema),
					400: errorResponseSchema,
					401: errorResponseSchema,
					404: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const index = Number.parseInt(request.params.index, 10);
					if (Number.isNaN(index)) {
						return FetsResponse.json(
							{ success: false as const, error: 'Invalid index', code: 'BAD_REQUEST' },
							{ status: 400 },
						);
					}
					const deleted = await dnsConfigService.deleteDnsRule(index);
					if (!deleted) {
						return FetsResponse.json(
							{
								success: false as const,
								error: `DNS rule at index ${index} not found`,
								code: 'NOT_FOUND',
							},
							{ status: 404 },
						);
					}
					return FetsResponse.json({
						success: true,
						data: { message: `DNS rule at index ${index} deleted` },
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'POST',
			path: '/config/dns/rules/reorder',
			description: 'Reorder DNS rules',
			tags: ['Config', 'DNS', 'Rules'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: Type.Object({
						fromIndex: Type.Number(),
						toIndex: Type.Number(),
					}),
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							rules: Type.Array(genericObjectSchema),
							total: Type.Number(),
						}),
					),
					400: errorResponseSchema,
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const { fromIndex, toIndex } = await request.json();
					const rules = await dnsConfigService.reorderDnsRules(fromIndex, toIndex);
					return FetsResponse.json({
						success: true,
						data: {
							rules,
							total: rules.length,
						},
					});
				} catch (error) {
					return handleError(error);
				}
			},
		});
}
