import { Response as FetsResponse, Type } from 'fets';
import {
	apiResponseSchema,
	authHeadersSchema,
	errorResponseSchema,
	genericObjectSchema,
	restartStatsSchema,
	validationResultSchema,
} from '@/api/schemas';
import { handleError } from '@/api/utils';
import { configService, processService } from '@/services';
import type { SingBoxConfig } from '@/types/singbox';
import type { RouterType } from './types';

const ORBIT_NODE_VERSION = '1.0.0';

const versionResponseSchema = Type.Object({
	orbitNode: Type.String(),
	singbox: Type.Union([Type.String(), Type.Null()]),
	platform: Type.String(),
	arch: Type.String(),
});

const stateResponseSchema = Type.Object({
	version: versionResponseSchema,
	status: Type.Object({
		running: Type.Boolean(),
		pid: Type.Union([Type.Number(), Type.Null()]),
		uptime: Type.Union([Type.Number(), Type.Null()]),
		startedAt: Type.Union([Type.String(), Type.Null()]),
		restartStats: restartStatsSchema,
	}),
	config: genericObjectSchema,
});

const applyConfigRequestSchema = Type.Object({
	config: genericObjectSchema,
	reload: Type.Optional(Type.Boolean({ default: true })),
});

const applyConfigResponseSchema = Type.Object({
	applied: Type.Boolean(),
	reloaded: Type.Boolean(),
	previousBackup: Type.Union([Type.String(), Type.Null()]),
});

export function registerStateRoutes(router: RouterType) {
	return router
		.route({
			method: 'GET',
			path: '/state',
			description: 'Get complete server state for synchronization with backend',
			tags: ['State'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(stateResponseSchema),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const [status, singboxConfig] = await Promise.all([
						processService.getStatus(),
						configService.getConfig().catch(() => ({})),
					]);

					return FetsResponse.json({
						success: true,
						data: {
							version: {
								orbitNode: ORBIT_NODE_VERSION,
								singbox: status.version,
								platform: process.platform,
								arch: process.arch,
							},
							status: {
								running: status.running,
								pid: status.pid,
								uptime: status.uptime,
								startedAt: status.startedAt,
								restartStats: status.restartStats,
							},
							config: singboxConfig,
						},
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'GET',
			path: '/version',
			description: 'Get orbit-node and sing-box version information',
			tags: ['State'],
			schemas: {
				request: {
					headers: authHeadersSchema,
				},
				responses: {
					200: apiResponseSchema(versionResponseSchema),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async () => {
				try {
					const status = await processService.getStatus();

					return FetsResponse.json({
						success: true,
						data: {
							orbitNode: ORBIT_NODE_VERSION,
							singbox: status.version,
							platform: process.platform,
							arch: process.arch,
						},
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'POST',
			path: '/config/apply',
			description:
				'Apply complete configuration from backend. Validates, backs up current config, writes new config, and optionally reloads sing-box.',
			tags: ['State', 'Config'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: applyConfigRequestSchema,
				},
				responses: {
					200: apiResponseSchema(applyConfigResponseSchema),
					400: errorResponseSchema,
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const body = await request.json();
					const newConfig = body.config as SingBoxConfig;
					const shouldReload = body.reload !== false;

					// Validate first
					const validation = await configService.validateConfig(newConfig);
					if (!validation.valid) {
						return FetsResponse.json(
							{
								success: false as const,
								error: validation.errors.map((e) => e.message).join('; '),
								code: 'VALIDATION_ERROR',
							},
							{ status: 400 },
						);
					}

					// Get backup info before applying
					const backups = await configService.listBackups();
					const backupCountBefore = backups.length;

					// Apply config (this creates backup automatically if enabled)
					await configService.setConfig(newConfig, 'backend-apply');

					// Check if backup was created
					const backupsAfter = await configService.listBackups();
					const newBackup = backupsAfter.length > backupCountBefore ? backupsAfter[0] : null;

					// Reload if requested and not auto-reloaded
					let reloaded = false;
					if (shouldReload) {
						const status = await processService.getStatus();
						if (status.running) {
							await processService.reload();
							reloaded = true;
						}
					}

					return FetsResponse.json({
						success: true,
						data: {
							applied: true,
							reloaded,
							previousBackup: newBackup?.filename ?? null,
						},
					});
				} catch (error) {
					return handleError(error);
				}
			},
		})
		.route({
			method: 'POST',
			path: '/config/validate',
			description: 'Validate configuration without applying it',
			tags: ['State', 'Config'],
			schemas: {
				request: {
					headers: authHeadersSchema,
					json: Type.Object({
						config: genericObjectSchema,
					}),
				},
				responses: {
					200: apiResponseSchema(validationResultSchema),
					401: errorResponseSchema,
					500: errorResponseSchema,
				},
			},
			handler: async (request) => {
				try {
					const body = await request.json();
					const configToValidate = body.config as SingBoxConfig;

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
