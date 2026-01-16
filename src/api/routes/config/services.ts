import { Response as FetsResponse, Type } from 'fets';
import {
	apiResponseSchema,
	authHeadersSchema,
	errorResponseSchema,
	genericObjectSchema,
} from '@/api/schemas';
import { handleError } from '@/api/utils';
import { configService } from '@/services';
import type { Service } from '@/types/singbox-config';
import { NotFoundError } from '@/utils/errors';
import type { RouterType } from '../types';

export function registerServiceRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/config/services',
			description: 'List all services (CCM, DERP, OCM, Resolved, SSM-API)',
			tags: ['Config', 'Services'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							services: Type.Array(genericObjectSchema),
							total: Type.Number(),
						}),
					),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const services = await configService.getServices();
					return FetsResponse.json({
						success: true,
						data: {
							services,
							total: services.length,
						},
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'GET',
			path: '/config/services/:tag',
			description: 'Get service by tag',
			tags: ['Config', 'Services'],
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
					const service = await configService.getService(tag);
					if (!service) {
						return FetsResponse.json(
							{ success: false as const, error: `Service '${tag}' not found`, code: 'NOT_FOUND' },
							{ status: 404 },
						);
					}
					return FetsResponse.json({
						success: true,
						data: service,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'POST',
			path: '/config/services',
			description: 'Create a new service (CCM, DERP, OCM, Resolved, SSM-API)',
			tags: ['Config', 'Services'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: Type.Object(
						{
							type: Type.Union([
								Type.Literal('ccm'),
								Type.Literal('derp'),
								Type.Literal('ocm'),
								Type.Literal('resolved'),
								Type.Literal('ssm-api'),
							]),
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
					const body = (await request.json()) as Service;
					const service = await configService.createService(body);
					return FetsResponse.json(
						{
							success: true,
							data: service,
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
			path: '/config/services/:tag',
			description: 'Replace a service',
			tags: ['Config', 'Services'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						tag: Type.String(),
					}),
					json: Type.Object(
						{
							type: Type.Union([
								Type.Literal('ccm'),
								Type.Literal('derp'),
								Type.Literal('ocm'),
								Type.Literal('resolved'),
								Type.Literal('ssm-api'),
							]),
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
					const body = (await request.json()) as Service;
					const service = await configService.updateService(tag, body);
					return FetsResponse.json({
						success: true,
						data: service,
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
			path: '/config/services/:tag',
			description: 'Partially update a service',
			tags: ['Config', 'Services'],
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
					const service = await configService.patchService(tag, body);
					return FetsResponse.json({
						success: true,
						data: service,
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
			path: '/config/services/:tag',
			description: 'Delete a service',
			tags: ['Config', 'Services'],
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
					const deleted = await configService.deleteService(tag);
					if (!deleted) {
						return FetsResponse.json(
							{ success: false as const, error: `Service '${tag}' not found`, code: 'NOT_FOUND' },
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
