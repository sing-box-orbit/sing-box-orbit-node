import { resolve } from 'node:path';
import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { fetsRouter } from './api/fets-router';
import { config } from './config';
import {
	authMiddleware,
	errorHandler,
	rateLimiter,
	requestLogger,
	sanitizeMiddleware,
	securityHeaders,
} from './middleware';

const app = new Hono();

app.onError(errorHandler);

app.use(
	'*',
	cors({
		origin: config.corsOrigins,
		credentials: true,
	}),
);
app.use('*', securityHeaders);
app.use('*', sanitizeMiddleware);
app.use('*', rateLimiter);
app.use('*', requestLogger);

app.get('/favicon.ico', (c) => c.body(null, 204));

if (config.isDev) {
	const scalarBundlePath = resolve(
		import.meta.dir,
		'../node_modules/@scalar/api-reference/dist/browser/standalone.js',
	);

	app.get('/scalar', async () => {
		const file = Bun.file(scalarBundlePath);
		return new Response(file, {
			headers: { 'Content-Type': 'application/javascript' },
		});
	});

	app.get(
		'/docs',
		Scalar({
			url: '/openapi.json',
			theme: 'kepler',
			cdn: '/scalar',
		}),
	);
}

app.use('*', authMiddleware);

app.all('*', async (c) => {
	if (config.isProd && (c.req.path === '/openapi.json' || c.req.path === '/docs')) {
		return c.json(
			{
				success: false,
				error: 'Not found',
				code: 'NOT_FOUND',
			},
			404,
		);
	}

	const response = await fetsRouter.fetch(c.req.raw, {
		env: c.env,
	});

	if (response.status === 500) {
		const text = await response.text();
		if (text === 'Internal Server Error' || text.includes('Cannot')) {
			return c.json(
				{
					success: false,
					error: 'Not found',
					code: 'NOT_FOUND',
				},
				404,
			);
		}
		return c.json({ success: false, error: text, code: 'INTERNAL_ERROR' }, 500);
	}

	return response;
});

export { app };
