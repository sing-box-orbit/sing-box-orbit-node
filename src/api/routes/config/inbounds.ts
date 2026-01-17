import { Response as FetsResponse, Type } from 'fets';
import {
	apiResponseSchema,
	authHeadersSchema,
	errorResponseSchema,
	genericObjectSchema,
	messageResponseSchema,
} from '@/api/schemas';
import { handleError } from '@/api/utils';
import { inboundConfigService } from '@/services';
import type { Inbound } from '@/types/singbox';
import { NotFoundError } from '@/utils/errors';
import type { RouterType } from '../types';

export function registerInboundRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/config/inbounds',
			description: 'List all inbounds',
			tags: ['Config', 'Inbounds'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							inbounds: Type.Array(genericObjectSchema),
							total: Type.Number(),
						}),
					),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const inbounds = await inboundConfigService.getInbounds();
					return FetsResponse.json({
						success: true,
						data: {
							inbounds,
							total: inbounds.length,
						},
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'GET',
			path: '/config/inbounds/:tag',
			description: 'Get inbound by tag',
			tags: ['Config', 'Inbounds'],
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
					const inbound = await inboundConfigService.getInbound(tag);
					if (!inbound) {
						return FetsResponse.json(
							{ success: false as const, error: `Inbound '${tag}' not found`, code: 'NOT_FOUND' },
							{ status: 404 },
						);
					}
					return FetsResponse.json({
						success: true,
						data: inbound,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'POST',
			path: '/config/inbounds',
			description: 'Create a new inbound',
			tags: ['Config', 'Inbounds'],
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
					const body = (await request.json()) as Inbound;
					const inbound = await inboundConfigService.createInbound(body);
					return FetsResponse.json(
						{
							success: true,
							data: inbound,
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
			path: '/config/inbounds/:tag',
			description: 'Replace an inbound',
			tags: ['Config', 'Inbounds'],
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
					const body = (await request.json()) as Inbound;
					const inbound = await inboundConfigService.updateInbound(tag, body);
					return FetsResponse.json({
						success: true,
						data: inbound,
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
			path: '/config/inbounds/:tag',
			description: 'Partially update an inbound',
			tags: ['Config', 'Inbounds'],
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
					const inbound = await inboundConfigService.patchInbound(tag, body);
					return FetsResponse.json({
						success: true,
						data: inbound,
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
			path: '/config/inbounds/:tag',
			description: 'Delete an inbound',
			tags: ['Config', 'Inbounds'],
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
					const deleted = await inboundConfigService.deleteInbound(tag);
					if (!deleted) {
						return FetsResponse.json(
							{ success: false as const, error: `Inbound '${tag}' not found`, code: 'NOT_FOUND' },
							{ status: 404 },
						);
					}
					return FetsResponse.json({
						success: true,
						data: { message: `Inbound '${tag}' deleted` },
					});
				} catch (error) {
					return handleError(error);
				}
			},
		});
}
