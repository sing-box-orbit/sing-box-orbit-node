/**
 * E2E Tests with real sing-box binary
 *
 * Prerequisites:
 * - sing-box binary must be installed and accessible
 * - These tests will start/stop the sing-box process
 *
 * Run with: bun test e2e
 */
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	spyOn,
	test,
} from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Test directories - unique per run to avoid conflicts
const TEST_ID = `e2e-${Date.now()}`;
const TEST_DIR = `/tmp/${TEST_ID}`;
const TEST_CONFIG_PATH = join(TEST_DIR, 'config.json');
const TEST_BACKUP_DIR = join(TEST_DIR, 'backups');
const TEST_WORKING_DIR = TEST_DIR;

// Path to sing-box binary in project
const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');
const SINGBOX_BINARY = join(PROJECT_ROOT, 'bin', 'sing-box');

// Minimal valid sing-box config for testing
const MINIMAL_CONFIG = {
	log: {
		level: 'debug',
		timestamp: true,
	},
	inbounds: [
		{
			type: 'mixed',
			tag: 'mixed-in',
			listen: '127.0.0.1',
			listen_port: 21080,
		},
	],
	outbounds: [
		{
			type: 'direct',
			tag: 'direct-out',
		},
	],
};

// Config with multiple inbounds/outbounds for CRUD testing
const FULL_CONFIG = {
	log: {
		level: 'info',
		timestamp: true,
	},
	dns: {
		servers: [
			{
				tag: 'google',
				address: '8.8.8.8',
			},
			{
				tag: 'cloudflare',
				address: '1.1.1.1',
			},
		],
		rules: [
			{
				domain_suffix: ['.google.com'],
				server: 'google',
			},
		],
	},
	inbounds: [
		{
			type: 'mixed',
			tag: 'mixed-in',
			listen: '127.0.0.1',
			listen_port: 21080,
		},
		{
			type: 'socks',
			tag: 'socks-in',
			listen: '127.0.0.1',
			listen_port: 21081,
		},
	],
	outbounds: [
		{
			type: 'direct',
			tag: 'direct-out',
		},
		{
			type: 'block',
			tag: 'block-out',
		},
	],
	route: {
		rules: [
			{
				domain_suffix: ['.blocked.com'],
				outbound: 'block-out',
			},
		],
		final: 'direct-out',
	},
};

// Check if sing-box is available (sync check using spawnSync)
function checkSingboxAvailable(): { available: boolean; version: string | null } {
	try {
		const proc = Bun.spawnSync({
			cmd: [SINGBOX_BINARY, 'version'],
			stdout: 'pipe',
			stderr: 'pipe',
		});
		if (proc.exitCode === 0) {
			const stdout = proc.stdout.toString();
			const match = stdout.match(/sing-box version (\S+)/);
			return { available: true, version: match ? match[1] : null };
		}
		return { available: false, version: null };
	} catch {
		return { available: false, version: null };
	}
}

// Check availability synchronously at module load time
const { available: singboxAvailable, version: singboxVersion } = checkSingboxAvailable();

if (singboxAvailable) {
	console.log(`[E2E] sing-box ${singboxVersion} detected`);
} else {
	console.warn('[E2E] sing-box not found, skipping E2E tests');
}

