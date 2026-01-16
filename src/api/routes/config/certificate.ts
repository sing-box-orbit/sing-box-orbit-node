import { Response as FetsResponse, Type } from 'fets';
import { apiResponseSchema, authHeadersSchema, errorResponseSchema } from '@/api/schemas';
import { handleError } from '@/api/utils';
import { configService } from '@/services';
import type { RouterType } from '../types';

const certificateSchema = Type.Object({
	store: Type.Optional(
		Type.Union([
			Type.Literal('system'),
			Type.Literal('mozilla'),
			Type.Literal('chrome'),
			Type.Literal('none'),
		]),
	),
	certificate: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
	certificate_path: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
	certificate_directory_path: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
});

export function registerCertificateRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/config/certificate',
			description: 'Get the certificate configuration',
			tags: ['Config', 'Certificate'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(certificateSchema),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const certificate = await configService.getCertificate();
					return FetsResponse.json({
						success: true,
						data: certificate,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PUT',
			path: '/config/certificate',
			description: 'Replace the entire certificate configuration',
			tags: ['Config', 'Certificate'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: certificateSchema,
				},
				responses: {
					200: apiResponseSchema(certificateSchema),
					400: errorResponseSchema,
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const body = await request.json();
					const updated = await configService.setCertificate(body);
					return FetsResponse.json({
						success: true,
						data: updated,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'PATCH',
			path: '/config/certificate',
			description: 'Partially update the certificate configuration',
			tags: ['Config', 'Certificate'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: Type.Partial(
						Type.Object({
							store: Type.Union([
								Type.Literal('system'),
								Type.Literal('mozilla'),
								Type.Literal('chrome'),
								Type.Literal('none'),
							]),
							certificate: Type.Union([Type.String(), Type.Array(Type.String())]),
							certificate_path: Type.Union([Type.String(), Type.Array(Type.String())]),
							certificate_directory_path: Type.Union([Type.String(), Type.Array(Type.String())]),
						}),
					),
				},
				responses: {
					200: apiResponseSchema(certificateSchema),
					400: errorResponseSchema,
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const body = await request.json();
					const updated = await configService.patchCertificate(body);
					return FetsResponse.json({
						success: true,
						data: updated,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'DELETE',
			path: '/config/certificate',
			description: 'Delete the certificate configuration',
			tags: ['Config', 'Certificate'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(
						Type.Object({
							deleted: Type.Boolean(),
						}),
					),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const deleted = await configService.deleteCertificate();
					return FetsResponse.json({
						success: true,
						data: { deleted },
					});
				} catch (error) {
					return handleError(error);
				}
			},
		});
}
