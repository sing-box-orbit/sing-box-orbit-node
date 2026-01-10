import { afterAll, beforeAll, describe, expect, mock, spyOn, test } from 'bun:test';

mock.module('@/config', () => ({
	config: {
		isDev: true,
		isProd: false,
		host: '0.0.0.0',
		port: 3333,
		apiKey: '',
		singbox: {
			binary: '/usr/bin/sing-box',
			configPath: '/etc/sing-box/config.json',
			workingDir: '/etc/sing-box',
			autoRestart: true,
			restartDelay: 1000,
			maxRestarts: 5,
			restartWindow: 60000,
		},
		logLevel: 'error',
	},
}));

const mockProcessService = {
	getStatus: mock(() =>
		Promise.resolve({
			running: true,
			pid: 12345,
			uptime: 3600000,
			startedAt: new Date().toISOString(),
			version: '1.8.0',
			restartStats: {
				enabled: true,
				count: 0,
				lastRestartAt: null,
				nextRestartIn: null,
				maxRestartsReached: false,
			},
		}),
	),
	reload: mock(() =>
		Promise.resolve({
			pid: 12345,
			reloadedAt: new Date().toISOString(),
		}),
	),
	getLogs: mock((limit?: number) => {
		const logs = ['log1', 'log2', 'log3', 'log4', 'log5'];
		return limit ? logs.slice(0, limit) : logs;
	}),
	getRestartStats: mock(() => ({
		enabled: true,
		count: 0,
		lastRestartAt: null,
		nextRestartIn: null,
		maxRestartsReached: false,
	})),
	resetRestartStats: mock(() => {}),
};

mock.module('@/services', () => ({
	processService: mockProcessService,
}));

const { app } = await import('@/app');

describe('API Integration Tests', () => {
	let consoleLogSpy: ReturnType<typeof spyOn>;
	let consoleWarnSpy: ReturnType<typeof spyOn>;
	let consoleErrorSpy: ReturnType<typeof spyOn>;

	beforeAll(() => {
		consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
		consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
		consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
	});

	afterAll(() => {
		consoleLogSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	describe('GET /health', () => {
		test('should return health status', async () => {
			const res = await app.request('/health');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.status).toBe('ok');
			expect(body.version).toBe('0.1.0');
			expect(body.timestamp).toBeDefined();
		});

		test('should return valid ISO timestamp', async () => {
			const res = await app.request('/health');
			const body = await res.json();

			const timestamp = new Date(body.timestamp);
			expect(timestamp.toISOString()).toBe(body.timestamp);
		});
	});

	describe('GET /server/status', () => {
		test('should return server status', async () => {
			const res = await app.request('/server/status');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data).toBeDefined();
			expect(body.data.running).toBe(true);
			expect(body.data.pid).toBe(12345);
		});

		test('should include restart stats', async () => {
			const res = await app.request('/server/status');
			const body = await res.json();

			expect(body.data.restartStats).toBeDefined();
			expect(body.data.restartStats.enabled).toBe(true);
			expect(body.data.restartStats.count).toBe(0);
		});
	});

	describe('POST /server/reload', () => {
		test('should reload server configuration', async () => {
			const res = await app.request('/server/reload', {
				method: 'POST',
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.pid).toBe(12345);
			expect(body.data.reloadedAt).toBeDefined();
		});
	});

	describe('GET /server/logs', () => {
		test('should return logs without limit', async () => {
			const res = await app.request('/server/logs');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.logs).toBeArray();
			expect(body.data.total).toBe(5);
		});

		test('should handle limit query parameter', async () => {
			const res = await app.request('/server/logs?limit=50');
			expect([200, 400]).toContain(res.status);
		});
	});

	describe('POST /server/restart-stats/reset', () => {
		test('should reset restart stats', async () => {
			const res = await app.request('/server/restart-stats/reset', {
				method: 'POST',
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(mockProcessService.resetRestartStats).toHaveBeenCalled();
		});
	});

	describe('Unknown routes', () => {
		test('should return error for unknown routes', async () => {
			const res = await app.request('/unknown/route');

			expect([404, 500]).toContain(res.status);
		});
	});

	describe('OpenAPI docs', () => {
		test('should return OpenAPI spec in development', async () => {
			const res = await app.request('/openapi.json');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.openapi).toBeDefined();
			expect(body.info.title).toBe('sing-box-orbit-node API');
		});
	});
});

describe('API with Authentication', () => {
	const API_KEY = 'test-api-key';

	let consoleLogSpy: ReturnType<typeof spyOn>;
	let consoleWarnSpy: ReturnType<typeof spyOn>;
	let consoleErrorSpy: ReturnType<typeof spyOn>;

	beforeAll(async () => {
		consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
		consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
		consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
	});

	afterAll(() => {
		consoleLogSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	test('should reject unauthenticated requests when API_KEY is set', async () => {
		mock.module('@/config', () => ({
			config: {
				isDev: true,
				isProd: false,
				apiKey: API_KEY,
				logLevel: 'error',
			},
		}));

		const { fetsRouter } = await import('@/api/fets-router');

		const res = await fetsRouter.fetch(new Request('http://localhost/health'));

		expect(res.status).toBe(401);

		const body = await res.json();
		expect(body.success).toBe(false);
		expect(body.code).toBe('UNAUTHORIZED');
	});

	test('should accept authenticated requests with Bearer token', async () => {
		mock.module('@/config', () => ({
			config: {
				isDev: true,
				isProd: false,
				apiKey: API_KEY,
				logLevel: 'error',
			},
		}));

		const { fetsRouter } = await import('@/api/fets-router');

		const res = await fetsRouter.fetch(
			new Request('http://localhost/health', {
				headers: {
					Authorization: `Bearer ${API_KEY}`,
				},
			}),
		);

		expect(res.status).toBe(200);
	});

	test('should accept authenticated requests with X-API-Key', async () => {
		mock.module('@/config', () => ({
			config: {
				isDev: true,
				isProd: false,
				apiKey: API_KEY,
				logLevel: 'error',
			},
		}));

		const { fetsRouter } = await import('@/api/fets-router');

		const res = await fetsRouter.fetch(
			new Request('http://localhost/health', {
				headers: {
					'X-API-Key': API_KEY,
				},
			}),
		);

		expect(res.status).toBe(200);
	});
});
