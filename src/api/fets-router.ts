import { createRouter, Response as FetsResponse, Type } from 'fets';
import { configService, processService } from '@/services';
import type {
	DnsConfig,
	DnsRule,
	DnsServer,
	Endpoint,
	ExperimentalConfig,
	Inbound,
	LogConfig,
	NtpConfig,
	Outbound,
	RouteConfig,
	RouteRule,
	RuleSet,
	Service,
} from '@/types/singbox-config';
import { AppError, NotFoundError } from '@/utils/errors';

const errorResponseSchema = Type.Object({
	success: Type.Literal(false),
	error: Type.String(),
	code: Type.Optional(Type.String()),
});

const healthResponseSchema = Type.Object({
	status: Type.Union([Type.Literal('ok'), Type.Literal('error')]),
	timestamp: Type.String({ format: 'date-time' }),
	version: Type.String(),
});

const restartStatsSchema = Type.Object({
	enabled: Type.Boolean(),
	count: Type.Number(),
	lastRestartAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
	nextRestartIn: Type.Union([Type.Number(), Type.Null()]),
	maxRestartsReached: Type.Boolean(),
});

const serverStatusSchema = Type.Object({
	running: Type.Boolean(),
	pid: Type.Union([Type.Number(), Type.Null()]),
	uptime: Type.Union([Type.Number(), Type.Null()]),
	startedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
	version: Type.Union([Type.String(), Type.Null()]),
	restartStats: restartStatsSchema,
});

const apiResponseSchema = <T extends ReturnType<typeof Type.Object>>(dataSchema: T) =>
	Type.Object({
		success: Type.Boolean(),
		data: Type.Optional(dataSchema),
		error: Type.Optional(Type.String()),
		code: Type.Optional(Type.String()),
	});

const reloadServerResponseSchema = Type.Object({
	pid: Type.Number(),
	reloadedAt: Type.String({ format: 'date-time' }),
});

const logsQuerySchema = Type.Object({
	limit: Type.Optional(Type.Number({ minimum: 1, maximum: 1000 })),
});

const logsResponseSchema = Type.Object({
	logs: Type.Array(Type.String()),
	total: Type.Number(),
});

const authHeadersSchema = {
	type: 'object',
	properties: {
		authorization: { type: 'string' },
		'x-api-key': { type: 'string' },
	},
} as const;

function handleError(error: unknown) {
	if (error instanceof AppError) {
		return FetsResponse.json(
			{ success: false as const, error: error.message, code: error.code },
			{ status: 500 as const },
		);
	}
	console.error('Unexpected error:', error);
	return FetsResponse.json(
		{ success: false as const, error: 'Internal server error', code: 'INTERNAL_ERROR' },
		{ status: 500 as const },
	);
}

