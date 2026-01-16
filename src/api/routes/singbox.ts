import { Response as FetsResponse, Type } from 'fets';
import { apiResponseSchema, authHeadersSchema, errorResponseSchema } from '@/api/schemas';
import { handleError } from '@/api/utils';
import { configService } from '@/services';
import type { RouterType } from './types';

export function registerSingboxRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/singbox/version',
			description: 'Get sing-box binary version information',
			tags: ['Sing-box'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							version: Type.String(),
							tags: Type.Array(Type.String()),
							revision: Type.String(),
							cgo: Type.Boolean(),
						}),
					),
					400: errorResponseSchema,
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const versionInfo = await configService.getSingboxVersion();
					return FetsResponse.json({
						success: true,
						data: versionInfo,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'GET',
			path: '/singbox/check',
			description: 'Check sing-box binary availability and status',
			tags: ['Sing-box'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							available: Type.Boolean(),
							path: Type.String(),
							version: Type.Optional(Type.String()),
							error: Type.Optional(Type.String()),
						}),
					),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const checkResult = await configService.checkSingboxBinary();
					return FetsResponse.json({
						success: true,
						data: checkResult,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		});
}