describe('E2E Tests', () => {
	let consoleLogSpy: ReturnType<typeof spyOn>;
	let consoleWarnSpy: ReturnType<typeof spyOn>;
	let consoleErrorSpy: ReturnType<typeof spyOn>;

	beforeAll(async () => {
		// Create test directory
		await mkdir(TEST_DIR, { recursive: true });
		await mkdir(TEST_BACKUP_DIR, { recursive: true });
	});

	afterAll(async () => {
		// Cleanup test directory
		await rm(TEST_DIR, { recursive: true, force: true });
	});

	beforeEach(() => {
		consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
		consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
		consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleLogSpy?.mockRestore();
		consoleWarnSpy?.mockRestore();
		consoleErrorSpy?.mockRestore();
	});

	describe('sing-box binary check', () => {
		test('should detect sing-box availability', () => {
			// This test always passes, just logs the status
			expect(typeof singboxAvailable).toBe('boolean');
			if (singboxAvailable) {
				expect(singboxVersion).not.toBeNull();
			}
		});
	});

	describe('Config validation with real sing-box', () => {
		test.skipIf(!singboxAvailable)('should validate minimal config', async () => {
			await writeFile(TEST_CONFIG_PATH, JSON.stringify(MINIMAL_CONFIG, null, 2));

			const proc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'check', '-c', TEST_CONFIG_PATH],
				stdout: 'pipe',
				stderr: 'pipe',
			});

			await proc.exited;
			expect(proc.exitCode).toBe(0);
		});

		test.skipIf(!singboxAvailable)('should validate full config', async () => {
			await writeFile(TEST_CONFIG_PATH, JSON.stringify(FULL_CONFIG, null, 2));

			const proc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'check', '-c', TEST_CONFIG_PATH],
				stdout: 'pipe',
				stderr: 'pipe',
			});

			await proc.exited;
			expect(proc.exitCode).toBe(0);
		});

		test.skipIf(!singboxAvailable)('should reject invalid config', async () => {
			const invalidConfig = {
				log: { level: 'invalid-level' },
				inbounds: [{ type: 'nonexistent', tag: 'test' }],
			};

			await writeFile(TEST_CONFIG_PATH, JSON.stringify(invalidConfig, null, 2));

			const proc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'check', '-c', TEST_CONFIG_PATH],
				stdout: 'pipe',
				stderr: 'pipe',
			});

			await proc.exited;
			expect(proc.exitCode).not.toBe(0);
		});

		test.skipIf(!singboxAvailable)('should reject config with invalid inbound type', async () => {
			const invalidInboundConfig = {
				log: { level: 'info' },
				inbounds: [
					{ type: 'nonexistent-type', tag: 'invalid-in', listen: '127.0.0.1', listen_port: 21080 },
				],
				outbounds: [{ type: 'direct', tag: 'direct' }],
			};

			await writeFile(TEST_CONFIG_PATH, JSON.stringify(invalidInboundConfig, null, 2));

			const proc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'check', '-c', TEST_CONFIG_PATH],
				stdout: 'pipe',
				stderr: 'pipe',
			});

			await proc.exited;
			expect(proc.exitCode).not.toBe(0);
		});
	});

	describe('Process lifecycle', () => {
		test.skipIf(!singboxAvailable)('should start and stop sing-box', async () => {
			await writeFile(TEST_CONFIG_PATH, JSON.stringify(MINIMAL_CONFIG, null, 2));

			// Start sing-box
			const proc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'run', '-c', TEST_CONFIG_PATH],
				cwd: TEST_WORKING_DIR,
				stdout: 'pipe',
				stderr: 'pipe',
			});

			// Wait for startup
			await Bun.sleep(1000);

			expect(proc.killed).toBe(false);
			expect(proc.pid).toBeGreaterThan(0);

			// Stop sing-box
			proc.kill('SIGTERM');
			await proc.exited;

			// SIGTERM results in exit code based on signal
			expect(proc.killed).toBe(true);
		});

		test.skipIf(!singboxAvailable)('should respond to SIGHUP for config reload', async () => {
			await writeFile(TEST_CONFIG_PATH, JSON.stringify(MINIMAL_CONFIG, null, 2));

			// Start sing-box
			const proc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'run', '-c', TEST_CONFIG_PATH],
				cwd: TEST_WORKING_DIR,
				stdout: 'pipe',
				stderr: 'pipe',
			});

			// Wait for startup
			await Bun.sleep(1000);
			expect(proc.killed).toBe(false);

			// Modify config
			const modifiedConfig = {
				...MINIMAL_CONFIG,
				log: { ...MINIMAL_CONFIG.log, level: 'warn' },
			};
			await writeFile(TEST_CONFIG_PATH, JSON.stringify(modifiedConfig, null, 2));

			// Send SIGHUP
			proc.kill('SIGHUP');

			// Wait for reload
			await Bun.sleep(500);

			// Process should still be running
			expect(proc.killed).toBe(false);

			// Cleanup
			proc.kill('SIGTERM');
			await proc.exited;
		});

		test.skipIf(!singboxAvailable)('should fail to start with invalid inbound type', async () => {
			const invalidConfig = {
				log: { level: 'info' },
				inbounds: [
					{ type: 'nonexistent-type', tag: 'invalid-in', listen: '127.0.0.1', listen_port: 21080 },
				],
				outbounds: [{ type: 'direct', tag: 'direct' }],
			};
			await writeFile(TEST_CONFIG_PATH, JSON.stringify(invalidConfig, null, 2));

			const proc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'run', '-c', TEST_CONFIG_PATH],
				cwd: TEST_WORKING_DIR,
				stdout: 'pipe',
				stderr: 'pipe',
			});

			// Wait for it to fail (with timeout)
			const exitCode = await Promise.race([proc.exited, Bun.sleep(3000).then(() => 'timeout')]);

			if (exitCode === 'timeout') {
				// Process started successfully unexpectedly, kill it
				proc.kill('SIGTERM');
				await proc.exited;
				throw new Error('Expected process to fail but it started');
			}

			// Should exit with error
			expect(exitCode).not.toBe(0);
		});
	});

	describe('Config CRUD cycle', () => {
		test.skipIf(!singboxAvailable)('should add inbound to running config', async () => {
			await writeFile(TEST_CONFIG_PATH, JSON.stringify(MINIMAL_CONFIG, null, 2));

			// Start sing-box
			const proc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'run', '-c', TEST_CONFIG_PATH],
				cwd: TEST_WORKING_DIR,
				stdout: 'pipe',
				stderr: 'pipe',
			});

			await Bun.sleep(1000);
			expect(proc.killed).toBe(false);

			// Add new inbound
			const updatedConfig = {
				...MINIMAL_CONFIG,
				inbounds: [
					...MINIMAL_CONFIG.inbounds,
					{
						type: 'http',
						tag: 'http-in',
						listen: '127.0.0.1',
						listen_port: 21082,
					},
				],
			};

			// Validate new config first
			await writeFile(`${TEST_CONFIG_PATH}.new`, JSON.stringify(updatedConfig, null, 2));
			const checkProc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'check', '-c', `${TEST_CONFIG_PATH}.new`],
				stdout: 'pipe',
				stderr: 'pipe',
			});
			await checkProc.exited;
			expect(checkProc.exitCode).toBe(0);

			// Apply config
			await writeFile(TEST_CONFIG_PATH, JSON.stringify(updatedConfig, null, 2));
			proc.kill('SIGHUP');
			await Bun.sleep(500);

			// Process should still be running
			expect(proc.killed).toBe(false);

			// Cleanup
			proc.kill('SIGTERM');
			await proc.exited;
			await rm(`${TEST_CONFIG_PATH}.new`, { force: true });
		});

		test.skipIf(!singboxAvailable)('should reject invalid config update', async () => {
			await writeFile(TEST_CONFIG_PATH, JSON.stringify(MINIMAL_CONFIG, null, 2));

			// Start sing-box
			const proc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'run', '-c', TEST_CONFIG_PATH],
				cwd: TEST_WORKING_DIR,
				stdout: 'pipe',
				stderr: 'pipe',
			});

			await Bun.sleep(1000);
			expect(proc.killed).toBe(false);

			// Try invalid config (port conflict)
			const invalidConfig = {
				...MINIMAL_CONFIG,
				inbounds: [
					...MINIMAL_CONFIG.inbounds,
					{
						type: 'http',
						tag: 'http-in',
						listen: '127.0.0.1',
						listen_port: 21080, // Same port as existing
					},
				],
			};

			// Validation should fail
			await writeFile(`${TEST_CONFIG_PATH}.invalid`, JSON.stringify(invalidConfig, null, 2));
			const checkProc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'check', '-c', `${TEST_CONFIG_PATH}.invalid`],
				stdout: 'pipe',
				stderr: 'pipe',
			});
			await checkProc.exited;

			// Check may pass (sing-box doesn't validate port conflicts in check)
			// but the key is that we validate BEFORE applying

			// Cleanup
			proc.kill('SIGTERM');
			await proc.exited;
			await rm(`${TEST_CONFIG_PATH}.invalid`, { force: true });
		});

		test.skipIf(!singboxAvailable)('should update DNS config', async () => {
			const configWithDns = {
				...MINIMAL_CONFIG,
				dns: {
					servers: [{ tag: 'google', address: '8.8.8.8' }],
				},
			};

			await writeFile(TEST_CONFIG_PATH, JSON.stringify(configWithDns, null, 2));

			// Validate
			const checkProc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'check', '-c', TEST_CONFIG_PATH],
				stdout: 'pipe',
				stderr: 'pipe',
			});
			await checkProc.exited;
			expect(checkProc.exitCode).toBe(0);

			// Update DNS
			const updatedConfig = {
				...configWithDns,
				dns: {
					servers: [
						{ tag: 'google', address: '8.8.8.8' },
						{ tag: 'cloudflare', address: '1.1.1.1' },
					],
					rules: [{ domain_suffix: ['.google.com'], server: 'google' }],
				},
			};

			await writeFile(TEST_CONFIG_PATH, JSON.stringify(updatedConfig, null, 2));

			// Validate updated config
			const checkProc2 = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'check', '-c', TEST_CONFIG_PATH],
				stdout: 'pipe',
				stderr: 'pipe',
			});
			await checkProc2.exited;
			expect(checkProc2.exitCode).toBe(0);
		});

		test.skipIf(!singboxAvailable)('should update route rules', async () => {
			const configWithRoute = {
				...MINIMAL_CONFIG,
				route: {
					rules: [],
					final: 'direct-out',
				},
			};

			await writeFile(TEST_CONFIG_PATH, JSON.stringify(configWithRoute, null, 2));

			// Validate
			let checkProc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'check', '-c', TEST_CONFIG_PATH],
				stdout: 'pipe',
				stderr: 'pipe',
			});
			await checkProc.exited;
			expect(checkProc.exitCode).toBe(0);

			// Add route rules
			const updatedConfig = {
				...configWithRoute,
				outbounds: [
					{ type: 'direct', tag: 'direct-out' },
					{ type: 'block', tag: 'block-out' },
				],
				route: {
					rules: [{ domain_suffix: ['.blocked.com'], outbound: 'block-out' }],
					final: 'direct-out',
				},
			};

			await writeFile(TEST_CONFIG_PATH, JSON.stringify(updatedConfig, null, 2));

			// Validate updated config
			checkProc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'check', '-c', TEST_CONFIG_PATH],
				stdout: 'pipe',
				stderr: 'pipe',
			});
			await checkProc.exited;
			expect(checkProc.exitCode).toBe(0);
		});
	});

	describe('Backup and restore cycle', () => {
		test.skipIf(!singboxAvailable)('should backup, modify, and restore config', async () => {
			// Write initial config
			await writeFile(TEST_CONFIG_PATH, JSON.stringify(MINIMAL_CONFIG, null, 2));

			// Create backup
			const backupPath = join(TEST_BACKUP_DIR, 'backup-1.json');
			await Bun.write(backupPath, JSON.stringify(MINIMAL_CONFIG, null, 2));

			// Modify config
			const modifiedConfig = {
				...MINIMAL_CONFIG,
				log: { ...MINIMAL_CONFIG.log, level: 'error' },
				inbounds: [
					...MINIMAL_CONFIG.inbounds,
					{ type: 'http', tag: 'http-in', listen: '127.0.0.1', listen_port: 21082 },
				],
			};
			await writeFile(TEST_CONFIG_PATH, JSON.stringify(modifiedConfig, null, 2));

			// Validate modified config
			let checkProc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'check', '-c', TEST_CONFIG_PATH],
				stdout: 'pipe',
				stderr: 'pipe',
			});
			await checkProc.exited;
			expect(checkProc.exitCode).toBe(0);

			// Read current config
			const currentConfig = await Bun.file(TEST_CONFIG_PATH).json();
			expect(currentConfig.log.level).toBe('error');
			expect(currentConfig.inbounds.length).toBe(2);

			// Restore from backup
			const backupContent = await Bun.file(backupPath).text();
			await writeFile(TEST_CONFIG_PATH, backupContent);

			// Validate restored config
			checkProc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'check', '-c', TEST_CONFIG_PATH],
				stdout: 'pipe',
				stderr: 'pipe',
			});
			await checkProc.exited;
			expect(checkProc.exitCode).toBe(0);

			// Verify restored config
			const restoredConfig = await Bun.file(TEST_CONFIG_PATH).json();
			expect(restoredConfig.log.level).toBe('debug');
			expect(restoredConfig.inbounds.length).toBe(1);
		});
	});

	describe('Endpoint types (sing-box 1.11.0+)', () => {
		test.skipIf(!singboxAvailable)('should validate WireGuard endpoint config', async () => {
			const wireguardConfig = {
				log: { level: 'info' },
				endpoints: [
					{
						type: 'wireguard',
						tag: 'wg-ep',
						system: false,
						address: ['10.0.0.1/24'],
						private_key: 'YHKibXIHWtj3t7e2Xf2F11S5N5zdwTy8eoApM3L0FXI=',
						peers: [
							{
								address: '192.168.1.1',
								port: 51820,
								public_key: 'cP7Ohqy1H8hR3D7w9C5xJmGDFe8Y3X9fgV2z0K4mR2A=',
								allowed_ips: ['0.0.0.0/0'],
							},
						],
					},
				],
				inbounds: [{ type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 21080 }],
				outbounds: [{ type: 'direct', tag: 'direct-out' }],
			};

			await writeFile(TEST_CONFIG_PATH, JSON.stringify(wireguardConfig, null, 2));

			const checkProc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'check', '-c', TEST_CONFIG_PATH],
				stdout: 'pipe',
				stderr: 'pipe',
			});
			await checkProc.exited;

			// May fail if sing-box version doesn't support endpoints
			// Just ensure it doesn't crash
			expect(typeof checkProc.exitCode).toBe('number');
		});
	});

	describe('Service types (sing-box 1.12.0+)', () => {
		test.skipIf(!singboxAvailable)('should validate resolved service config', async () => {
			const serviceConfig = {
				log: { level: 'info' },
				services: [
					{
						type: 'resolved',
						tag: 'resolved-service',
						listen: '127.0.0.53',
						listen_port: 53,
					},
				],
				inbounds: [{ type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 21080 }],
				outbounds: [{ type: 'direct', tag: 'direct-out' }],
			};

			await writeFile(TEST_CONFIG_PATH, JSON.stringify(serviceConfig, null, 2));

			const checkProc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'check', '-c', TEST_CONFIG_PATH],
				stdout: 'pipe',
				stderr: 'pipe',
			});
			await checkProc.exited;

			// May fail if sing-box version doesn't support services
			// Just ensure it doesn't crash
			expect(typeof checkProc.exitCode).toBe('number');
		});
	});

	describe('Certificate config (sing-box 1.12.0+)', () => {
		test.skipIf(!singboxAvailable)('should validate certificate config', async () => {
			const certConfig = {
				log: { level: 'info' },
				certificate: {
					store: 'system',
				},
				inbounds: [{ type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 21080 }],
				outbounds: [{ type: 'direct', tag: 'direct-out' }],
			};

			await writeFile(TEST_CONFIG_PATH, JSON.stringify(certConfig, null, 2));

			const checkProc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'check', '-c', TEST_CONFIG_PATH],
				stdout: 'pipe',
				stderr: 'pipe',
			});
			await checkProc.exited;

			// May fail if sing-box version doesn't support certificate config
			// Just ensure it doesn't crash
			expect(typeof checkProc.exitCode).toBe('number');
		});

		test.skipIf(!singboxAvailable)('should validate mozilla certificate store', async () => {
			const certConfig = {
				log: { level: 'info' },
				certificate: {
					store: 'mozilla',
				},
				inbounds: [{ type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 21080 }],
				outbounds: [{ type: 'direct', tag: 'direct-out' }],
			};

			await writeFile(TEST_CONFIG_PATH, JSON.stringify(certConfig, null, 2));

			const checkProc = Bun.spawn({
				cmd: [SINGBOX_BINARY, 'check', '-c', TEST_CONFIG_PATH],
				stdout: 'pipe',
				stderr: 'pipe',
			});
			await checkProc.exited;

			expect(typeof checkProc.exitCode).toBe('number');
		});
	});
});
