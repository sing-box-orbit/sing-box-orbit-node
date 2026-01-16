import { Response as FetsResponse } from 'fets';
import {
	apiResponseSchema,
	authHeadersSchema,
	errorResponseSchema,
	logsQuerySchema,
	logsResponseSchema,
	reloadServerResponseSchema,
	restartStatsSchema,
	serverStatusSchema,
} from '@/api/schemas';
import { handleError } from '@/api/utils';
import { processService } from '@/services';
import type { RouterType } from './types';

export function registerServerRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/server/status',
			description: 'Get the current status of the sing-box process',
			tags: ['Server'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(serverStatusSchema),
					401: errorResponseSchema,
				},
			},
			handler: async () => {
				const status = await processService.getStatus();
				return FetsResponse.json({
					success: true,
					data: status,
				});
			},
		})
		.route({
			method: 'POST',
			path: '/server/reload',
			description: 'Reload sing-box configuration (sends SIGHUP)',
			tags: ['Server'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(reloadServerResponseSchema),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const result = await processService.reload();
					return FetsResponse.json({
						success: true,
						data: result,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'GET',
			path: '/server/logs',
			description: 'Get sing-box process logs',
			tags: ['Server'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					query: logsQuerySchema,
				},
				responses: {
					200: apiResponseSchema(logsResponseSchema),
					401: errorResponseSchema,
				},
			},
			handler: (request) => {
				const url = new URL(request.url);
				const limitParam = url.searchParams.get('limit');
				const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

				const logs = processService.getLogs(limit);
				return FetsResponse.json({
					success: true,
					data: {
						logs,
						total: logs.length,
					},
				});
			},
		})
		.route({
			method: 'POST',
			path: '/server/restart-stats/reset',
			description: 'Reset restart statistics and clear max restarts flag',
			tags: ['Server'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(restartStatsSchema),
					401: errorResponseSchema,
				},
			},
			handler: () => {
				processService.resetRestartStats();
				return FetsResponse.json({
					success: true,
					data: processService.getRestartStats(),
				});
			},
		});
}
