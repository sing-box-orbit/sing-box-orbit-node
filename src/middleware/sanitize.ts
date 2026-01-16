import { createMiddleware } from 'hono/factory';

const MAX_BODY_SIZE = 10 * 1024 * 1024;

export const sanitizeMiddleware = createMiddleware(async (c, next) => {
	const contentLength = c.req.header('Content-Length');
	if (contentLength && Number.parseInt(contentLength, 10) > MAX_BODY_SIZE) {
		return c.json(
			{
				success: false,
				error: 'Request body too large',
				code: 'PAYLOAD_TOO_LARGE',
			},
			413,
		);
	}

	await next();
});
