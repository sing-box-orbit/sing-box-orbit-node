import { Response as FetsResponse, Type } from 'fets';
import { apiResponseSchema, authHeadersSchema, errorResponseSchema } from '@/api/schemas';
import { handleError } from '@/api/utils';
import { configService } from '@/services';
import { NotFoundError } from '@/utils/errors';
import type { RouterType } from './types';

const diffResultSchema = Type.Object({
	hasChanges: Type.Boolean(),
	changes: Type.Array(
		Type.Object({
			type: Type.Union([Type.Literal('added'), Type.Literal('removed'), Type.Literal('modified')]),
			path: Type.String(),
			oldValue: Type.Optional(Type.Unknown()),
			newValue: Type.Optional(Type.Unknown()),
		}),
	),
});

export function registerDiffRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/config/diff/:backupId',
			description: 'Compare current configuration with a backup',
			tags: ['Config', 'Diff'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					params: Type.Object({
						backupId: Type.String(),
					}),
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							...diffResultSchema.properties,
							current: Type.Object({}, { additionalProperties: true }),
							backup: Type.Object({}, { additionalProperties: true }),
						}),
					),
					401: errorResponseSchema,
					404: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const { backupId } = request.params;
					const result = await configService.diffWithBackup(backupId);
					return FetsResponse.json({
						success: true,
						data: result,
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
			method: 'GET',
			path: '/config/diff/compare',
			description: 'Compare two backups',
			tags: ['Config', 'Diff'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					query: Type.Object({
						backup1: Type.String({ description: 'First backup ID' }),
						backup2: Type.String({ description: 'Second backup ID' }),
					}),
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							...diffResultSchema.properties,
							config1: Type.Object({}, { additionalProperties: true }),
							config2: Type.Object({}, { additionalProperties: true }),
						}),
					),
					401: errorResponseSchema,
					404: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const backup1 = request.query.backup1;
					const backup2 = request.query.backup2;

					const result = await configService.diffBackups(backup1, backup2);
					return FetsResponse.json({
						success: true,
						data: result,
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
		});
}
