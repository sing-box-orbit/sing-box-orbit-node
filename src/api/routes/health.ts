import { Response as FetsResponse } from 'fets';
import { authHeadersSchema, errorResponseSchema, healthResponseSchema } from '@/api/schemas';
import type { RouterType } from './types';

export function registerHealthRoutes(router: RouterType) {
	return router.route({
		method: 'GET',
		path: '/health',
		description: 'Health check endpoint',
		tags: ['Health'],
		schemas: {
			request: {
				headers: authHeadersSchema,
			},
			responses: {
				200: healthResponseSchema,
				401: errorResponseSchema,
			},
		},
		handler: () => {
			return FetsResponse.json({
				status: 'ok' as const,
				timestamp: new Date().toISOString(),
				version: '0.1.0',
			});
		},
	});
}
