import { Type } from 'fets';

export const errorResponseSchema = Type.Object({
	success: Type.Literal(false),
	error: Type.String(),
	code: Type.Optional(Type.String()),
});

export const apiResponseSchema = <T extends ReturnType<typeof Type.Object>>(dataSchema: T) =>
	Type.Object({
		success: Type.Boolean(),
		data: Type.Optional(dataSchema),
		error: Type.Optional(Type.String()),
		code: Type.Optional(Type.String()),
	});

export const authHeadersSchema = {
	type: 'object',
	properties: {
		authorization: { type: 'string' },
		'x-api-key': { type: 'string' },
	},
} as const;

export const healthResponseSchema = Type.Object({
	status: Type.Union([Type.Literal('ok'), Type.Literal('error')]),
	timestamp: Type.String({ format: 'date-time' }),
	version: Type.String(),
});

export const restartStatsSchema = Type.Object({
	enabled: Type.Boolean(),
	count: Type.Number(),
	lastRestartAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
	nextRestartIn: Type.Union([Type.Number(), Type.Null()]),
	maxRestartsReached: Type.Boolean(),
});

export const serverStatusSchema = Type.Object({
	running: Type.Boolean(),
	pid: Type.Union([Type.Number(), Type.Null()]),
	uptime: Type.Union([Type.Number(), Type.Null()]),
	startedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
	version: Type.Union([Type.String(), Type.Null()]),
	restartStats: restartStatsSchema,
});

export const reloadServerResponseSchema = Type.Object({
	pid: Type.Number(),
	reloadedAt: Type.String({ format: 'date-time' }),
});

export const logsQuerySchema = Type.Object({
	limit: Type.Optional(Type.Number({ minimum: 1, maximum: 1000 })),
});

export const logsResponseSchema = Type.Object({
	logs: Type.Array(Type.String()),
	total: Type.Number(),
});

export const backupSchema = Type.Object({
	id: Type.String(),
	createdAt: Type.String({ format: 'date-time' }),
	reason: Type.String(),
	configHash: Type.String(),
	size: Type.Number(),
	filename: Type.String(),
});

export const validationResultSchema = Type.Object({
	valid: Type.Boolean(),
	errors: Type.Array(
		Type.Object({
			path: Type.String(),
			message: Type.String(),
			code: Type.String(),
		}),
	),
});

export const configChangeSchema = Type.Object({
	type: Type.Union([Type.Literal('added'), Type.Literal('removed'), Type.Literal('modified')]),
	path: Type.String(),
	oldValue: Type.Optional(Type.Unknown()),
	newValue: Type.Optional(Type.Unknown()),
});

export const genericObjectSchema = Type.Object({}, { additionalProperties: true });

export const messageResponseSchema = Type.Object({ message: Type.String() });

export const deletedResponseSchema = Type.Object({ deleted: Type.Boolean() });

export const listWithTotalSchema = (itemsKey: string, itemSchema: ReturnType<typeof Type.Object>) =>
	Type.Object({
		[itemsKey]: Type.Array(itemSchema),
		total: Type.Number(),
	});
