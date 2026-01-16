import { Response as FetsResponse } from 'fets';
import {
	apiResponseSchema,
	authHeadersSchema,
	errorResponseSchema,
	genericObjectSchema,
	messageResponseSchema,
	validationResultSchema,
} from '@/api/schemas';
import { handleError } from '@/api/utils';
import { configService } from '@/services';
import type { RouterType } from '../types';

export function registerConfigCoreRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/config',
			description: 'Get the full sing-box configuration',
			tags: ['Config'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(genericObjectSchema),
					401: errorResponseSchema,
					404: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const cfg = await configService.getConfig();
					return FetsResponse.json({
						success: true,
						data: cfg,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PUT',
			path: '/config',
			description: 'Replace the entire sing-box configuration',
			tags: ['Config'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: genericObjectSchema,
				},
				responses: {
					200: apiResponseSchema(messageResponseSchema),
					400: errorResponseSchema,
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const body = await request.json();
					await configService.setConfig(body);
					return FetsResponse.json({
						success: true,
						data: { message: 'Configuration updated successfully' },
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PATCH',
			path: '/config',
			description: 'Partially update the sing-box configuration (deep merge)',
			tags: ['Config'],
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
					const patch = await request.json();
					const updatedConfig = await configService.patchConfig(patch);
					return FetsResponse.json({
						success: true,
						data: updatedConfig,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'POST',
			path: '/config/validate',
			description: 'Validate a configuration without applying it',
			tags: ['Config'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: genericObjectSchema,
				},
				responses: {
					200: apiResponseSchema(validationResultSchema),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const configToValidate = await request.json();
					const result = await configService.validateConfig(configToValidate);
					return FetsResponse.json({
						success: true,
						data: result,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		});
}
