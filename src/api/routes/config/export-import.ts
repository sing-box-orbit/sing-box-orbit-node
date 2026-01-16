import { Response as FetsResponse, Type } from 'fets';
import {
	apiResponseSchema,
	authHeadersSchema,
	errorResponseSchema,
	genericObjectSchema,
} from '@/api/schemas';
import { handleError } from '@/api/utils';
import { configService } from '@/services';
import type { RouterType } from '../types';

export function registerExportImportRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/config/export',
			description: 'Export configuration with metadata for backup/transfer',
			tags: ['Config', 'Export'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							config: genericObjectSchema,
							metadata: Type.Object({
								exportedAt: Type.String({ format: 'date-time' }),
								version: Type.String(),
								singboxVersion: Type.Optional(Type.String()),
							}),
						}),
					),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const exportData = await configService.exportConfig();
					return FetsResponse.json({
						success: true,
						data: exportData,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'POST',
			path: '/config/import',
			description: 'Import configuration from exported data',
			tags: ['Config', 'Import'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: Type.Object({
						config: genericObjectSchema,
						metadata: Type.Optional(
							Type.Object({
								exportedAt: Type.Optional(Type.String()),
								version: Type.Optional(Type.String()),
								singboxVersion: Type.Optional(Type.String()),
							}),
						),
					}),
					query: Type.Object({
						validate: Type.Optional(
							Type.Union([Type.Literal('true'), Type.Literal('false')], {
								description: 'Validate configuration before import (default: true)',
							}),
						),
						merge: Type.Optional(
							Type.Union([Type.Literal('true'), Type.Literal('false')], {
								description: 'Merge with existing configuration (default: false)',
							}),
						),
						createBackup: Type.Optional(
							Type.Union([Type.Literal('true'), Type.Literal('false')], {
								description: 'Create backup before import (default: true)',
							}),
						),
					}),
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							success: Type.Boolean(),
							config: genericObjectSchema,
							warnings: Type.Array(Type.String()),
						}),
					),
					400: errorResponseSchema,
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const body = await request.json();
					const url = new URL(request.url);
					const validateParam = url.searchParams.get('validate');
					const mergeParam = url.searchParams.get('merge');
					const createBackupParam = url.searchParams.get('createBackup');

					const options = {
						validate: validateParam !== 'false',
						merge: mergeParam === 'true',
						createBackup: createBackupParam !== 'false',
					};

					const result = await configService.importConfig(body, options);
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
