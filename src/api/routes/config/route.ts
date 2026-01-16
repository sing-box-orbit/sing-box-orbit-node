import { Response as FetsResponse, Type } from 'fets';
import {
	apiResponseSchema,
	authHeadersSchema,
	errorResponseSchema,
	genericObjectSchema,
	messageResponseSchema,
} from '@/api/schemas';
import { handleError } from '@/api/utils';
import { routeConfigService } from '@/services';
import type { RouteConfig, RouteRule } from '@/types/singbox-config';
import { NotFoundError } from '@/utils/errors';
import type { RouterType } from '../types';

export function registerRouteRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/config/route',
			description: 'Get route configuration',
			tags: ['Config', 'Route'],
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
					const route = await routeConfigService.getRoute();
					return FetsResponse.json({
						success: true,
						data: route,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PUT',
			path: '/config/route',
			description: 'Replace route configuration',
			tags: ['Config', 'Route'],
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
					const body = (await request.json()) as RouteConfig;
					const route = await routeConfigService.setRoute(body);
					return FetsResponse.json({
						success: true,
						data: route,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PATCH',
			path: '/config/route',
			description: 'Partially update route configuration',
			tags: ['Config', 'Route'],
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
					const body = (await request.json()) as Partial<RouteConfig>;
					const route = await routeConfigService.patchRoute(body);
					return FetsResponse.json({
						success: true,
						data: route,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'GET',
			path: '/config/route/rules',
			description: 'List all route rules',
			tags: ['Config', 'Route', 'Rules'],
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
					const rules = await routeConfigService.getRouteRules();
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
			path: '/config/route/rules/:index',
			description: 'Get route rule by index',
			tags: ['Config', 'Route', 'Rules'],
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
					const rule = await routeConfigService.getRouteRule(index);
					if (!rule) {
						return FetsResponse.json(
							{
								success: false as const,
								error: `Route rule at index ${index} not found`,
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
			path: '/config/route/rules',
			description: 'Create a new route rule',
			tags: ['Config', 'Route', 'Rules'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: Type.Object(
						{
							outbound: Type.String(),
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
					const body = (await request.json()) as RouteRule;
					const result = await routeConfigService.createRouteRule(body);
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
			path: '/config/route/rules/:index',
			description: 'Replace a route rule',
			tags: ['Config', 'Route', 'Rules'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						index: Type.String(),
					}),
					json: Type.Object(
						{
							outbound: Type.String(),
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
					const body = (await request.json()) as RouteRule;
					const rule = await routeConfigService.updateRouteRule(index, body);
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
			path: '/config/route/rules/:index',
			description: 'Delete a route rule',
			tags: ['Config', 'Route', 'Rules'],
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
					const deleted = await routeConfigService.deleteRouteRule(index);
					if (!deleted) {
						return FetsResponse.json(
							{
								success: false as const,
								error: `Route rule at index ${index} not found`,
								code: 'NOT_FOUND',
							},
							{ status: 404 },
						);
					}
					return FetsResponse.json({
						success: true,
						data: { message: `Route rule at index ${index} deleted` },
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'POST',
			path: '/config/route/rules/reorder',
			description: 'Reorder route rules',
			tags: ['Config', 'Route', 'Rules'],
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
					const rules = await routeConfigService.reorderRouteRules(fromIndex, toIndex);
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
