import { apiReference } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { fetsRouter } from './api/fets-router';
import { config } from './config';
import { requestLogger } from './middleware';

const app = new Hono();

app.use('*', cors());
app.use('*', requestLogger);

// OpenAPI docs available only in development
if (config.isDev) {
	app.get(
		'/docs',
		apiReference({
			url: '/openapi.json',
			theme: 'kepler',
		}),
	);
}

app.all('*', async (c) => {
	// Block OpenAPI docs in production
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
