import { rateLimiter as honoRateLimiter } from 'hono-rate-limiter';
import { config } from '@/config';
import { logger } from '@/utils/logger';

const getClientIP = (c: { req: { header: (name: string) => string | undefined } }): string => {
	return (
		c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
		c.req.header('x-real-ip') ||
		c.req.header('cf-connecting-ip') ||
		'unknown'
	);
};

export const rateLimiter = honoRateLimiter({
	windowMs: config.rateLimit.windowMs,
	limit: config.rateLimit.maxRequests,
	standardHeaders: 'draft-6',
	keyGenerator: (c) => getClientIP(c),
	skip: () => !config.rateLimit.enabled,
	handler: (c) => {
		const ip = getClientIP(c);
		logger.warn(`Rate limit exceeded for ${ip}`);
		return c.json(
			{
				success: false,
				error: 'Too many requests',
				code: 'RATE_LIMIT_EXCEEDED',
			},
			429,
		);
	},
});
