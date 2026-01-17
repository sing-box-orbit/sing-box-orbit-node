import { Response as FetsResponse } from 'fets';
import {
	apiResponseSchema,
	authHeadersSchema,
	errorResponseSchema,
	genericObjectSchema,
} from '@/api/schemas';
import { handleError } from '@/api/utils';
import { configService } from '@/services';
import type { ExperimentalConfig } from '@/types/singbox';
import type { RouterType } from '../types';

export function registerExperimentalRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/config/experimental',
			description: 'Get experimental configuration',
			tags: ['Config', 'Experimental'],
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
					const experimental = await configService.getExperimental();
					return FetsResponse.json({
						success: true,
						data: experimental,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PUT',
			path: '/config/experimental',
			description: 'Replace experimental configuration',
			tags: ['Config', 'Experimental'],
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
					const body = (await request.json()) as ExperimentalConfig;
					const experimental = await configService.setExperimental(body);
					return FetsResponse.json({
						success: true,
						data: experimental,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PATCH',
			path: '/config/experimental',
			description: 'Partially update experimental configuration',
			tags: ['Config', 'Experimental'],
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
					const body = (await request.json()) as Partial<ExperimentalConfig>;
					const experimental = await configService.patchExperimental(body);
					return FetsResponse.json({
						success: true,
						data: experimental,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		});
}
