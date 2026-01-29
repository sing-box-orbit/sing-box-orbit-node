import { timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import { config } from '@/config';
import { UnauthorizedError } from '@/utils/errors';

function timingSafeCompare(a: string, b: string): boolean {
	const maxLen = Math.max(a.length, b.length);
	const bufA = Buffer.alloc(maxLen);
	const bufB = Buffer.alloc(maxLen);
	bufA.write(a);
	bufB.write(b);
	return a.length === b.length && timingSafeEqual(bufA, bufB);
}

const PUBLIC_PATHS = ['/health'];
const DEV_PUBLIC_PATHS = ['/docs', '/openapi.json'];

export const authMiddleware = createMiddleware(async (c, next) => {
	const isPublic = PUBLIC_PATHS.includes(c.req.path);
	const isDevPublic = config.isDev && DEV_PUBLIC_PATHS.includes(c.req.path);

	if (!config.apiKey || isPublic || isDevPublic) {
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

	if (!token || !timingSafeCompare(token, config.apiKey)) {
		throw new UnauthorizedError('Invalid or missing API key');
	}

	await next();
});
