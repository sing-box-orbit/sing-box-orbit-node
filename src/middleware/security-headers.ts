import { createMiddleware } from 'hono/factory';
import { config } from '@/config';

export const securityHeaders = createMiddleware(async (c, next) => {
	await next();

	if (config.isProd) {
		c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	c.header('X-Content-Type-Options', 'nosniff');
	c.header('X-Frame-Options', 'DENY');
	c.header('X-XSS-Protection', '1; mode=block');
	c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
	c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
});
