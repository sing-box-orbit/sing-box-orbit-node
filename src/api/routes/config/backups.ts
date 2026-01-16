import { Response as FetsResponse, Type } from 'fets';
import {
	apiResponseSchema,
	authHeadersSchema,
	backupSchema,
	errorResponseSchema,
	messageResponseSchema,
} from '@/api/schemas';
import { handleError } from '@/api/utils';
import { configService } from '@/services';
import type { RouterType } from '../types';

export function registerBackupRoutes(router: RouterType) {
	return router
		.route({
			method: 'POST',
			path: '/config/backups',
			description: 'Create a backup of the current configuration',
			tags: ['Config', 'Backup'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: Type.Optional(
						Type.Object({
							reason: Type.Optional(Type.String()),
						}),
					),
				},
				responses: {
					200: apiResponseSchema(backupSchema),
					401: errorResponseSchema,
					404: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					let reason = 'manual';
					try {
						const body = await request.json();
						if (body?.reason) {
							reason = body.reason;
						}
					} catch {
						// Body is optional, default reason is used
					}
					const backup = await configService.createBackup(reason);
					return FetsResponse.json({
						success: true,
						data: backup,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'GET',
			path: '/config/backups',
			description: 'List all configuration backups',
			tags: ['Config', 'Backup'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							backups: Type.Array(backupSchema),
							total: Type.Number(),
						}),
					),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const backups = await configService.listBackups();
					return FetsResponse.json({
						success: true,
						data: {
							backups,
							total: backups.length,
						},
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'POST',
			path: '/config/backups/:id/restore',
			description: 'Restore configuration from a backup',
			tags: ['Config', 'Backup'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						id: Type.String(),
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
					const { id } = request.params;
					await configService.restoreBackup(id);
					return FetsResponse.json({
						success: true,
						data: { message: `Configuration restored from backup ${id}` },
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'DELETE',
			path: '/config/backups/:id',
			description: 'Delete a configuration backup',
			tags: ['Config', 'Backup'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						id: Type.String(),
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
					const { id } = request.params;
					const deleted = await configService.deleteBackup(id);
					if (!deleted) {
						return FetsResponse.json(
							{ success: false as const, error: 'Backup not found', code: 'NOT_FOUND' },
							{ status: 404 },
						);
					}
					return FetsResponse.json({
						success: true,
						data: { message: `Backup ${id} deleted` },
					});
				} catch (error) {
					return handleError(error);
				}
			},
		});
}
