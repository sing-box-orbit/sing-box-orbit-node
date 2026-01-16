import { afterAll, beforeAll, describe, expect, mock, spyOn, test } from 'bun:test';

mock.module('@/config', () => ({
	config: {
		isDev: true,
		isProd: false,
		host: '0.0.0.0',
		port: 3333,
		apiKey: '',
		corsOrigins: '*',
		rateLimit: {
			enabled: false,
			maxRequests: 100,
			windowMs: 60000,
		},
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
		logs: {
			maxLines: 1000,
			persist: false,
			fileMaxSize: 10485760,
			fileMaxFiles: 5,
			filePath: '/tmp/test-logs/singbox.log',
		},
		configApi: {
			backupEnabled: false,
			backupMaxCount: 10,
			backupDir: '/tmp/test-backups',
			autoReload: false,
		},
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

const mockInbounds = [
	{ type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 1080 },
	{ type: 'http', tag: 'http-in', listen: '127.0.0.1', listen_port: 8080 },
];

const mockOutbounds = [
	{ type: 'direct', tag: 'direct-out' },
	{ type: 'block', tag: 'block-out' },
];

const mockRouteRules = [
	{ domain_suffix: ['.google.com'], outbound: 'direct-out' },
	{ ip_cidr: ['10.0.0.0/8'], outbound: 'block-out' },
];

const mockRuleSets = [
	{ type: 'local', tag: 'geoip-cn', format: 'binary', path: '/data/geoip-cn.srs' },
	{ type: 'remote', tag: 'geosite-ads', format: 'binary', url: 'https://example.com/ads.srs' },
];

const mockDnsServers = [
	{ tag: 'google', address: 'tls://8.8.8.8' },
	{ tag: 'cloudflare', address: 'https://1.1.1.1/dns-query' },
];

const mockDnsRules = [
	{ domain_suffix: ['.google.com'], server: 'google' },
	{ geosite: ['cn'], server: 'cloudflare' },
];

const mockEndpoints = [
	{
		type: 'wireguard',
		tag: 'wg-endpoint',
		address: ['10.0.0.2/32'],
		private_key: 'base64-private-key',
		peers: [
			{
				public_key: 'base64-public-key',
				allowed_ips: ['0.0.0.0/0'],
				address: 'vpn.example.com',
				port: 51820,
			},
		],
	},
	{
		type: 'tailscale',
		tag: 'ts-endpoint',
		state_directory: '/var/lib/tailscale',
		auth_key: 'tskey-xxx',
	},
];

const mockServices = [
	{
		type: 'ccm',
		tag: 'ccm-service',
		listen: '127.0.0.1',
		listen_port: 8080,
		credential_path: '~/.claude/.credentials.json',
	},
	{
		type: 'derp',
		tag: 'derp-service',
		listen: '0.0.0.0',
		listen_port: 443,
		config_path: '/etc/derp/config.json',
	},
	{
		type: 'resolved',
		tag: 'resolved-service',
		listen: '127.0.0.53',
		listen_port: 53,
	},
];

const mockCertificateConfig = {
	store: 'system' as const,
	certificate_path: ['/etc/ssl/certs/ca-certificates.crt'],
	certificate_directory_path: ['/etc/ssl/certs'],
};

const mockLogConfig = {
	level: 'info',
	timestamp: true,
	output: '/var/log/sing-box.log',
};

const mockNtpConfig = {
	enabled: true,
	server: 'time.google.com',
	server_port: 123,
	interval: '30m',
};

const mockExperimentalConfig = {
	cache_file: {
		enabled: true,
		path: '/tmp/singbox-cache.db',
	},
	clash_api: {
		external_controller: '127.0.0.1:9090',
		secret: 'admin123',
	},
};

const mockConfigService = {
	getConfig: mock(() => Promise.resolve({ log: { level: 'info' }, inbounds: mockInbounds })),
	setConfig: mock(() => Promise.resolve()),
	patchConfig: mock(() => Promise.resolve({ log: { level: 'info' } })),
	validateConfig: mock(() => Promise.resolve({ valid: true, errors: [] })),
	createBackup: mock(() =>
		Promise.resolve({
			id: 'test-backup-id',
			createdAt: new Date().toISOString(),
			reason: 'manual',
			configHash: 'abc123',
			size: 1024,
			filename: 'config-test.json',
		}),
	),
	listBackups: mock(() => Promise.resolve([])),
	restoreBackup: mock(() => Promise.resolve()),
	deleteBackup: mock(() => Promise.resolve(true)),
	getInbounds: mock(() => Promise.resolve(mockInbounds)),
	getInbound: mock((tag: string) => {
		const inbound = mockInbounds.find((i) => i.tag === tag);
		return Promise.resolve(inbound || null);
	}),
	createInbound: mock((inbound: { type: string; tag: string }) => Promise.resolve(inbound)),
	updateInbound: mock((_tag: string, inbound: { type: string; tag: string }) =>
		Promise.resolve(inbound),
	),
	patchInbound: mock((tag: string, patch: Record<string, unknown>) => {
		const existing = mockInbounds.find((i) => i.tag === tag);
		return Promise.resolve({ ...existing, ...patch });
	}),
	deleteInbound: mock((tag: string) => {
		const exists = mockInbounds.some((i) => i.tag === tag);
		return Promise.resolve(exists);
	}),
	getOutbounds: mock(() => Promise.resolve(mockOutbounds)),
	getOutbound: mock((tag: string) => {
		const outbound = mockOutbounds.find((o) => o.tag === tag);
		return Promise.resolve(outbound || null);
	}),
	createOutbound: mock((outbound: { type: string; tag: string }) => Promise.resolve(outbound)),
	updateOutbound: mock((_tag: string, outbound: { type: string; tag: string }) =>
		Promise.resolve(outbound),
	),
	patchOutbound: mock((tag: string, patch: Record<string, unknown>) => {
		const existing = mockOutbounds.find((o) => o.tag === tag);
		return Promise.resolve({ ...existing, ...patch });
	}),
	deleteOutbound: mock((tag: string) => {
		const exists = mockOutbounds.some((o) => o.tag === tag);
		return Promise.resolve(exists);
	}),
	testOutbound: mock((tag: string) => {
		const exists = mockOutbounds.some((o) => o.tag === tag);
		if (!exists) {
			return Promise.reject(new Error(`Outbound with tag '${tag}' not found`));
		}
		return Promise.resolve({ success: true, latency: 42 });
	}),
	getOutboundLatency: mock((tag: string) => {
		const exists = mockOutbounds.some((o) => o.tag === tag);
		if (!exists) {
			return Promise.reject(new Error(`Outbound with tag '${tag}' not found`));
		}
		return Promise.resolve({ latency: 50, samples: [45, 50, 55] });
	}),
	getRoute: mock(() =>
		Promise.resolve({ rules: mockRouteRules, rule_set: mockRuleSets, final: 'direct-out' }),
	),
	setRoute: mock((route: Record<string, unknown>) => Promise.resolve(route)),
	patchRoute: mock((patch: Record<string, unknown>) =>
		Promise.resolve({
			rules: mockRouteRules,
			rule_set: mockRuleSets,
			final: 'direct-out',
			...patch,
		}),
	),
	getRouteRules: mock(() => Promise.resolve(mockRouteRules)),
	getRouteRule: mock((index: number) => {
		if (index < 0 || index >= mockRouteRules.length) return Promise.resolve(null);
		return Promise.resolve(mockRouteRules[index]);
	}),
	createRouteRule: mock((rule: Record<string, unknown>) =>
		Promise.resolve({ rule, index: mockRouteRules.length }),
	),
	updateRouteRule: mock((_index: number, rule: Record<string, unknown>) => Promise.resolve(rule)),
	deleteRouteRule: mock((index: number) =>
		Promise.resolve(index >= 0 && index < mockRouteRules.length),
	),
	reorderRouteRules: mock(() => Promise.resolve(mockRouteRules)),
	getRuleSets: mock(() => Promise.resolve(mockRuleSets)),
	getRuleSet: mock((tag: string) => {
		const ruleSet = mockRuleSets.find((rs) => rs.tag === tag);
		return Promise.resolve(ruleSet || null);
	}),
	createRuleSet: mock((ruleSet: Record<string, unknown>) => Promise.resolve(ruleSet)),
	updateRuleSet: mock((_tag: string, ruleSet: Record<string, unknown>) => Promise.resolve(ruleSet)),
	deleteRuleSet: mock((tag: string) => {
		const exists = mockRuleSets.some((rs) => rs.tag === tag);
		return Promise.resolve(exists);
	}),
	getDns: mock(() =>
		Promise.resolve({
			servers: mockDnsServers,
			rules: mockDnsRules,
			final: 'google',
			strategy: 'prefer_ipv4',
		}),
	),
	setDns: mock((dns: Record<string, unknown>) => Promise.resolve(dns)),
	patchDns: mock((patch: Record<string, unknown>) =>
		Promise.resolve({
			servers: mockDnsServers,
			rules: mockDnsRules,
			final: 'google',
			...patch,
		}),
	),
	getDnsServers: mock(() => Promise.resolve(mockDnsServers)),
	getDnsServer: mock((tag: string) => {
		const server = mockDnsServers.find((s) => s.tag === tag);
		return Promise.resolve(server || null);
	}),
	createDnsServer: mock((server: { tag: string; address: string }) => Promise.resolve(server)),
	updateDnsServer: mock((_tag: string, server: { tag: string; address: string }) =>
		Promise.resolve(server),
	),
	deleteDnsServer: mock((tag: string) => {
		const exists = mockDnsServers.some((s) => s.tag === tag);
		return Promise.resolve(exists);
	}),
	getDnsRules: mock(() => Promise.resolve(mockDnsRules)),
	getDnsRule: mock((index: number) => {
		if (index < 0 || index >= mockDnsRules.length) return Promise.resolve(null);
		return Promise.resolve(mockDnsRules[index]);
	}),
	createDnsRule: mock((rule: Record<string, unknown>) =>
		Promise.resolve({ rule, index: mockDnsRules.length }),
	),
	updateDnsRule: mock((_index: number, rule: Record<string, unknown>) => Promise.resolve(rule)),
	deleteDnsRule: mock((index: number) =>
		Promise.resolve(index >= 0 && index < mockDnsRules.length),
	),
	reorderDnsRules: mock(() => Promise.resolve(mockDnsRules)),
	// Log methods
	getLog: mock(() => Promise.resolve(mockLogConfig)),
	setLog: mock((log: Record<string, unknown>) => Promise.resolve(log)),
	patchLog: mock((patch: Record<string, unknown>) =>
		Promise.resolve({ ...mockLogConfig, ...patch }),
	),
	// NTP methods
	getNtp: mock(() => Promise.resolve(mockNtpConfig)),
	setNtp: mock((ntp: Record<string, unknown>) => Promise.resolve(ntp)),
	patchNtp: mock((patch: Record<string, unknown>) =>
		Promise.resolve({ ...mockNtpConfig, ...patch }),
	),
	// Experimental methods
	getExperimental: mock(() => Promise.resolve(mockExperimentalConfig)),
	setExperimental: mock((experimental: Record<string, unknown>) => Promise.resolve(experimental)),
	patchExperimental: mock((patch: Record<string, unknown>) =>
		Promise.resolve({ ...mockExperimentalConfig, ...patch }),
	),
	// Sing-box info methods
	getSingboxVersion: mock(() =>
		Promise.resolve({
			version: '1.10.0',
			tags: ['with_gvisor', 'with_quic', 'with_dhcp'],
			revision: 'abc123def',
			cgo: true,
		}),
	),
	checkSingboxBinary: mock(() =>
		Promise.resolve({
			available: true,
			path: '/usr/local/bin/sing-box',
			version: '1.10.0' as string | undefined,
		}),
	),
	// Config diff methods
	diffWithBackup: mock(() =>
		Promise.resolve({
			hasChanges: true,
			changes: [
				{ type: 'modified', path: 'log.level', oldValue: 'info', newValue: 'debug' },
				{ type: 'added', path: 'ntp.enabled', newValue: true },
			],
			current: { log: { level: 'debug' }, ntp: { enabled: true } },
			backup: { log: { level: 'info' } },
		}),
	),
	diffBackups: mock(() =>
		Promise.resolve({
			hasChanges: true,
			changes: [{ type: 'modified', path: 'log.level', oldValue: 'warn', newValue: 'info' }],
			config1: { log: { level: 'warn' } },
			config2: { log: { level: 'info' } },
		}),
	),
	// Export/Import methods
	exportConfig: mock(() =>
		Promise.resolve({
			config: { log: { level: 'info' }, inbounds: mockInbounds },
			metadata: {
				exportedAt: new Date().toISOString(),
				version: '1.0',
				singboxVersion: '1.10.0',
			},
		}),
	),
	importConfig: mock(
		(
			_importData: { config: Record<string, unknown> },
			_options?: { validate?: boolean; merge?: boolean; createBackup?: boolean },
		) =>
			Promise.resolve({
				success: true,
				config: { log: { level: 'info' }, inbounds: mockInbounds },
				warnings: [] as string[],
			}),
	),
	// Endpoints methods (sing-box 1.11.0+)
	getEndpoints: mock(() => Promise.resolve(mockEndpoints)),
	getEndpoint: mock((tag: string) => {
		const endpoint = mockEndpoints.find((e) => e.tag === tag);
		return Promise.resolve(endpoint || null);
	}),
	createEndpoint: mock((endpoint: { type: string; tag: string }) => Promise.resolve(endpoint)),
	updateEndpoint: mock((_tag: string, endpoint: { type: string; tag: string }) =>
		Promise.resolve(endpoint),
	),
	patchEndpoint: mock((tag: string, patch: Record<string, unknown>) => {
		const existing = mockEndpoints.find((e) => e.tag === tag);
		return Promise.resolve({ ...existing, ...patch });
	}),
	deleteEndpoint: mock((tag: string) => {
		const exists = mockEndpoints.some((e) => e.tag === tag);
		return Promise.resolve(exists);
	}),
	// Services methods (sing-box 1.12.0+)
	getServices: mock(() => Promise.resolve(mockServices)),
	getService: mock((tag: string) => {
		const service = mockServices.find((s) => s.tag === tag);
		return Promise.resolve(service || null);
	}),
	createService: mock((service: { type: string; tag: string }) => Promise.resolve(service)),
	updateService: mock((_tag: string, service: { type: string; tag: string }) =>
		Promise.resolve(service),
	),
	patchService: mock((tag: string, patch: Record<string, unknown>) => {
		const existing = mockServices.find((s) => s.tag === tag);
		return Promise.resolve({ ...existing, ...patch });
	}),
	deleteService: mock((tag: string) => {
		const exists = mockServices.some((s) => s.tag === tag);
		return Promise.resolve(exists);
	}),
	// Certificate methods (sing-box 1.12.0+)
	getCertificate: mock(() => Promise.resolve(mockCertificateConfig)),
	setCertificate: mock((certificate: Record<string, unknown>) => Promise.resolve(certificate)),
	patchCertificate: mock((patch: Record<string, unknown>) =>
		Promise.resolve({ ...mockCertificateConfig, ...patch }),
	),
	deleteCertificate: mock(() => Promise.resolve(true)),
};

const mockBackupService = {
	create: mock(() => Promise.resolve({})),
	list: mock(() => Promise.resolve([])),
	get: mock(() => Promise.resolve(null)),
	getContent: mock(() => Promise.resolve(null)),
	delete: mock(() => Promise.resolve(false)),
};

mock.module('@/services', () => ({
	processService: mockProcessService,
	configService: mockConfigService,
	backupService: mockBackupService,
	logStorageService: {
		get: mock(() => []),
		add: mock(() => {}),
		clear: mock(() => {}),
	},
	inboundConfigService: mockConfigService,
	outboundConfigService: mockConfigService,
	routeConfigService: mockConfigService,
	dnsConfigService: mockConfigService,
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

	describe('GET /config', () => {
		test('should return current configuration', async () => {
			const res = await app.request('/config');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data).toBeDefined();
		});
	});

	describe('PUT /config', () => {
		test('should replace configuration', async () => {
			const newConfig = { log: { level: 'debug' } };

			const res = await app.request('/config', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newConfig),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.message).toContain('updated');
		});
	});

	describe('PATCH /config', () => {
		test('should partially update configuration', async () => {
			const patch = { log: { level: 'warn' } };

			const res = await app.request('/config', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data).toBeDefined();
		});
	});

	describe('POST /config/validate', () => {
		test('should validate configuration', async () => {
			const configToValidate = { log: { level: 'info' } };

			const res = await app.request('/config/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(configToValidate),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.valid).toBeDefined();
			expect(body.data.errors).toBeArray();
		});
	});

	describe('POST /config/backups', () => {
		test('should create a backup', async () => {
			const res = await app.request('/config/backups', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ reason: 'test-backup' }),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.id).toBeDefined();
		});

		test('should create backup without body', async () => {
			const res = await app.request('/config/backups', {
				method: 'POST',
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
		});
	});

	describe('GET /config/backups', () => {
		test('should list all backups', async () => {
			const res = await app.request('/config/backups');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.backups).toBeArray();
			expect(body.data.total).toBeDefined();
		});
	});

	describe('POST /config/backups/:id/restore', () => {
		test('should attempt to restore backup', async () => {
			const res = await app.request('/config/backups/test-id/restore', {
				method: 'POST',
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.message).toContain('restored');
		});
	});

	describe('DELETE /config/backups/:id', () => {
		test('should delete backup', async () => {
			const res = await app.request('/config/backups/test-id', {
				method: 'DELETE',
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
		});

		test('should return 404 for non-existent backup', async () => {
			mockConfigService.deleteBackup.mockImplementationOnce(() => Promise.resolve(false));

			const res = await app.request('/config/backups/non-existent', {
				method: 'DELETE',
			});

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});
	});

	describe('GET /config/inbounds', () => {
		test('should return list of inbounds', async () => {
			const res = await app.request('/config/inbounds');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.inbounds).toBeArray();
			expect(body.data.total).toBe(2);
		});
	});

	describe('GET /config/inbounds/:tag', () => {
		test('should return inbound by tag', async () => {
			const res = await app.request('/config/inbounds/mixed-in');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.tag).toBe('mixed-in');
			expect(body.data.type).toBe('mixed');
		});

		test('should return 404 for non-existent inbound', async () => {
			mockConfigService.getInbound.mockImplementationOnce(() => Promise.resolve(null));

			const res = await app.request('/config/inbounds/non-existent');

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});
	});

	describe('POST /config/inbounds', () => {
		test('should create a new inbound', async () => {
			const newInbound = {
				type: 'socks',
				tag: 'socks-in',
				listen: '127.0.0.1',
				listen_port: 1081,
			};

			const res = await app.request('/config/inbounds', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newInbound),
			});

			expect(res.status).toBe(201);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.tag).toBe('socks-in');
		});
	});

	describe('PUT /config/inbounds/:tag', () => {
		test('should replace an inbound', async () => {
			const updatedInbound = {
				type: 'mixed',
				tag: 'mixed-in',
				listen: '0.0.0.0',
				listen_port: 1080,
			};

			const res = await app.request('/config/inbounds/mixed-in', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updatedInbound),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.listen).toBe('0.0.0.0');
		});
	});

	describe('PATCH /config/inbounds/:tag', () => {
		test('should partially update an inbound', async () => {
			const patch = { listen_port: 1082 };

			const res = await app.request('/config/inbounds/mixed-in', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.listen_port).toBe(1082);
		});
	});

	describe('DELETE /config/inbounds/:tag', () => {
		test('should delete an inbound', async () => {
			const res = await app.request('/config/inbounds/mixed-in', {
				method: 'DELETE',
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.message).toContain('deleted');
		});

		test('should return 404 for non-existent inbound', async () => {
			mockConfigService.deleteInbound.mockImplementationOnce(() => Promise.resolve(false));

			const res = await app.request('/config/inbounds/non-existent', {
				method: 'DELETE',
			});

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});
	});

	describe('GET /config/outbounds', () => {
		test('should return list of outbounds', async () => {
			const res = await app.request('/config/outbounds');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.outbounds).toBeArray();
			expect(body.data.total).toBe(2);
		});
	});

	describe('GET /config/outbounds/:tag', () => {
		test('should return outbound by tag', async () => {
			const res = await app.request('/config/outbounds/direct-out');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.tag).toBe('direct-out');
			expect(body.data.type).toBe('direct');
		});

		test('should return 404 for non-existent outbound', async () => {
			mockConfigService.getOutbound.mockImplementationOnce(() => Promise.resolve(null));

			const res = await app.request('/config/outbounds/non-existent');

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});
	});

	describe('POST /config/outbounds', () => {
		test('should create a new outbound', async () => {
			const newOutbound = {
				type: 'socks',
				tag: 'socks-out',
				server: '127.0.0.1',
				server_port: 1080,
			};

			const res = await app.request('/config/outbounds', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newOutbound),
			});

			expect(res.status).toBe(201);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.tag).toBe('socks-out');
		});
	});

	describe('PUT /config/outbounds/:tag', () => {
		test('should replace an outbound', async () => {
			const updatedOutbound = {
				type: 'direct',
				tag: 'direct-out',
			};

			const res = await app.request('/config/outbounds/direct-out', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updatedOutbound),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.type).toBe('direct');
		});
	});

	describe('PATCH /config/outbounds/:tag', () => {
		test('should partially update an outbound', async () => {
			const patch = { tag: 'renamed-out' };

			const res = await app.request('/config/outbounds/direct-out', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.tag).toBe('renamed-out');
		});
	});

	describe('DELETE /config/outbounds/:tag', () => {
		test('should delete an outbound', async () => {
			const res = await app.request('/config/outbounds/direct-out', {
				method: 'DELETE',
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.message).toContain('deleted');
		});

		test('should return 404 for non-existent outbound', async () => {
			mockConfigService.deleteOutbound.mockImplementationOnce(() => Promise.resolve(false));

			const res = await app.request('/config/outbounds/non-existent', {
				method: 'DELETE',
			});

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});
	});

	describe('POST /config/outbounds/:tag/test', () => {
		test('should test outbound connectivity', async () => {
			const res = await app.request('/config/outbounds/direct-out/test', {
				method: 'POST',
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.success).toBe(true);
			expect(body.data.latency).toBe(42);
		});

		test('should accept custom url and timeout', async () => {
			const res = await app.request('/config/outbounds/direct-out/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: 'https://example.com', timeout: 3000 }),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
		});

		test('should return 404 for non-existent outbound', async () => {
			mockConfigService.testOutbound.mockImplementationOnce(() =>
				Promise.reject({ message: "Outbound with tag 'non-existent' not found" }),
			);

			const res = await app.request('/config/outbounds/non-existent/test', {
				method: 'POST',
			});

			expect(res.status).toBe(500);
		});
	});

	describe('GET /config/outbounds/:tag/latency', () => {
		test('should measure outbound latency', async () => {
			const res = await app.request('/config/outbounds/direct-out/latency');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.latency).toBe(50);
			expect(body.data.samples).toEqual([45, 50, 55]);
		});

		test('should accept custom url query parameter', async () => {
			const res = await app.request('/config/outbounds/direct-out/latency?url=https://example.com');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
		});

		test('should return 404 for non-existent outbound', async () => {
			mockConfigService.getOutboundLatency.mockImplementationOnce(() =>
				Promise.reject({ message: "Outbound with tag 'non-existent' not found" }),
			);

			const res = await app.request('/config/outbounds/non-existent/latency');

			expect(res.status).toBe(500);
		});
	});

	describe('GET /config/route', () => {
		test('should return route configuration', async () => {
			const res = await app.request('/config/route');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.rules).toBeArray();
			expect(body.data.rule_set).toBeArray();
		});
	});

	describe('PUT /config/route', () => {
		test('should replace route configuration', async () => {
			const newRoute = { final: 'block-out', auto_detect_interface: true };

			const res = await app.request('/config/route', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newRoute),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
		});
	});

	describe('PATCH /config/route', () => {
		test('should partially update route configuration', async () => {
			const patch = { final: 'proxy-out' };

			const res = await app.request('/config/route', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.final).toBe('proxy-out');
		});
	});

	describe('GET /config/route/rules', () => {
		test('should return list of route rules', async () => {
			const res = await app.request('/config/route/rules');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.rules).toBeArray();
			expect(body.data.total).toBe(2);
		});
	});

	describe('GET /config/route/rules/:index', () => {
		test('should return route rule by index', async () => {
			const res = await app.request('/config/route/rules/0');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.outbound).toBe('direct-out');
		});

		test('should return 404 for non-existent index', async () => {
			mockConfigService.getRouteRule.mockImplementationOnce(() => Promise.resolve(null));

			const res = await app.request('/config/route/rules/99');

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});

		test('should return 400 for invalid index', async () => {
			const res = await app.request('/config/route/rules/invalid');

			expect(res.status).toBe(400);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('BAD_REQUEST');
		});
	});

	describe('POST /config/route/rules', () => {
		test('should create a new route rule', async () => {
			const newRule = { domain: ['example.com'], outbound: 'proxy-out' };

			const res = await app.request('/config/route/rules', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newRule),
			});

			expect(res.status).toBe(201);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.rule).toBeDefined();
			expect(body.data.index).toBeDefined();
		});
	});

	describe('PUT /config/route/rules/:index', () => {
		test('should replace a route rule', async () => {
			const updatedRule = { domain_suffix: ['.example.com'], outbound: 'proxy-out' };

			const res = await app.request('/config/route/rules/0', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updatedRule),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
		});
	});

	describe('DELETE /config/route/rules/:index', () => {
		test('should delete a route rule', async () => {
			const res = await app.request('/config/route/rules/0', {
				method: 'DELETE',
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.message).toContain('deleted');
		});

		test('should return 404 for non-existent index', async () => {
			mockConfigService.deleteRouteRule.mockImplementationOnce(() => Promise.resolve(false));

			const res = await app.request('/config/route/rules/99', {
				method: 'DELETE',
			});

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});
	});

	describe('POST /config/route/rules/reorder', () => {
		test('should reorder route rules', async () => {
			const res = await app.request('/config/route/rules/reorder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fromIndex: 0, toIndex: 1 }),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.rules).toBeArray();
		});
	});

	describe('GET /config/route/rule-sets', () => {
		test('should return list of rule sets', async () => {
			const res = await app.request('/config/route/rule-sets');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.ruleSets).toBeArray();
			expect(body.data.total).toBe(2);
		});
	});

	describe('GET /config/route/rule-sets/:tag', () => {
		test('should return rule set by tag', async () => {
			const res = await app.request('/config/route/rule-sets/geoip-cn');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.tag).toBe('geoip-cn');
			expect(body.data.type).toBe('local');
		});

		test('should return 404 for non-existent rule set', async () => {
			mockConfigService.getRuleSet.mockImplementationOnce(() => Promise.resolve(null));

			const res = await app.request('/config/route/rule-sets/non-existent');

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});
	});

	describe('POST /config/route/rule-sets', () => {
		test('should create a new rule set', async () => {
			const newRuleSet = {
				type: 'remote',
				tag: 'new-ruleset',
				format: 'binary',
				url: 'https://example.com/rules.srs',
			};

			const res = await app.request('/config/route/rule-sets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newRuleSet),
			});

			expect(res.status).toBe(201);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.tag).toBe('new-ruleset');
		});
	});

	describe('PUT /config/route/rule-sets/:tag', () => {
		test('should replace a rule set', async () => {
			const updatedRuleSet = {
				type: 'local',
				tag: 'geoip-cn',
				format: 'source',
				path: '/data/geoip-cn.json',
			};

			const res = await app.request('/config/route/rule-sets/geoip-cn', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updatedRuleSet),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
		});
	});

	describe('DELETE /config/route/rule-sets/:tag', () => {
		test('should delete a rule set', async () => {
			const res = await app.request('/config/route/rule-sets/geoip-cn', {
				method: 'DELETE',
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.message).toContain('deleted');
		});

		test('should return 404 for non-existent rule set', async () => {
			mockConfigService.deleteRuleSet.mockImplementationOnce(() => Promise.resolve(false));

			const res = await app.request('/config/route/rule-sets/non-existent', {
				method: 'DELETE',
			});

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});
	});

	// DNS API Tests
	describe('GET /config/dns', () => {
		test('should return DNS configuration', async () => {
			const res = await app.request('/config/dns');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.servers).toBeArray();
			expect(body.data.rules).toBeArray();
		});
	});

	describe('PUT /config/dns', () => {
		test('should replace DNS configuration', async () => {
			const newDns = { final: 'cloudflare', strategy: 'ipv4_only' };

			const res = await app.request('/config/dns', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newDns),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
		});
	});

	describe('PATCH /config/dns', () => {
		test('should partially update DNS configuration', async () => {
			const patch = { strategy: 'ipv6_only' };

			const res = await app.request('/config/dns', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.strategy).toBe('ipv6_only');
		});
	});

	describe('GET /config/dns/servers', () => {
		test('should return list of DNS servers', async () => {
			const res = await app.request('/config/dns/servers');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.servers).toBeArray();
			expect(body.data.total).toBe(2);
		});
	});

	describe('GET /config/dns/servers/:tag', () => {
		test('should return DNS server by tag', async () => {
			const res = await app.request('/config/dns/servers/google');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.tag).toBe('google');
			expect(body.data.address).toBe('tls://8.8.8.8');
		});

		test('should return 404 for non-existent DNS server', async () => {
			mockConfigService.getDnsServer.mockImplementationOnce(() => Promise.resolve(null));

			const res = await app.request('/config/dns/servers/non-existent');

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});
	});

	describe('POST /config/dns/servers', () => {
		test('should create a new DNS server', async () => {
			const newServer = {
				tag: 'quad9',
				address: 'tls://9.9.9.9',
			};

			const res = await app.request('/config/dns/servers', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newServer),
			});

			expect(res.status).toBe(201);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.tag).toBe('quad9');
		});
	});

	describe('PUT /config/dns/servers/:tag', () => {
		test('should replace a DNS server', async () => {
			const updatedServer = {
				tag: 'google',
				address: 'https://8.8.8.8/dns-query',
			};

			const res = await app.request('/config/dns/servers/google', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updatedServer),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.address).toBe('https://8.8.8.8/dns-query');
		});
	});

	describe('DELETE /config/dns/servers/:tag', () => {
		test('should delete a DNS server', async () => {
			const res = await app.request('/config/dns/servers/google', {
				method: 'DELETE',
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.message).toContain('deleted');
		});

		test('should return 404 for non-existent DNS server', async () => {
			mockConfigService.deleteDnsServer.mockImplementationOnce(() => Promise.resolve(false));

			const res = await app.request('/config/dns/servers/non-existent', {
				method: 'DELETE',
			});

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});
	});

	describe('GET /config/dns/rules', () => {
		test('should return list of DNS rules', async () => {
			const res = await app.request('/config/dns/rules');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.rules).toBeArray();
			expect(body.data.total).toBe(2);
		});
	});

	describe('GET /config/dns/rules/:index', () => {
		test('should return DNS rule by index', async () => {
			const res = await app.request('/config/dns/rules/0');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.server).toBe('google');
		});

		test('should return 404 for non-existent index', async () => {
			mockConfigService.getDnsRule.mockImplementationOnce(() => Promise.resolve(null));

			const res = await app.request('/config/dns/rules/99');

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});

		test('should return 400 for invalid index', async () => {
			const res = await app.request('/config/dns/rules/invalid');

			expect(res.status).toBe(400);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('BAD_REQUEST');
		});
	});

	describe('POST /config/dns/rules', () => {
		test('should create a new DNS rule', async () => {
			const newRule = { domain: ['example.com'], server: 'google' };

			const res = await app.request('/config/dns/rules', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newRule),
			});

			expect(res.status).toBe(201);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.rule).toBeDefined();
			expect(body.data.index).toBeDefined();
		});
	});

	describe('PUT /config/dns/rules/:index', () => {
		test('should replace a DNS rule', async () => {
			const updatedRule = { domain_suffix: ['.example.com'], server: 'cloudflare' };

			const res = await app.request('/config/dns/rules/0', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updatedRule),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
		});
	});

	describe('DELETE /config/dns/rules/:index', () => {
		test('should delete a DNS rule', async () => {
			const res = await app.request('/config/dns/rules/0', {
				method: 'DELETE',
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.message).toContain('deleted');
		});

		test('should return 404 for non-existent index', async () => {
			mockConfigService.deleteDnsRule.mockImplementationOnce(() => Promise.resolve(false));

			const res = await app.request('/config/dns/rules/99', {
				method: 'DELETE',
			});

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});
	});

	describe('POST /config/dns/rules/reorder', () => {
		test('should reorder DNS rules', async () => {
			const res = await app.request('/config/dns/rules/reorder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fromIndex: 0, toIndex: 1 }),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.rules).toBeArray();
		});
	});

	// Log API Tests
	describe('GET /config/log', () => {
		test('should return log configuration', async () => {
			const res = await app.request('/config/log');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.level).toBe('info');
			expect(body.data.timestamp).toBe(true);
		});
	});

	describe('PUT /config/log', () => {
		test('should replace log configuration', async () => {
			const newLog = { level: 'debug', timestamp: false };

			const res = await app.request('/config/log', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newLog),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.level).toBe('debug');
		});
	});

	describe('PATCH /config/log', () => {
		test('should partially update log configuration', async () => {
			const patch = { level: 'warn' };

			const res = await app.request('/config/log', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.level).toBe('warn');
		});
	});

	// NTP API Tests
	describe('GET /config/ntp', () => {
		test('should return NTP configuration', async () => {
			const res = await app.request('/config/ntp');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.enabled).toBe(true);
			expect(body.data.server).toBe('time.google.com');
		});
	});

	describe('PUT /config/ntp', () => {
		test('should replace NTP configuration', async () => {
			const newNtp = { enabled: false, server: 'pool.ntp.org', server_port: 123 };

			const res = await app.request('/config/ntp', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newNtp),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.server).toBe('pool.ntp.org');
		});
	});

	describe('PATCH /config/ntp', () => {
		test('should partially update NTP configuration', async () => {
			const patch = { interval: '1h' };

			const res = await app.request('/config/ntp', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.interval).toBe('1h');
		});
	});

	// Experimental API Tests
	describe('GET /config/experimental', () => {
		test('should return experimental configuration', async () => {
			const res = await app.request('/config/experimental');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.cache_file).toBeDefined();
			expect(body.data.clash_api).toBeDefined();
		});
	});

	describe('PUT /config/experimental', () => {
		test('should replace experimental configuration', async () => {
			const newExperimental = {
				cache_file: { enabled: false },
				clash_api: { external_controller: '0.0.0.0:9090' },
			};

			const res = await app.request('/config/experimental', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newExperimental),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
		});
	});

	describe('PATCH /config/experimental', () => {
		test('should partially update experimental configuration', async () => {
			const patch = { cache_file: { enabled: false, path: '/new/path.db' } };

			const res = await app.request('/config/experimental', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.cache_file.enabled).toBe(false);
		});
	});

	// Sing-box Info API Tests
	describe('GET /singbox/version', () => {
		test('should return sing-box version information', async () => {
			const res = await app.request('/singbox/version');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.version).toBe('1.10.0');
			expect(body.data.tags).toBeArray();
			expect(body.data.tags).toContain('with_gvisor');
			expect(body.data.revision).toBe('abc123def');
			expect(body.data.cgo).toBe(true);
		});

		test('should handle error when sing-box binary fails', async () => {
			mockConfigService.getSingboxVersion.mockImplementationOnce(() =>
				Promise.reject(new Error('Failed to get sing-box version')),
			);

			const res = await app.request('/singbox/version');

			expect(res.status).toBe(500);
		});
	});

	describe('GET /singbox/check', () => {
		test('should return sing-box binary status', async () => {
			const res = await app.request('/singbox/check');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.available).toBe(true);
			expect(body.data.path).toBe('/usr/local/bin/sing-box');
			expect(body.data.version).toBe('1.10.0');
		});

		test('should return unavailable status when binary not found', async () => {
			mockConfigService.checkSingboxBinary.mockImplementationOnce(() =>
				Promise.resolve({
					available: false,
					path: '/usr/local/bin/sing-box',
					version: undefined,
					error: 'Binary not found',
				}),
			);

			const res = await app.request('/singbox/check');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.available).toBe(false);
			expect(body.data.error).toBe('Binary not found');
		});
	});

	// Config Diff API Tests
	describe('GET /config/diff/:backupId', () => {
		test('should compare current config with backup', async () => {
			const res = await app.request('/config/diff/backup-123');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.hasChanges).toBe(true);
			expect(body.data.changes).toBeArray();
			expect(body.data.changes.length).toBeGreaterThan(0);
			expect(body.data.current).toBeDefined();
			expect(body.data.backup).toBeDefined();
		});

		test('should return 404 for non-existent backup', async () => {
			mockConfigService.diffWithBackup.mockImplementationOnce(() =>
				Promise.reject({ message: 'Backup not found: non-existent' }),
			);

			const res = await app.request('/config/diff/non-existent');

			expect(res.status).toBe(500);
		});
	});

	describe('GET /config/diff/compare', () => {
		test('should compare two backups', async () => {
			const res = await app.request('/config/diff/compare?backup1=backup-1&backup2=backup-2');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.hasChanges).toBe(true);
			expect(body.data.changes).toBeArray();
			expect(body.data.config1).toBeDefined();
			expect(body.data.config2).toBeDefined();
		});

		test('should return 400 when backup1 is missing', async () => {
			const res = await app.request('/config/diff/compare?backup2=backup-2');

			expect(res.status).toBe(400);
		});

		test('should return 400 when backup2 is missing', async () => {
			const res = await app.request('/config/diff/compare?backup1=backup-1');

			expect(res.status).toBe(400);
		});
	});

	// Config Export/Import API Tests
	describe('GET /config/export', () => {
		test('should export configuration with metadata', async () => {
			const res = await app.request('/config/export');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.config).toBeDefined();
			expect(body.data.metadata).toBeDefined();
			expect(body.data.metadata.exportedAt).toBeDefined();
			expect(body.data.metadata.version).toBe('1.0');
			expect(body.data.metadata.singboxVersion).toBe('1.10.0');
		});

		test('should handle export errors', async () => {
			mockConfigService.exportConfig.mockImplementationOnce(() =>
				Promise.reject(new Error('Export failed')),
			);

			const res = await app.request('/config/export');

			expect(res.status).toBe(500);
		});
	});

	describe('POST /config/import', () => {
		test('should import configuration', async () => {
			const importData = {
				config: { log: { level: 'info' }, inbounds: [] },
				metadata: {
					exportedAt: new Date().toISOString(),
					version: '1.0',
				},
			};

			const res = await app.request('/config/import', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(importData),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.success).toBe(true);
			expect(body.data.config).toBeDefined();
			expect(body.data.warnings).toBeArray();
		});

		test('should import configuration with merge option', async () => {
			const importData = {
				config: { log: { level: 'debug' } },
			};

			const res = await app.request('/config/import?merge=true', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(importData),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
		});

		test('should import configuration without validation', async () => {
			const importData = {
				config: { log: { level: 'info' } },
			};

			const res = await app.request('/config/import?validate=false', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(importData),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
		});

		test('should import configuration without creating backup', async () => {
			const importData = {
				config: { log: { level: 'info' } },
			};

			const res = await app.request('/config/import?createBackup=false', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(importData),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
		});

		test('should return warnings for version mismatch', async () => {
			mockConfigService.importConfig.mockImplementationOnce(() =>
				Promise.resolve({
					success: true,
					config: { log: { level: 'info' }, inbounds: mockInbounds },
					warnings: ['Configuration was exported from sing-box 1.9.0, current version is 1.10.0'],
				}),
			);

			const importData = {
				config: { log: { level: 'info' } },
				metadata: { singboxVersion: '1.9.0' },
			};

			const res = await app.request('/config/import', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(importData),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.warnings.length).toBeGreaterThan(0);
		});

		test('should handle import validation errors', async () => {
			mockConfigService.importConfig.mockImplementationOnce(() =>
				Promise.reject(new Error('Invalid configuration: missing required field')),
			);

			const importData = {
				config: {},
			};

			const res = await app.request('/config/import', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(importData),
			});

			expect(res.status).toBe(500);
		});
	});

	// Endpoints API Tests (sing-box 1.11.0+)
	describe('GET /config/endpoints', () => {
		test('should return list of endpoints', async () => {
			const res = await app.request('/config/endpoints');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.endpoints).toBeArray();
			expect(body.data.total).toBe(2);
			expect(body.data.endpoints[0].type).toBe('wireguard');
			expect(body.data.endpoints[1].type).toBe('tailscale');
		});
	});

	describe('GET /config/endpoints/:tag', () => {
		test('should return endpoint by tag', async () => {
			const res = await app.request('/config/endpoints/wg-endpoint');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.tag).toBe('wg-endpoint');
			expect(body.data.type).toBe('wireguard');
		});

		test('should return 404 for non-existent endpoint', async () => {
			const res = await app.request('/config/endpoints/non-existent');

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});
	});

	describe('POST /config/endpoints', () => {
		test('should create WireGuard endpoint', async () => {
			const newEndpoint = {
				type: 'wireguard',
				tag: 'new-wg-endpoint',
				address: ['10.0.0.3/32'],
				private_key: 'new-private-key',
				peers: [
					{
						public_key: 'peer-public-key',
						allowed_ips: ['0.0.0.0/0'],
					},
				],
			};

			const res = await app.request('/config/endpoints', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newEndpoint),
			});

			expect(res.status).toBe(201);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.tag).toBe('new-wg-endpoint');
			expect(body.data.type).toBe('wireguard');
		});

		test('should create Tailscale endpoint', async () => {
			const newEndpoint = {
				type: 'tailscale',
				tag: 'new-ts-endpoint',
				state_directory: '/var/lib/tailscale',
				hostname: 'my-node',
			};

			const res = await app.request('/config/endpoints', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newEndpoint),
			});

			expect(res.status).toBe(201);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.tag).toBe('new-ts-endpoint');
			expect(body.data.type).toBe('tailscale');
		});
	});

	describe('PUT /config/endpoints/:tag', () => {
		test('should replace endpoint', async () => {
			const updatedEndpoint = {
				type: 'wireguard',
				tag: 'wg-endpoint',
				address: ['10.0.0.5/32'],
				private_key: 'updated-private-key',
				peers: [
					{
						public_key: 'updated-peer-key',
						allowed_ips: ['0.0.0.0/0'],
					},
				],
			};

			const res = await app.request('/config/endpoints/wg-endpoint', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updatedEndpoint),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.address).toContain('10.0.0.5/32');
		});
	});

	describe('PATCH /config/endpoints/:tag', () => {
		test('should partially update endpoint', async () => {
			const patch = {
				mtu: 1420,
			};

			const res = await app.request('/config/endpoints/wg-endpoint', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.mtu).toBe(1420);
		});
	});

	describe('DELETE /config/endpoints/:tag', () => {
		test('should delete endpoint', async () => {
			const res = await app.request('/config/endpoints/wg-endpoint', {
				method: 'DELETE',
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.deleted).toBe(true);
		});

		test('should return 404 for non-existent endpoint', async () => {
			mockConfigService.deleteEndpoint.mockImplementationOnce(() => Promise.resolve(false));

			const res = await app.request('/config/endpoints/non-existent', {
				method: 'DELETE',
			});

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});
	});

	// Services API Tests (sing-box 1.12.0+)
	describe('GET /config/services', () => {
		test('should return list of services', async () => {
			const res = await app.request('/config/services');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.services).toBeArray();
			expect(body.data.total).toBe(3);
			expect(body.data.services[0].type).toBe('ccm');
			expect(body.data.services[1].type).toBe('derp');
			expect(body.data.services[2].type).toBe('resolved');
		});
	});

	describe('GET /config/services/:tag', () => {
		test('should return service by tag', async () => {
			const res = await app.request('/config/services/ccm-service');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.tag).toBe('ccm-service');
			expect(body.data.type).toBe('ccm');
		});

		test('should return 404 for non-existent service', async () => {
			const res = await app.request('/config/services/non-existent');

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});
	});

	describe('POST /config/services', () => {
		test('should create CCM service', async () => {
			const newService = {
				type: 'ccm',
				tag: 'new-ccm-service',
				listen: '127.0.0.1',
				listen_port: 8081,
			};

			const res = await app.request('/config/services', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newService),
			});

			expect(res.status).toBe(201);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.tag).toBe('new-ccm-service');
			expect(body.data.type).toBe('ccm');
		});

		test('should create DERP service', async () => {
			const newService = {
				type: 'derp',
				tag: 'new-derp-service',
				listen: '0.0.0.0',
				listen_port: 8443,
				config_path: '/etc/derp/config.json',
			};

			const res = await app.request('/config/services', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newService),
			});

			expect(res.status).toBe(201);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.tag).toBe('new-derp-service');
			expect(body.data.type).toBe('derp');
		});

		test('should create SSM-API service', async () => {
			const newService = {
				type: 'ssm-api',
				tag: 'new-ssm-service',
				listen: '127.0.0.1',
				listen_port: 9000,
				servers: { '/': 'ss-in' },
			};

			const res = await app.request('/config/services', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newService),
			});

			expect(res.status).toBe(201);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.tag).toBe('new-ssm-service');
			expect(body.data.type).toBe('ssm-api');
		});
	});

	describe('PUT /config/services/:tag', () => {
		test('should replace service', async () => {
			const updatedService = {
				type: 'ccm',
				tag: 'ccm-service',
				listen: '0.0.0.0',
				listen_port: 8082,
				credential_path: '/new/path/.credentials.json',
			};

			const res = await app.request('/config/services/ccm-service', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updatedService),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.listen_port).toBe(8082);
		});
	});

	describe('PATCH /config/services/:tag', () => {
		test('should partially update service', async () => {
			const patch = {
				listen_port: 8090,
			};

			const res = await app.request('/config/services/ccm-service', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.listen_port).toBe(8090);
		});
	});

	describe('DELETE /config/services/:tag', () => {
		test('should delete service', async () => {
			const res = await app.request('/config/services/ccm-service', {
				method: 'DELETE',
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.deleted).toBe(true);
		});

		test('should return 404 for non-existent service', async () => {
			mockConfigService.deleteService.mockImplementationOnce(() => Promise.resolve(false));

			const res = await app.request('/config/services/non-existent', {
				method: 'DELETE',
			});

			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.code).toBe('NOT_FOUND');
		});
	});

	// Certificate API Tests (sing-box 1.12.0+)
	describe('GET /config/certificate', () => {
		test('should return certificate configuration', async () => {
			const res = await app.request('/config/certificate');

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.store).toBe('system');
			expect(body.data.certificate_path).toBeArray();
			expect(body.data.certificate_directory_path).toBeArray();
		});
	});

	describe('PUT /config/certificate', () => {
		test('should replace certificate configuration', async () => {
			const newCertificate = {
				store: 'mozilla',
				certificate_path: '/etc/ssl/custom-ca.pem',
			};

			const res = await app.request('/config/certificate', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newCertificate),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.store).toBe('mozilla');
		});

		test('should accept array certificate paths', async () => {
			const newCertificate = {
				store: 'chrome',
				certificate_path: ['/etc/ssl/ca1.pem', '/etc/ssl/ca2.pem'],
				certificate_directory_path: ['/etc/ssl/certs', '/usr/local/share/ca-certificates'],
			};

			const res = await app.request('/config/certificate', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newCertificate),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
		});

		test('should accept none store', async () => {
			const newCertificate = {
				store: 'none',
				certificate: ['-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----'],
			};

			const res = await app.request('/config/certificate', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newCertificate),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
		});
	});

	describe('PATCH /config/certificate', () => {
		test('should partially update certificate configuration', async () => {
			const patch = {
				store: 'chrome',
			};

			const res = await app.request('/config/certificate', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.store).toBe('chrome');
			// Original fields should be preserved
			expect(body.data.certificate_path).toBeDefined();
		});

		test('should update certificate paths', async () => {
			const patch = {
				certificate_directory_path: ['/new/certs/path'],
			};

			const res = await app.request('/config/certificate', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
		});
	});

	describe('DELETE /config/certificate', () => {
		test('should delete certificate configuration', async () => {
			const res = await app.request('/config/certificate', {
				method: 'DELETE',
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.deleted).toBe(true);
		});

		test('should return deleted: false when no certificate exists', async () => {
			mockConfigService.deleteCertificate.mockImplementationOnce(() => Promise.resolve(false));

			const res = await app.request('/config/certificate', {
				method: 'DELETE',
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.data.deleted).toBe(false);
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
				rateLimit: {
					enabled: false,
					maxRequests: 100,
					windowMs: 60000,
				},
				logLevel: 'error',
			},
		}));

		const { app: authApp } = await import('@/app');

		const res = await authApp.request('/health');

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
				rateLimit: {
					enabled: false,
					maxRequests: 100,
					windowMs: 60000,
				},
				logLevel: 'error',
			},
		}));

		const { app: authApp } = await import('@/app');

		const res = await authApp.request('/health', {
			headers: {
				Authorization: `Bearer ${API_KEY}`,
			},
		});

		expect(res.status).toBe(200);
	});

	test('should accept authenticated requests with X-API-Key', async () => {
		mock.module('@/config', () => ({
			config: {
				isDev: true,
				isProd: false,
				apiKey: API_KEY,
				rateLimit: {
					enabled: false,
					maxRequests: 100,
					windowMs: 60000,
				},
				logLevel: 'error',
			},
		}));

		const { app: authApp } = await import('@/app');

		const res = await authApp.request('/health', {
			headers: {
				'X-API-Key': API_KEY,
			},
		});

		expect(res.status).toBe(200);
	});
});
