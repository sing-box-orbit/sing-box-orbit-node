import { logger } from '@/utils/logger';
import { createMiddleware } from 'hono/factory';

export const requestLogger = createMiddleware(async (c, next) => {
	const start = Date.now();
	const method = c.req.method;
	const path = c.req.path;

	logger.debug(`--> ${method} ${path}`);

	await next();

	const duration = Date.now() - start;
	const status = c.res.status;

	const logFn = status >= 400 ? logger.warn : logger.info;
	logFn.call(logger, `<-- ${method} ${path} ${status} ${duration}ms`);
});
