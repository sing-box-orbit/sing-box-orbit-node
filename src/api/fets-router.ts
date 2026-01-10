import { createRouter, Response as FetsResponse, Type } from 'fets';
import { config } from '@/config';
import { processService } from '@/services';
import { AppError } from '@/utils/errors';

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

const serverStatusSchema = Type.Object({
	running: Type.Boolean(),
	pid: Type.Union([Type.Number(), Type.Null()]),
	uptime: Type.Union([Type.Number(), Type.Null()]),
	startedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
	version: Type.Union([Type.String(), Type.Null()]),
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

function checkAuth(headers: { get(name: string): string | null }) {
	if (!config.apiKey) {
		return null;
	}

	const authHeader = headers.get('authorization');
	const apiKeyHeader = headers.get('x-api-key');

	let token: string | undefined;

	if (authHeader?.startsWith('Bearer ')) {
		token = authHeader.slice(7);
	} else if (apiKeyHeader) {
		token = apiKeyHeader;
	}

	if (!token || token !== config.apiKey) {
		return FetsResponse.json(
			{ success: false as const, error: 'Invalid or missing API key', code: 'UNAUTHORIZED' },
			{ status: 401 },
		);
	}

	return null;
}

export const fetsRouter = createRouter({
	landingPage: false,
	openAPI: {
		info: {
			title: 'sing-box-orbit-node API',
			description: 'REST API for managing sing-box server',
			version: '0.1.0',
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
		handler: (request) => {
			const authError = checkAuth(request.headers);
			if (authError) return authError;

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
		handler: async (request) => {
			const authError = checkAuth(request.headers);
			if (authError) return authError;

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
		handler: async (request) => {
			const authError = checkAuth(request.headers);
			if (authError) return authError;

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
			const authError = checkAuth(request.headers);
			if (authError) return authError;

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
	});