export const fetsRouter = createRouter({
	landingPage: false,
	openAPI: {
		info: {
			title: 'sing-box-orbit-node API',
			description: 'REST API for managing sing-box server',
			version: '0.0.1',
		},
		components: {
			securitySchemes: {
				bearerAuth: {
					type: 'http',
					scheme: 'bearer',
				},
				apiKeyHeader: {
					type: 'apiKey',
					in: 'header',
					name: 'X-API-Key',
				},
			},
		},
	},
})
	.route({
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
	})
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
	})
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
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
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
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(Type.Object({ message: Type.String() })),
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
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
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
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						valid: Type.Boolean(),
						errors: Type.Array(
							Type.Object({
								path: Type.String(),
								message: Type.String(),
								code: Type.String(),
							}),
						),
					}),
				),
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
	})
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
				200: apiResponseSchema(
					Type.Object({
						id: Type.String(),
						createdAt: Type.String({ format: 'date-time' }),
						reason: Type.String(),
						configHash: Type.String(),
						size: Type.Number(),
						filename: Type.String(),
					}),
				),
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
				} catch {}
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
						backups: Type.Array(
							Type.Object({
								id: Type.String(),
								createdAt: Type.String({ format: 'date-time' }),
								reason: Type.String(),
								configHash: Type.String(),
								size: Type.Number(),
								filename: Type.String(),
							}),
						),
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
				200: apiResponseSchema(Type.Object({ message: Type.String() })),
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
				200: apiResponseSchema(Type.Object({ message: Type.String() })),
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
	})
	.route({
		method: 'GET',
		path: '/config/inbounds',
		description: 'List all inbounds',
		tags: ['Config', 'Inbounds'],
		schemas: {
			request: {
				headers: authHeadersSchema,
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						inbounds: Type.Array(Type.Object({}, { additionalProperties: true })),
						total: Type.Number(),
					}),
				),
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async () => {
			try {
				const inbounds = await configService.getInbounds();
				return FetsResponse.json({
					success: true,
					data: {
						inbounds,
						total: inbounds.length,
					},
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'GET',
		path: '/config/inbounds/:tag',
		description: 'Get inbound by tag',
		tags: ['Config', 'Inbounds'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const inbound = await configService.getInbound(tag);
				if (!inbound) {
					return FetsResponse.json(
						{ success: false as const, error: `Inbound '${tag}' not found`, code: 'NOT_FOUND' },
						{ status: 404 },
					);
				}
				return FetsResponse.json({
					success: true,
					data: inbound,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'POST',
		path: '/config/inbounds',
		description: 'Create a new inbound',
		tags: ['Config', 'Inbounds'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object(
					{
						type: Type.String(),
						tag: Type.String(),
					},
					{ additionalProperties: true },
				),
			},
			responses: {
				201: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const body = (await request.json()) as Inbound;
				const inbound = await configService.createInbound(body);
				return FetsResponse.json(
					{
						success: true,
						data: inbound,
					},
					{ status: 201 },
				);
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'PUT',
		path: '/config/inbounds/:tag',
		description: 'Replace an inbound',
		tags: ['Config', 'Inbounds'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
				json: Type.Object(
					{
						type: Type.String(),
						tag: Type.String(),
					},
					{ additionalProperties: true },
				),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const body = (await request.json()) as Inbound;
				const inbound = await configService.updateInbound(tag, body);
				return FetsResponse.json({
					success: true,
					data: inbound,
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
		method: 'PATCH',
		path: '/config/inbounds/:tag',
		description: 'Partially update an inbound',
		tags: ['Config', 'Inbounds'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const body = await request.json();
				const inbound = await configService.patchInbound(tag, body);
				return FetsResponse.json({
					success: true,
					data: inbound,
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
		method: 'DELETE',
		path: '/config/inbounds/:tag',
		description: 'Delete an inbound',
		tags: ['Config', 'Inbounds'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
			},
			responses: {
				200: apiResponseSchema(Type.Object({ message: Type.String() })),
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const deleted = await configService.deleteInbound(tag);
				if (!deleted) {
					return FetsResponse.json(
						{ success: false as const, error: `Inbound '${tag}' not found`, code: 'NOT_FOUND' },
						{ status: 404 },
					);
				}
				return FetsResponse.json({
					success: true,
					data: { message: `Inbound '${tag}' deleted` },
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'GET',
		path: '/config/outbounds',
		description: 'List all outbounds',
		tags: ['Config', 'Outbounds'],
		schemas: {
			request: {
				headers: authHeadersSchema,
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						outbounds: Type.Array(Type.Object({}, { additionalProperties: true })),
						total: Type.Number(),
					}),
				),
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async () => {
			try {
				const outbounds = await configService.getOutbounds();
				return FetsResponse.json({
					success: true,
					data: {
						outbounds,
						total: outbounds.length,
					},
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'GET',
		path: '/config/outbounds/:tag',
		description: 'Get outbound by tag',
		tags: ['Config', 'Outbounds'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const outbound = await configService.getOutbound(tag);
				if (!outbound) {
					return FetsResponse.json(
						{ success: false as const, error: `Outbound '${tag}' not found`, code: 'NOT_FOUND' },
						{ status: 404 },
					);
				}
				return FetsResponse.json({
					success: true,
					data: outbound,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'POST',
		path: '/config/outbounds',
		description: 'Create a new outbound',
		tags: ['Config', 'Outbounds'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object(
					{
						type: Type.String(),
						tag: Type.String(),
					},
					{ additionalProperties: true },
				),
			},
			responses: {
				201: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const body = (await request.json()) as Outbound;
				const outbound = await configService.createOutbound(body);
				return FetsResponse.json(
					{
						success: true,
						data: outbound,
					},
					{ status: 201 },
				);
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'PUT',
		path: '/config/outbounds/:tag',
		description: 'Replace an outbound',
		tags: ['Config', 'Outbounds'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
				json: Type.Object(
					{
						type: Type.String(),
						tag: Type.String(),
					},
					{ additionalProperties: true },
				),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const body = (await request.json()) as Outbound;
				const outbound = await configService.updateOutbound(tag, body);
				return FetsResponse.json({
					success: true,
					data: outbound,
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
		method: 'PATCH',
		path: '/config/outbounds/:tag',
		description: 'Partially update an outbound',
		tags: ['Config', 'Outbounds'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const body = await request.json();
				const outbound = await configService.patchOutbound(tag, body);
				return FetsResponse.json({
					success: true,
					data: outbound,
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
		method: 'DELETE',
		path: '/config/outbounds/:tag',
		description: 'Delete an outbound',
		tags: ['Config', 'Outbounds'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
			},
			responses: {
				200: apiResponseSchema(Type.Object({ message: Type.String() })),
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const deleted = await configService.deleteOutbound(tag);
				if (!deleted) {
					return FetsResponse.json(
						{ success: false as const, error: `Outbound '${tag}' not found`, code: 'NOT_FOUND' },
						{ status: 404 },
					);
				}
				return FetsResponse.json({
					success: true,
					data: { message: `Outbound '${tag}' deleted` },
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'POST',
		path: '/config/outbounds/:tag/test',
		description: 'Test outbound connectivity',
		tags: ['Config', 'Outbounds'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
				json: Type.Optional(
					Type.Object({
						url: Type.Optional(Type.String()),
						timeout: Type.Optional(Type.Number({ minimum: 100, maximum: 60000 })),
					}),
				),
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						success: Type.Boolean(),
						latency: Type.Optional(Type.Number()),
						error: Type.Optional(Type.String()),
					}),
				),
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				let testUrl: string | undefined;
				let timeout: number | undefined;
				try {
					const body = await request.json();
					testUrl = body?.url;
					timeout = body?.timeout;
				} catch {}
				const result = await configService.testOutbound(tag, testUrl, timeout);
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
		path: '/config/outbounds/:tag/latency',
		description: 'Measure outbound latency',
		tags: ['Config', 'Outbounds'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
				query: Type.Object({
					url: Type.Optional(Type.String()),
					timeout: Type.Optional(Type.Number({ minimum: 100, maximum: 60000 })),
					samples: Type.Optional(Type.Number({ minimum: 1, maximum: 10 })),
				}),
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						latency: Type.Union([Type.Number(), Type.Null()]),
						samples: Type.Array(Type.Number()),
						error: Type.Optional(Type.String()),
					}),
				),
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const url = new URL(request.url);
				const testUrl = url.searchParams.get('url') || undefined;
				const timeoutParam = url.searchParams.get('timeout');
				const samplesParam = url.searchParams.get('samples');
				const timeout = timeoutParam ? Number.parseInt(timeoutParam, 10) : undefined;
				const samples = samplesParam ? Number.parseInt(samplesParam, 10) : undefined;

				const result = await configService.getOutboundLatency(tag, testUrl, timeout, samples);
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
		path: '/config/route',
		description: 'Get route configuration',
		tags: ['Config', 'Route'],
		schemas: {
			request: {
				headers: authHeadersSchema,
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async () => {
			try {
				const route = await configService.getRoute();
				return FetsResponse.json({
					success: true,
					data: route,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'PUT',
		path: '/config/route',
		description: 'Replace route configuration',
		tags: ['Config', 'Route'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const body = (await request.json()) as RouteConfig;
				const route = await configService.setRoute(body);
				return FetsResponse.json({
					success: true,
					data: route,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'PATCH',
		path: '/config/route',
		description: 'Partially update route configuration',
		tags: ['Config', 'Route'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const body = (await request.json()) as Partial<RouteConfig>;
				const route = await configService.patchRoute(body);
				return FetsResponse.json({
					success: true,
					data: route,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'GET',
		path: '/config/route/rules',
		description: 'List all route rules',
		tags: ['Config', 'Route', 'Rules'],
		schemas: {
			request: {
				headers: authHeadersSchema,
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						rules: Type.Array(Type.Object({}, { additionalProperties: true })),
						total: Type.Number(),
					}),
				),
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async () => {
			try {
				const rules = await configService.getRouteRules();
				return FetsResponse.json({
					success: true,
					data: {
						rules,
						total: rules.length,
					},
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'GET',
		path: '/config/route/rules/:index',
		description: 'Get route rule by index',
		tags: ['Config', 'Route', 'Rules'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					index: Type.String(),
				}),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const index = Number.parseInt(request.params.index, 10);
				if (Number.isNaN(index)) {
					return FetsResponse.json(
						{ success: false as const, error: 'Invalid index', code: 'BAD_REQUEST' },
						{ status: 400 },
					);
				}
				const rule = await configService.getRouteRule(index);
				if (!rule) {
					return FetsResponse.json(
						{
							success: false as const,
							error: `Route rule at index ${index} not found`,
							code: 'NOT_FOUND',
						},
						{ status: 404 },
					);
				}
				return FetsResponse.json({
					success: true,
					data: rule,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'POST',
		path: '/config/route/rules',
		description: 'Create a new route rule',
		tags: ['Config', 'Route', 'Rules'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object(
					{
						outbound: Type.String(),
					},
					{ additionalProperties: true },
				),
			},
			responses: {
				201: apiResponseSchema(
					Type.Object({
						rule: Type.Object({}, { additionalProperties: true }),
						index: Type.Number(),
					}),
				),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const body = (await request.json()) as RouteRule;
				const result = await configService.createRouteRule(body);
				return FetsResponse.json(
					{
						success: true,
						data: result,
					},
					{ status: 201 },
				);
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'PUT',
		path: '/config/route/rules/:index',
		description: 'Replace a route rule',
		tags: ['Config', 'Route', 'Rules'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					index: Type.String(),
				}),
				json: Type.Object(
					{
						outbound: Type.String(),
					},
					{ additionalProperties: true },
				),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const index = Number.parseInt(request.params.index, 10);
				if (Number.isNaN(index)) {
					return FetsResponse.json(
						{ success: false as const, error: 'Invalid index', code: 'BAD_REQUEST' },
						{ status: 400 },
					);
				}
				const body = (await request.json()) as RouteRule;
				const rule = await configService.updateRouteRule(index, body);
				return FetsResponse.json({
					success: true,
					data: rule,
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
		method: 'DELETE',
		path: '/config/route/rules/:index',
		description: 'Delete a route rule',
		tags: ['Config', 'Route', 'Rules'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					index: Type.String(),
				}),
			},
			responses: {
				200: apiResponseSchema(Type.Object({ message: Type.String() })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const index = Number.parseInt(request.params.index, 10);
				if (Number.isNaN(index)) {
					return FetsResponse.json(
						{ success: false as const, error: 'Invalid index', code: 'BAD_REQUEST' },
						{ status: 400 },
					);
				}
				const deleted = await configService.deleteRouteRule(index);
				if (!deleted) {
					return FetsResponse.json(
						{
							success: false as const,
							error: `Route rule at index ${index} not found`,
							code: 'NOT_FOUND',
						},
						{ status: 404 },
					);
				}
				return FetsResponse.json({
					success: true,
					data: { message: `Route rule at index ${index} deleted` },
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'POST',
		path: '/config/route/rules/reorder',
		description: 'Reorder route rules',
		tags: ['Config', 'Route', 'Rules'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object({
					fromIndex: Type.Number(),
					toIndex: Type.Number(),
				}),
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						rules: Type.Array(Type.Object({}, { additionalProperties: true })),
						total: Type.Number(),
					}),
				),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { fromIndex, toIndex } = await request.json();
				const rules = await configService.reorderRouteRules(fromIndex, toIndex);
				return FetsResponse.json({
					success: true,
					data: {
						rules,
						total: rules.length,
					},
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'GET',
		path: '/config/route/rule-sets',
		description: 'List all rule sets',
		tags: ['Config', 'Route', 'RuleSets'],
		schemas: {
			request: {
				headers: authHeadersSchema,
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						ruleSets: Type.Array(Type.Object({}, { additionalProperties: true })),
						total: Type.Number(),
					}),
				),
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async () => {
			try {
				const ruleSets = await configService.getRuleSets();
				return FetsResponse.json({
					success: true,
					data: {
						ruleSets,
						total: ruleSets.length,
					},
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'GET',
		path: '/config/route/rule-sets/:tag',
		description: 'Get rule set by tag',
		tags: ['Config', 'Route', 'RuleSets'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const ruleSet = await configService.getRuleSet(tag);
				if (!ruleSet) {
					return FetsResponse.json(
						{ success: false as const, error: `Rule set '${tag}' not found`, code: 'NOT_FOUND' },
						{ status: 404 },
					);
				}
				return FetsResponse.json({
					success: true,
					data: ruleSet,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'POST',
		path: '/config/route/rule-sets',
		description: 'Create a new rule set',
		tags: ['Config', 'Route', 'RuleSets'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object(
					{
						type: Type.Union([Type.Literal('local'), Type.Literal('remote')]),
						tag: Type.String(),
						format: Type.Union([Type.Literal('source'), Type.Literal('binary')]),
					},
					{ additionalProperties: true },
				),
			},
			responses: {
				201: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const body = (await request.json()) as RuleSet;
				const ruleSet = await configService.createRuleSet(body);
				return FetsResponse.json(
					{
						success: true,
						data: ruleSet,
					},
					{ status: 201 },
				);
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'PUT',
		path: '/config/route/rule-sets/:tag',
		description: 'Replace a rule set',
		tags: ['Config', 'Route', 'RuleSets'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
				json: Type.Object(
					{
						type: Type.Union([Type.Literal('local'), Type.Literal('remote')]),
						tag: Type.String(),
						format: Type.Union([Type.Literal('source'), Type.Literal('binary')]),
					},
					{ additionalProperties: true },
				),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const body = (await request.json()) as RuleSet;
				const ruleSet = await configService.updateRuleSet(tag, body);
				return FetsResponse.json({
					success: true,
					data: ruleSet,
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
		method: 'DELETE',
		path: '/config/route/rule-sets/:tag',
		description: 'Delete a rule set',
		tags: ['Config', 'Route', 'RuleSets'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
			},
			responses: {
				200: apiResponseSchema(Type.Object({ message: Type.String() })),
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const deleted = await configService.deleteRuleSet(tag);
				if (!deleted) {
					return FetsResponse.json(
						{ success: false as const, error: `Rule set '${tag}' not found`, code: 'NOT_FOUND' },
						{ status: 404 },
					);
				}
				return FetsResponse.json({
					success: true,
					data: { message: `Rule set '${tag}' deleted` },
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	// DNS Config routes
	.route({
		method: 'GET',
		path: '/config/dns',
		description: 'Get DNS configuration',
		tags: ['Config', 'DNS'],
		schemas: {
			request: {
				headers: authHeadersSchema,
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async () => {
			try {
				const dns = await configService.getDns();
				return FetsResponse.json({
					success: true,
					data: dns,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'PUT',
		path: '/config/dns',
		description: 'Replace DNS configuration',
		tags: ['Config', 'DNS'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const body = (await request.json()) as DnsConfig;
				const dns = await configService.setDns(body);
				return FetsResponse.json({
					success: true,
					data: dns,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'PATCH',
		path: '/config/dns',
		description: 'Partially update DNS configuration',
		tags: ['Config', 'DNS'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const body = (await request.json()) as Partial<DnsConfig>;
				const dns = await configService.patchDns(body);
				return FetsResponse.json({
					success: true,
					data: dns,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	// DNS Servers routes
	.route({
		method: 'GET',
		path: '/config/dns/servers',
		description: 'List all DNS servers',
		tags: ['Config', 'DNS', 'Servers'],
		schemas: {
			request: {
				headers: authHeadersSchema,
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						servers: Type.Array(Type.Object({}, { additionalProperties: true })),
						total: Type.Number(),
					}),
				),
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async () => {
			try {
				const servers = await configService.getDnsServers();
				return FetsResponse.json({
					success: true,
					data: {
						servers,
						total: servers.length,
					},
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'GET',
		path: '/config/dns/servers/:tag',
		description: 'Get DNS server by tag',
		tags: ['Config', 'DNS', 'Servers'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const server = await configService.getDnsServer(tag);
				if (!server) {
					return FetsResponse.json(
						{ success: false as const, error: `DNS server '${tag}' not found`, code: 'NOT_FOUND' },
						{ status: 404 },
					);
				}
				return FetsResponse.json({
					success: true,
					data: server,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'POST',
		path: '/config/dns/servers',
		description: 'Create a new DNS server',
		tags: ['Config', 'DNS', 'Servers'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object(
					{
						tag: Type.String(),
						address: Type.String(),
					},
					{ additionalProperties: true },
				),
			},
			responses: {
				201: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const body = (await request.json()) as DnsServer;
				const server = await configService.createDnsServer(body);
				return FetsResponse.json(
					{
						success: true,
						data: server,
					},
					{ status: 201 },
				);
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'PUT',
		path: '/config/dns/servers/:tag',
		description: 'Replace a DNS server',
		tags: ['Config', 'DNS', 'Servers'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
				json: Type.Object(
					{
						tag: Type.String(),
						address: Type.String(),
					},
					{ additionalProperties: true },
				),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const body = (await request.json()) as DnsServer;
				const server = await configService.updateDnsServer(tag, body);
				return FetsResponse.json({
					success: true,
					data: server,
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
		method: 'DELETE',
		path: '/config/dns/servers/:tag',
		description: 'Delete a DNS server',
		tags: ['Config', 'DNS', 'Servers'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
			},
			responses: {
				200: apiResponseSchema(Type.Object({ message: Type.String() })),
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const deleted = await configService.deleteDnsServer(tag);
				if (!deleted) {
					return FetsResponse.json(
						{ success: false as const, error: `DNS server '${tag}' not found`, code: 'NOT_FOUND' },
						{ status: 404 },
					);
				}
				return FetsResponse.json({
					success: true,
					data: { message: `DNS server '${tag}' deleted` },
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	// DNS Rules routes
	.route({
		method: 'GET',
		path: '/config/dns/rules',
		description: 'List all DNS rules',
		tags: ['Config', 'DNS', 'Rules'],
		schemas: {
			request: {
				headers: authHeadersSchema,
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						rules: Type.Array(Type.Object({}, { additionalProperties: true })),
						total: Type.Number(),
					}),
				),
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async () => {
			try {
				const rules = await configService.getDnsRules();
				return FetsResponse.json({
					success: true,
					data: {
						rules,
						total: rules.length,
					},
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'GET',
		path: '/config/dns/rules/:index',
		description: 'Get DNS rule by index',
		tags: ['Config', 'DNS', 'Rules'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					index: Type.String(),
				}),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const index = Number.parseInt(request.params.index, 10);
				if (Number.isNaN(index)) {
					return FetsResponse.json(
						{ success: false as const, error: 'Invalid index', code: 'BAD_REQUEST' },
						{ status: 400 },
					);
				}
				const rule = await configService.getDnsRule(index);
				if (!rule) {
					return FetsResponse.json(
						{
							success: false as const,
							error: `DNS rule at index ${index} not found`,
							code: 'NOT_FOUND',
						},
						{ status: 404 },
					);
				}
				return FetsResponse.json({
					success: true,
					data: rule,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'POST',
		path: '/config/dns/rules',
		description: 'Create a new DNS rule',
		tags: ['Config', 'DNS', 'Rules'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object(
					{
						server: Type.String(),
					},
					{ additionalProperties: true },
				),
			},
			responses: {
				201: apiResponseSchema(
					Type.Object({
						rule: Type.Object({}, { additionalProperties: true }),
						index: Type.Number(),
					}),
				),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const body = (await request.json()) as DnsRule;
				const result = await configService.createDnsRule(body);
				return FetsResponse.json(
					{
						success: true,
						data: result,
					},
					{ status: 201 },
				);
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'PUT',
		path: '/config/dns/rules/:index',
		description: 'Replace a DNS rule',
		tags: ['Config', 'DNS', 'Rules'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					index: Type.String(),
				}),
				json: Type.Object(
					{
						server: Type.String(),
					},
					{ additionalProperties: true },
				),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const index = Number.parseInt(request.params.index, 10);
				if (Number.isNaN(index)) {
					return FetsResponse.json(
						{ success: false as const, error: 'Invalid index', code: 'BAD_REQUEST' },
						{ status: 400 },
					);
				}
				const body = (await request.json()) as DnsRule;
				const rule = await configService.updateDnsRule(index, body);
				return FetsResponse.json({
					success: true,
					data: rule,
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
		method: 'DELETE',
		path: '/config/dns/rules/:index',
		description: 'Delete a DNS rule',
		tags: ['Config', 'DNS', 'Rules'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					index: Type.String(),
				}),
			},
			responses: {
				200: apiResponseSchema(Type.Object({ message: Type.String() })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const index = Number.parseInt(request.params.index, 10);
				if (Number.isNaN(index)) {
					return FetsResponse.json(
						{ success: false as const, error: 'Invalid index', code: 'BAD_REQUEST' },
						{ status: 400 },
					);
				}
				const deleted = await configService.deleteDnsRule(index);
				if (!deleted) {
					return FetsResponse.json(
						{
							success: false as const,
							error: `DNS rule at index ${index} not found`,
							code: 'NOT_FOUND',
						},
						{ status: 404 },
					);
				}
				return FetsResponse.json({
					success: true,
					data: { message: `DNS rule at index ${index} deleted` },
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'POST',
		path: '/config/dns/rules/reorder',
		description: 'Reorder DNS rules',
		tags: ['Config', 'DNS', 'Rules'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object({
					fromIndex: Type.Number(),
					toIndex: Type.Number(),
				}),
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						rules: Type.Array(Type.Object({}, { additionalProperties: true })),
						total: Type.Number(),
					}),
				),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { fromIndex, toIndex } = await request.json();
				const rules = await configService.reorderDnsRules(fromIndex, toIndex);
				return FetsResponse.json({
					success: true,
					data: {
						rules,
						total: rules.length,
					},
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	// Log Config routes
	.route({
		method: 'GET',
		path: '/config/log',
		description: 'Get log configuration',
		tags: ['Config', 'Log'],
		schemas: {
			request: {
				headers: authHeadersSchema,
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async () => {
			try {
				const log = await configService.getLog();
				return FetsResponse.json({
					success: true,
					data: log,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'PUT',
		path: '/config/log',
		description: 'Replace log configuration',
		tags: ['Config', 'Log'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const body = (await request.json()) as LogConfig;
				const log = await configService.setLog(body);
				return FetsResponse.json({
					success: true,
					data: log,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'PATCH',
		path: '/config/log',
		description: 'Partially update log configuration',
		tags: ['Config', 'Log'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const body = (await request.json()) as Partial<LogConfig>;
				const log = await configService.patchLog(body);
				return FetsResponse.json({
					success: true,
					data: log,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	// NTP Config routes
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
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
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
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
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
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
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
	})
	// Experimental Config routes
	.route({
		method: 'GET',
		path: '/config/experimental',
		description: 'Get experimental configuration',
		tags: ['Config', 'Experimental'],
		schemas: {
			request: {
				headers: authHeadersSchema,
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async () => {
			try {
				const experimental = await configService.getExperimental();
				return FetsResponse.json({
					success: true,
					data: experimental,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'PUT',
		path: '/config/experimental',
		description: 'Replace experimental configuration',
		tags: ['Config', 'Experimental'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const body = (await request.json()) as ExperimentalConfig;
				const experimental = await configService.setExperimental(body);
				return FetsResponse.json({
					success: true,
					data: experimental,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'PATCH',
		path: '/config/experimental',
		description: 'Partially update experimental configuration',
		tags: ['Config', 'Experimental'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const body = (await request.json()) as Partial<ExperimentalConfig>;
				const experimental = await configService.patchExperimental(body);
				return FetsResponse.json({
					success: true,
					data: experimental,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'GET',
		path: '/singbox/version',
		description: 'Get sing-box binary version information',
		tags: ['Sing-box'],
		schemas: {
			request: {
				headers: authHeadersSchema,
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						version: Type.String(),
						tags: Type.Array(Type.String()),
						revision: Type.String(),
						cgo: Type.Boolean(),
					}),
				),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async () => {
			try {
				const versionInfo = await configService.getSingboxVersion();
				return FetsResponse.json({
					success: true,
					data: versionInfo,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'GET',
		path: '/singbox/check',
		description: 'Check sing-box binary availability and status',
		tags: ['Sing-box'],
		schemas: {
			request: {
				headers: authHeadersSchema,
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						available: Type.Boolean(),
						path: Type.String(),
						version: Type.Optional(Type.String()),
						error: Type.Optional(Type.String()),
					}),
				),
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async () => {
			try {
				const checkResult = await configService.checkSingboxBinary();
				return FetsResponse.json({
					success: true,
					data: checkResult,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
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
						hasChanges: Type.Boolean(),
						changes: Type.Array(
							Type.Object({
								type: Type.Union([
									Type.Literal('added'),
									Type.Literal('removed'),
									Type.Literal('modified'),
								]),
								path: Type.String(),
								oldValue: Type.Optional(Type.Unknown()),
								newValue: Type.Optional(Type.Unknown()),
							}),
						),
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
						hasChanges: Type.Boolean(),
						changes: Type.Array(
							Type.Object({
								type: Type.Union([
									Type.Literal('added'),
									Type.Literal('removed'),
									Type.Literal('modified'),
								]),
								path: Type.String(),
								oldValue: Type.Optional(Type.Unknown()),
								newValue: Type.Optional(Type.Unknown()),
							}),
						),
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
	})
	// Endpoints routes (sing-box 1.11.0+)
	.route({
		method: 'GET',
		path: '/config/endpoints',
		description: 'List all endpoints (WireGuard, Tailscale)',
		tags: ['Config', 'Endpoints'],
		schemas: {
			request: {
				headers: authHeadersSchema,
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						endpoints: Type.Array(Type.Object({}, { additionalProperties: true })),
						total: Type.Number(),
					}),
				),
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async () => {
			try {
				const endpoints = await configService.getEndpoints();
				return FetsResponse.json({
					success: true,
					data: {
						endpoints,
						total: endpoints.length,
					},
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'GET',
		path: '/config/endpoints/:tag',
		description: 'Get endpoint by tag',
		tags: ['Config', 'Endpoints'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const endpoint = await configService.getEndpoint(tag);
				if (!endpoint) {
					return FetsResponse.json(
						{ success: false as const, error: `Endpoint '${tag}' not found`, code: 'NOT_FOUND' },
						{ status: 404 },
					);
				}
				return FetsResponse.json({
					success: true,
					data: endpoint,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'POST',
		path: '/config/endpoints',
		description: 'Create a new endpoint (WireGuard or Tailscale)',
		tags: ['Config', 'Endpoints'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object(
					{
						type: Type.Union([Type.Literal('wireguard'), Type.Literal('tailscale')]),
						tag: Type.String(),
					},
					{ additionalProperties: true },
				),
			},
			responses: {
				201: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const body = (await request.json()) as Endpoint;
				const endpoint = await configService.createEndpoint(body);
				return FetsResponse.json(
					{
						success: true,
						data: endpoint,
					},
					{ status: 201 },
				);
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'PUT',
		path: '/config/endpoints/:tag',
		description: 'Replace an endpoint',
		tags: ['Config', 'Endpoints'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
				json: Type.Object(
					{
						type: Type.Union([Type.Literal('wireguard'), Type.Literal('tailscale')]),
						tag: Type.String(),
					},
					{ additionalProperties: true },
				),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const body = (await request.json()) as Endpoint;
				const endpoint = await configService.updateEndpoint(tag, body);
				return FetsResponse.json({
					success: true,
					data: endpoint,
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
		method: 'PATCH',
		path: '/config/endpoints/:tag',
		description: 'Partially update an endpoint',
		tags: ['Config', 'Endpoints'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const body = await request.json();
				const endpoint = await configService.patchEndpoint(tag, body);
				return FetsResponse.json({
					success: true,
					data: endpoint,
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
		method: 'DELETE',
		path: '/config/endpoints/:tag',
		description: 'Delete an endpoint',
		tags: ['Config', 'Endpoints'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						deleted: Type.Boolean(),
					}),
				),
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const deleted = await configService.deleteEndpoint(tag);
				if (!deleted) {
					return FetsResponse.json(
						{ success: false as const, error: `Endpoint '${tag}' not found`, code: 'NOT_FOUND' },
						{ status: 404 },
					);
				}
				return FetsResponse.json({
					success: true,
					data: { deleted: true },
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	// Services routes (sing-box 1.12.0+)
	.route({
		method: 'GET',
		path: '/config/services',
		description: 'List all services (CCM, DERP, OCM, Resolved, SSM-API)',
		tags: ['Config', 'Services'],
		schemas: {
			request: {
				headers: authHeadersSchema,
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						services: Type.Array(Type.Object({}, { additionalProperties: true })),
						total: Type.Number(),
					}),
				),
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async () => {
			try {
				const services = await configService.getServices();
				return FetsResponse.json({
					success: true,
					data: {
						services,
						total: services.length,
					},
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'GET',
		path: '/config/services/:tag',
		description: 'Get service by tag',
		tags: ['Config', 'Services'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const service = await configService.getService(tag);
				if (!service) {
					return FetsResponse.json(
						{ success: false as const, error: `Service '${tag}' not found`, code: 'NOT_FOUND' },
						{ status: 404 },
					);
				}
				return FetsResponse.json({
					success: true,
					data: service,
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'POST',
		path: '/config/services',
		description: 'Create a new service (CCM, DERP, OCM, Resolved, SSM-API)',
		tags: ['Config', 'Services'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				json: Type.Object(
					{
						type: Type.Union([
							Type.Literal('ccm'),
							Type.Literal('derp'),
							Type.Literal('ocm'),
							Type.Literal('resolved'),
							Type.Literal('ssm-api'),
						]),
						tag: Type.String(),
					},
					{ additionalProperties: true },
				),
			},
			responses: {
				201: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const body = (await request.json()) as Service;
				const service = await configService.createService(body);
				return FetsResponse.json(
					{
						success: true,
						data: service,
					},
					{ status: 201 },
				);
			} catch (error) {
				return handleError(error);
			}
		},
	})
	.route({
		method: 'PUT',
		path: '/config/services/:tag',
		description: 'Replace a service',
		tags: ['Config', 'Services'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
				json: Type.Object(
					{
						type: Type.Union([
							Type.Literal('ccm'),
							Type.Literal('derp'),
							Type.Literal('ocm'),
							Type.Literal('resolved'),
							Type.Literal('ssm-api'),
						]),
						tag: Type.String(),
					},
					{ additionalProperties: true },
				),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const body = (await request.json()) as Service;
				const service = await configService.updateService(tag, body);
				return FetsResponse.json({
					success: true,
					data: service,
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
		method: 'PATCH',
		path: '/config/services/:tag',
		description: 'Partially update a service',
		tags: ['Config', 'Services'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
				json: Type.Object({}, { additionalProperties: true }),
			},
			responses: {
				200: apiResponseSchema(Type.Object({}, { additionalProperties: true })),
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const body = await request.json();
				const service = await configService.patchService(tag, body);
				return FetsResponse.json({
					success: true,
					data: service,
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
		method: 'DELETE',
		path: '/config/services/:tag',
		description: 'Delete a service',
		tags: ['Config', 'Services'],
		schemas: {
			request: {
				headers: authHeadersSchema,
				params: Type.Object({
					tag: Type.String(),
				}),
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
						deleted: Type.Boolean(),
					}),
				),
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema,
			},
		},
		handler: async (request) => {
			try {
				const { tag } = request.params;
				const deleted = await configService.deleteService(tag);
				if (!deleted) {
					return FetsResponse.json(
						{ success: false as const, error: `Service '${tag}' not found`, code: 'NOT_FOUND' },
						{ status: 404 },
					);
				}
				return FetsResponse.json({
					success: true,
					data: { deleted: true },
				});
			} catch (error) {
				return handleError(error);
			}
		},
	})
	// Certificate API routes (sing-box 1.12.0+)
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
				200: apiResponseSchema(
					Type.Object({
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
						certificate_directory_path: Type.Optional(
							Type.Union([Type.String(), Type.Array(Type.String())]),
						),
					}),
				),
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
				json: Type.Object({
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
					certificate_directory_path: Type.Optional(
						Type.Union([Type.String(), Type.Array(Type.String())]),
					),
				}),
			},
			responses: {
				200: apiResponseSchema(
					Type.Object({
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
						certificate_directory_path: Type.Optional(
							Type.Union([Type.String(), Type.Array(Type.String())]),
						),
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
				200: apiResponseSchema(
					Type.Object({
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
						certificate_directory_path: Type.Optional(
							Type.Union([Type.String(), Type.Array(Type.String())]),
						),
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
	})
	// Export/Import routes
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
						config: Type.Object({}, { additionalProperties: true }),
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
					config: Type.Object({}, { additionalProperties: true }),
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
						config: Type.Object({}, { additionalProperties: true }),
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
