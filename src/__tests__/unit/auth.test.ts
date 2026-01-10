import { describe, expect, mock, test } from 'bun:test';
import { Hono } from 'hono';

describe('Auth Middleware', () => {
	describe('when API_KEY is not set', () => {
		test('should allow requests without authentication', async () => {
			mock.module('@/config', () => ({
				config: { apiKey: '' },
			}));

			const { authMiddleware } = await import('@/middleware/auth');

			const app = new Hono();
			app.use('*', authMiddleware);
			app.get('/test', (c) => c.json({ success: true }));

			const res = await app.request('/test');

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ success: true });
		});
	});

	describe('when API_KEY is set', () => {
		const API_KEY = 'test-secret-key';

		test('should reject requests without any auth header', async () => {
			mock.module('@/config', () => ({
				config: { apiKey: API_KEY },
			}));

			const { authMiddleware } = await import('@/middleware/auth');

			const app = new Hono();
			app.use('*', authMiddleware);
			app.get('/test', (c) => c.json({ success: true }));

			app.onError((err, c) => {
				return c.json({ error: err.message }, 401);
			});

			const res = await app.request('/test');

			expect(res.status).toBe(401);
		});

		test('should accept valid Bearer token', async () => {
			mock.module('@/config', () => ({
				config: { apiKey: API_KEY },
			}));

			const { authMiddleware } = await import('@/middleware/auth');

			const app = new Hono();
			app.use('*', authMiddleware);
			app.get('/test', (c) => c.json({ success: true }));

			const res = await app.request('/test', {
				headers: {
					Authorization: `Bearer ${API_KEY}`,
				},
			});

			expect(res.status).toBe(200);
		});

		test('should accept valid X-API-Key header', async () => {
			mock.module('@/config', () => ({
				config: { apiKey: API_KEY },
			}));

			const { authMiddleware } = await import('@/middleware/auth');

			const app = new Hono();
			app.use('*', authMiddleware);
			app.get('/test', (c) => c.json({ success: true }));

			const res = await app.request('/test', {
				headers: {
					'X-API-Key': API_KEY,
				},
			});

			expect(res.status).toBe(200);
		});

		test('should reject invalid Bearer token', async () => {
			mock.module('@/config', () => ({
				config: { apiKey: API_KEY },
			}));

			const { authMiddleware } = await import('@/middleware/auth');

			const app = new Hono();
			app.use('*', authMiddleware);
			app.get('/test', (c) => c.json({ success: true }));
			app.onError((err, c) => c.json({ error: err.message }, 401));

			const res = await app.request('/test', {
				headers: {
					Authorization: 'Bearer wrong-key',
				},
			});

			expect(res.status).toBe(401);
		});

		test('should reject invalid X-API-Key', async () => {
			mock.module('@/config', () => ({
				config: { apiKey: API_KEY },
			}));

			const { authMiddleware } = await import('@/middleware/auth');

			const app = new Hono();
			app.use('*', authMiddleware);
			app.get('/test', (c) => c.json({ success: true }));
			app.onError((err, c) => c.json({ error: err.message }, 401));

			const res = await app.request('/test', {
				headers: {
					'X-API-Key': 'wrong-key',
				},
			});

			expect(res.status).toBe(401);
		});

		test('should prefer Bearer token over X-API-Key', async () => {
			mock.module('@/config', () => ({
				config: { apiKey: API_KEY },
			}));

			const { authMiddleware } = await import('@/middleware/auth');

			const app = new Hono();
			app.use('*', authMiddleware);
			app.get('/test', (c) => c.json({ success: true }));

			const res = await app.request('/test', {
				headers: {
					Authorization: `Bearer ${API_KEY}`,
					'X-API-Key': 'wrong-key',
				},
			});

			expect(res.status).toBe(200);
		});

		test('should reject malformed Authorization header', async () => {
			mock.module('@/config', () => ({
				config: { apiKey: API_KEY },
			}));

			const { authMiddleware } = await import('@/middleware/auth');

			const app = new Hono();
			app.use('*', authMiddleware);
			app.get('/test', (c) => c.json({ success: true }));
			app.onError((err, c) => c.json({ error: err.message }, 401));

			const res = await app.request('/test', {
				headers: {
					Authorization: API_KEY,
				},
			});

			expect(res.status).toBe(401);
		});
	});
});
