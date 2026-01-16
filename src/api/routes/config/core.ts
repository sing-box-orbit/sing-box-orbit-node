import { Value } from '@sinclair/typebox/value';
import { Response as FetsResponse } from 'fets';
import {
	apiResponseSchema,
	authHeadersSchema,
	errorResponseSchema,
	genericObjectSchema,
	messageResponseSchema,
	validationResultSchema,
} from '@/api/schemas';
import { knownTopLevelFields, singBoxConfigSchema } from '@/api/schemas/singbox-config';
import { handleError } from '@/api/utils';
import { configService } from '@/services';
import { BadRequestError } from '@/utils/errors';
import type { RouterType } from '../types';

function validateSingBoxConfig(body: unknown): void {
	if (typeof body !== 'object' || body === null) {
		throw new BadRequestError('Configuration must be an object');
	}

	const unknownFields = Object.keys(body).filter(
		(key) => !knownTopLevelFields.includes(key as (typeof knownTopLevelFields)[number]),
	);
	if (unknownFields.length > 0) {
		throw new BadRequestError(`Unknown top-level fields: ${unknownFields.join(', ')}`);
	}

	const errors = [...Value.Errors(singBoxConfigSchema, body)];
	if (errors.length > 0) {
		const errorMessages = errors.slice(0, 5).map((e) => `${e.path}: ${e.message}`);
		throw new BadRequestError(`Schema validation failed: ${errorMessages.join('; ')}`);
	}
}

function validatePatchConfig(body: unknown): void {
	if (typeof body !== 'object' || body === null) {
		throw new BadRequestError('Patch must be an object');
	}

	const unknownFields = Object.keys(body).filter(
		(key) => !knownTopLevelFields.includes(key as (typeof knownTopLevelFields)[number]),
	);
	if (unknownFields.length > 0) {
		throw new BadRequestError(`Unknown top-level fields: ${unknownFields.join(', ')}`);
	}
}

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
					validateSingBoxConfig(body);
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
					validatePatchConfig(patch);
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
