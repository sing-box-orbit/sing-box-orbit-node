import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const TEST_CONFIG_PATH = `/tmp/test-config-${Date.now()}/config.json`;
const TEST_BACKUP_DIR = `/tmp/test-config-${Date.now()}/backups`;

mock.module('@/config', () => ({
	config: {
		singbox: {
			configPath: TEST_CONFIG_PATH,
			binary: 'echo',
		},
		configApi: {
			backupEnabled: false,
			backupMaxCount: 10,
			backupDir: TEST_BACKUP_DIR,
			autoReload: false,
		},
	},
}));

mock.module('@/utils/logger', () => ({
	logger: {
		info: mock(() => {}),
		debug: mock(() => {}),
		warn: mock(() => {}),
		error: mock(() => {}),
	},
}));

const { configService } = await import('@/services/config');
const { NotFoundError } = await import('@/utils/errors');

describe('ConfigService', () => {
	let consoleLogSpy: ReturnType<typeof spyOn>;

	beforeEach(async () => {
		consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
		configService.invalidateCache();
		await mkdir(dirname(TEST_CONFIG_PATH), { recursive: true });
	});

	afterEach(async () => {
		consoleLogSpy.mockRestore();
		configService.invalidateCache();
		await rm(dirname(TEST_CONFIG_PATH), { recursive: true, force: true });
	});

	describe('getConfig', () => {
		test('should read and parse config file', async () => {
			const testConfig = { log: { level: 'info' as const } };
			await writeFile(TEST_CONFIG_PATH, JSON.stringify(testConfig));

			const config = await configService.getConfig();

			expect(config).toEqual(testConfig);
		});

		test('should throw NotFoundError when config file does not exist', async () => {
			await rm(TEST_CONFIG_PATH, { force: true });

			await expect(configService.getConfig()).rejects.toThrow(NotFoundError);
		});

		test('should throw error for invalid JSON', async () => {
			await writeFile(TEST_CONFIG_PATH, 'not valid json');

			await expect(configService.getConfig()).rejects.toThrow();
		});
	});

	describe('validateConfig', () => {
		test('should return invalid for null config', async () => {
			const result = await configService.validateConfig(null as never);

			expect(result.valid).toBe(false);
			expect(result.errors[0].code).toBe('INVALID_TYPE');
		});

		test('should return invalid for non-object config', async () => {
			const result = await configService.validateConfig('string' as never);

			expect(result.valid).toBe(false);
			expect(result.errors[0].message).toBe('Configuration must be an object');
		});

		test('should validate object config structure', async () => {
			const result = await configService.validateConfig({ log: { level: 'info' } });

			expect(result).toBeDefined();
			expect(typeof result.valid).toBe('boolean');
			expect(Array.isArray(result.errors)).toBe(true);
		});
	});

	describe('createBackup', () => {
		test('should throw NotFoundError when no config exists', async () => {
			await rm(TEST_CONFIG_PATH, { force: true });

			await expect(configService.createBackup()).rejects.toThrow(NotFoundError);
		});
	});

	describe('concurrent operations', () => {
		test('should handle concurrent config reads', async () => {
			const testConfig = { log: { level: 'debug' as const } };
			await writeFile(TEST_CONFIG_PATH, JSON.stringify(testConfig));

			const results = await Promise.all([
				configService.getConfig(),
				configService.getConfig(),
				configService.getConfig(),
			]);

			expect(results).toHaveLength(3);
			for (const r of results) {
				expect(r).toEqual(testConfig);
			}
		});
	});
});

describe('ValidationResult type', () => {
	let consoleLogSpy: ReturnType<typeof spyOn>;

	beforeEach(async () => {
		consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
		configService.invalidateCache();
		await mkdir(dirname(TEST_CONFIG_PATH), { recursive: true });
	});

	afterEach(async () => {
		consoleLogSpy.mockRestore();
		configService.invalidateCache();
		await rm(dirname(TEST_CONFIG_PATH), { recursive: true, force: true });
	});

	test('should have correct structure for valid result', async () => {
		const result = await configService.validateConfig({ log: { level: 'info' } });

		expect(typeof result.valid).toBe('boolean');
		expect(Array.isArray(result.errors)).toBe(true);
	});

	test('should include error details when invalid', async () => {
		const result = await configService.validateConfig(null as never);

		expect(result.valid).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]).toHaveProperty('path');
		expect(result.errors[0]).toHaveProperty('message');
		expect(result.errors[0]).toHaveProperty('code');
	});
});
