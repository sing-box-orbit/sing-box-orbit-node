import type { ErrorHandler } from 'hono';
import { config } from '@/config';
import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

export const errorHandler: ErrorHandler = (err, c) => {
	const logData: Record<string, unknown> = {
		message: err.message,
		path: c.req.path,
		method: c.req.method,
	};

	if (config.isDev) {
		logData.stack = err.stack;
	}

	logger.error('Request error', logData);

	if (err instanceof AppError) {
		return c.json(
			{
				success: false,
				error: err.message,
				code: err.code,
			},
			err.statusCode as 400 | 401 | 404 | 409 | 500,
		);
	}

	return c.json(
		{
			success: false,
			error: 'Internal server error',
			code: 'INTERNAL_ERROR',
		},
		500,
	);
};
