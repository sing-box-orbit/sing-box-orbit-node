import { Response as FetsResponse } from 'fets';
import {
	apiResponseSchema,
	authHeadersSchema,
	errorResponseSchema,
	genericObjectSchema,
} from '@/api/schemas';
import { handleError } from '@/api/utils';
import { configService } from '@/services';
import type { LogConfig } from '@/types/singbox-config';
import type { RouterType } from '../types';

export function registerLogRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/config/log',
			description: 'Get log configuration',
			tags: ['Config', 'Log'],
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
					const log = await configService.getLog();
					return FetsResponse.json({
						success: true,
						data: log,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PUT',
			path: '/config/log',
			description: 'Replace log configuration',
			tags: ['Config', 'Log'],
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
					const body = (await request.json()) as LogConfig;
					const log = await configService.setLog(body);
					return FetsResponse.json({
						success: true,
						data: log,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PATCH',
			path: '/config/log',
			description: 'Partially update log configuration',
			tags: ['Config', 'Log'],
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
					const body = (await request.json()) as Partial<LogConfig>;
					const log = await configService.patchLog(body);
					return FetsResponse.json({
						success: true,
						data: log,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		});
}
