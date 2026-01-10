import { config } from '@/config';
import { UnauthorizedError } from '@/utils/errors';
import { createMiddleware } from 'hono/factory';

export const authMiddleware = createMiddleware(async (c, next) => {
	if (!config.apiKey) {
		await next();
		return;
	}

	const authHeader = c.req.header('Authorization');
	const apiKeyHeader = c.req.header('X-API-Key');

	let token: string | undefined;

	if (authHeader?.startsWith('Bearer ')) {
		token = authHeader.slice(7);
	} else if (apiKeyHeader) {
		token = apiKeyHeader;
	}

	if (!token || token !== config.apiKey) {
		throw new UnauthorizedError('Invalid or missing API key');
	}

	await next();
});
