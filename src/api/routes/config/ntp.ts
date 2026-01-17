import { Response as FetsResponse } from 'fets';
import {
	apiResponseSchema,
	authHeadersSchema,
	errorResponseSchema,
	genericObjectSchema,
} from '@/api/schemas';
import { handleError } from '@/api/utils';
import { configService } from '@/services';
import type { NtpConfig } from '@/types/singbox';
import type { RouterType } from '../types';

export function registerNtpRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/config/ntp',
			description: 'Get NTP configuration',
			tags: ['Config', 'NTP'],
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
					const ntp = await configService.getNtp();
					return FetsResponse.json({
						success: true,
						data: ntp,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PUT',
			path: '/config/ntp',
			description: 'Replace NTP configuration',
			tags: ['Config', 'NTP'],
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
					const body = (await request.json()) as NtpConfig;
					const ntp = await configService.setNtp(body);
					return FetsResponse.json({
						success: true,
						data: ntp,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PATCH',
			path: '/config/ntp',
			description: 'Partially update NTP configuration',
			tags: ['Config', 'NTP'],
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
					const body = (await request.json()) as Partial<NtpConfig>;
					const ntp = await configService.patchNtp(body);
					return FetsResponse.json({
						success: true,
						data: ntp,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		});
}
