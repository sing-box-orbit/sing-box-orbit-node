import { Response as FetsResponse, Type } from 'fets';
import {
	apiResponseSchema,
	authHeadersSchema,
	errorResponseSchema,
	genericObjectSchema,
	messageResponseSchema,
} from '@/api/schemas';
import { handleError } from '@/api/utils';
import { configService, outboundConfigService } from '@/services';
import type { Outbound } from '@/types/singbox';
import { NotFoundError } from '@/utils/errors';
import type { RouterType } from '../types';

export function registerOutboundRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/config/outbounds',
			description: 'List all outbounds',
			tags: ['Config', 'Outbounds'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							outbounds: Type.Array(genericObjectSchema),
							total: Type.Number(),
						}),
					),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const outbounds = await outboundConfigService.getOutbounds();
					return FetsResponse.json({
						success: true,
						data: {
							outbounds,
							total: outbounds.length,
						},
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'GET',
			path: '/config/outbounds/:tag',
			description: 'Get outbound by tag',
			tags: ['Config', 'Outbounds'],
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
					const outbound = await outboundConfigService.getOutbound(tag);
					if (!outbound) {
						return FetsResponse.json(
							{ success: false as const, error: `Outbound '${tag}' not found`, code: 'NOT_FOUND' },
							{ status: 404 },
						);
					}
					return FetsResponse.json({
						success: true,
						data: outbound,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'POST',
			path: '/config/outbounds',
			description: 'Create a new outbound',
			tags: ['Config', 'Outbounds'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: Type.Object(
						{
							type: Type.String(),
							tag: Type.String(),
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
					const body = (await request.json()) as Outbound;
					const outbound = await outboundConfigService.createOutbound(body);
					return FetsResponse.json(
						{
							success: true,
							data: outbound,
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
			path: '/config/outbounds/:tag',
			description: 'Replace an outbound',
			tags: ['Config', 'Outbounds'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						tag: Type.String(),
					}),
					json: Type.Object(
						{
							type: Type.String(),
							tag: Type.String(),
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
					const body = (await request.json()) as Outbound;
					const outbound = await outboundConfigService.updateOutbound(tag, body);
					return FetsResponse.json({
						success: true,
						data: outbound,
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
			method: 'PATCH',
			path: '/config/outbounds/:tag',
			description: 'Partially update an outbound',
			tags: ['Config', 'Outbounds'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						tag: Type.String(),
					}),
					json: genericObjectSchema,
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
					const body = await request.json();
					const outbound = await outboundConfigService.patchOutbound(tag, body);
					return FetsResponse.json({
						success: true,
						data: outbound,
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
			path: '/config/outbounds/:tag',
			description: 'Delete an outbound',
			tags: ['Config', 'Outbounds'],
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
					const deleted = await outboundConfigService.deleteOutbound(tag);
					if (!deleted) {
						return FetsResponse.json(
							{ success: false as const, error: `Outbound '${tag}' not found`, code: 'NOT_FOUND' },
							{ status: 404 },
						);
					}
					return FetsResponse.json({
						success: true,
						data: { message: `Outbound '${tag}' deleted` },
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'POST',
			path: '/config/outbounds/:tag/test',
			description: 'Test outbound connectivity',
			tags: ['Config', 'Outbounds'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						tag: Type.String(),
					}),
					json: Type.Optional(
						Type.Object({
							url: Type.Optional(Type.String()),
							timeout: Type.Optional(Type.Number({ minimum: 100, maximum: 60000 })),
						}),
					),
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							success: Type.Boolean(),
							latency: Type.Optional(Type.Number()),
							error: Type.Optional(Type.String()),
						}),
					),
					401: errorResponseSchema,
					404: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const { tag } = request.params;
					let testUrl: string | undefined;
					let timeout: number | undefined;
					try {
						const body = await request.json();
						testUrl = body?.url;
						timeout = body?.timeout;
					} catch {
						// Body is optional, defaults are used
					}
					const result = await configService.testOutbound(tag, testUrl, timeout);
					return FetsResponse.json({
						success: true,
						data: result,
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
			method: 'GET',
			path: '/config/outbounds/:tag/latency',
			description: 'Measure outbound latency',
			tags: ['Config', 'Outbounds'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						tag: Type.String(),
					}),
					query: Type.Object({
						url: Type.Optional(Type.String()),
						timeout: Type.Optional(Type.Number({ minimum: 100, maximum: 60000 })),
						samples: Type.Optional(Type.Number({ minimum: 1, maximum: 10 })),
					}),
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							latency: Type.Union([Type.Number(), Type.Null()]),
							samples: Type.Array(Type.Number()),
							error: Type.Optional(Type.String()),
						}),
					),
					401: errorResponseSchema,
					404: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const { tag } = request.params;
					const url = new URL(request.url);
					const testUrl = url.searchParams.get('url') || undefined;
					const timeoutParam = url.searchParams.get('timeout');
					const samplesParam = url.searchParams.get('samples');
					const timeout = timeoutParam ? Number.parseInt(timeoutParam, 10) : undefined;
					const samples = samplesParam ? Number.parseInt(samplesParam, 10) : undefined;

					const result = await configService.getOutboundLatency(tag, testUrl, timeout, samples);
					return FetsResponse.json({
						success: true,
						data: result,
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
		});
}
