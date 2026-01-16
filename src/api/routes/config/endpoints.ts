import { Response as FetsResponse, Type } from 'fets';
import {
	apiResponseSchema,
	authHeadersSchema,
	errorResponseSchema,
	genericObjectSchema,
} from '@/api/schemas';
import { handleError } from '@/api/utils';
import { configService } from '@/services';
import type { Endpoint } from '@/types/singbox-config';
import { NotFoundError } from '@/utils/errors';
import type { RouterType } from '../types';

export function registerEndpointRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/config/endpoints',
			description: 'List all endpoints (WireGuard, Tailscale)',
			tags: ['Config', 'Endpoints'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							endpoints: Type.Array(genericObjectSchema),
							total: Type.Number(),
						}),
					),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const endpoints = await configService.getEndpoints();
					return FetsResponse.json({
						success: true,
						data: {
							endpoints,
							total: endpoints.length,
						},
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'GET',
			path: '/config/endpoints/:tag',
			description: 'Get endpoint by tag',
			tags: ['Config', 'Endpoints'],
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
					const endpoint = await configService.getEndpoint(tag);
					if (!endpoint) {
						return FetsResponse.json(
							{ success: false as const, error: `Endpoint '${tag}' not found`, code: 'NOT_FOUND' },
							{ status: 404 },
						);
					}
					return FetsResponse.json({
						success: true,
						data: endpoint,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'POST',
			path: '/config/endpoints',
			description: 'Create a new endpoint (WireGuard or Tailscale)',
			tags: ['Config', 'Endpoints'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: Type.Object(
						{
							type: Type.Union([Type.Literal('wireguard'), Type.Literal('tailscale')]),
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
					const body = (await request.json()) as Endpoint;
					const endpoint = await configService.createEndpoint(body);
					return FetsResponse.json(
						{
							success: true,
							data: endpoint,
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
			path: '/config/endpoints/:tag',
			description: 'Replace an endpoint',
			tags: ['Config', 'Endpoints'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						tag: Type.String(),
					}),
					json: Type.Object(
						{
							type: Type.Union([Type.Literal('wireguard'), Type.Literal('tailscale')]),
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
					const body = (await request.json()) as Endpoint;
					const endpoint = await configService.updateEndpoint(tag, body);
					return FetsResponse.json({
						success: true,
						data: endpoint,
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
			path: '/config/endpoints/:tag',
			description: 'Partially update an endpoint',
			tags: ['Config', 'Endpoints'],
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
					const endpoint = await configService.patchEndpoint(tag, body);
					return FetsResponse.json({
						success: true,
						data: endpoint,
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
			path: '/config/endpoints/:tag',
			description: 'Delete an endpoint',
			tags: ['Config', 'Endpoints'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						tag: Type.String(),
					}),
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							deleted: Type.Boolean(),
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
					const deleted = await configService.deleteEndpoint(tag);
					if (!deleted) {
						return FetsResponse.json(
							{ success: false as const, error: `Endpoint '${tag}' not found`, code: 'NOT_FOUND' },
							{ status: 404 },
						);
					}
					return FetsResponse.json({
						success: true,
						data: { deleted: true },
					});
				} catch (error) {
					return handleError(error);
				}
			},
		});
}
