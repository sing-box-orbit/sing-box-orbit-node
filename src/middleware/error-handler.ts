import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import type { ErrorHandler } from 'hono';

export const errorHandler: ErrorHandler = (err, c) => {
	logger.error('Request error', {
		message: err.message,
		stack: err.stack,
		path: c.req.path,
		method: c.req.method,
	});

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
