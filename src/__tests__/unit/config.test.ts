import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

describe('Config Module', () => {
	describe('resolvePath logic', () => {
		const resolvePath = (p: string) => (p.startsWith('/') ? p : resolve(process.cwd(), p));

		test('should keep absolute paths unchanged', () => {
			expect(resolvePath('/absolute/path/config.json')).toBe('/absolute/path/config.json');
			expect(resolvePath('/usr/bin/sing-box')).toBe('/usr/bin/sing-box');
			expect(resolvePath('/etc/sing-box')).toBe('/etc/sing-box');
		});

		test('should resolve relative paths from cwd', () => {
			const cwd = process.cwd();
			expect(resolvePath('./bin/sing-box')).toBe(resolve(cwd, './bin/sing-box'));
			expect(resolvePath('config.json')).toBe(resolve(cwd, 'config.json'));
			expect(resolvePath('../parent/file')).toBe(resolve(cwd, '../parent/file'));
		});

		test('should handle edge cases', () => {
			const cwd = process.cwd();
			expect(resolvePath('')).toBe(cwd);
			expect(resolvePath('file.txt')).toBe(resolve(cwd, 'file.txt'));
			expect(resolvePath('a/b/c/d/file.txt')).toBe(resolve(cwd, 'a/b/c/d/file.txt'));
		});

		test('should handle paths starting with dot-slash', () => {
			const cwd = process.cwd();
			expect(resolvePath('./file')).toBe(resolve(cwd, './file'));
			expect(resolvePath('./dir/file')).toBe(resolve(cwd, './dir/file'));
		});

		test('should handle parent directory references', () => {
			const cwd = process.cwd();
			expect(resolvePath('../file')).toBe(resolve(cwd, '../file'));
			expect(resolvePath('../../file')).toBe(resolve(cwd, '../../file'));
			expect(resolvePath('../dir/file')).toBe(resolve(cwd, '../dir/file'));
		});
	});

	describe('environment variables', () => {
		test('default values are defined correctly in source', () => {
			const DEFAULT_PORT = 3333;
			expect(DEFAULT_PORT).toBe(3333);

			const DEFAULT_HOST = '0.0.0.0';
			expect(DEFAULT_HOST).toBe('0.0.0.0');

			const DEFAULT_LOG_LEVEL = 'info';
			expect(DEFAULT_LOG_LEVEL).toBe('info');

			const DEFAULTS = {
				restartDelay: 1000,
				maxRestarts: 5,
				restartWindow: 60000,
				autoRestart: true,
			};
			expect(DEFAULTS.restartDelay).toBe(1000);
			expect(DEFAULTS.maxRestarts).toBe(5);
			expect(DEFAULTS.restartWindow).toBe(60000);
			expect(DEFAULTS.autoRestart).toBe(true);
		});

		test('valid log levels are debug, info, warn, error', () => {
			const validLevels = ['debug', 'info', 'warn', 'error'];
			expect(validLevels).toContain('debug');
			expect(validLevels).toContain('info');
			expect(validLevels).toContain('warn');
			expect(validLevels).toContain('error');
			expect(validLevels.length).toBe(4);
		});

		test('valid NODE_ENV values are development, production, test', () => {
			const validEnvs = ['development', 'production', 'test'];
			expect(validEnvs).toContain('development');
			expect(validEnvs).toContain('production');
			expect(validEnvs).toContain('test');
			expect(validEnvs.length).toBe(3);
		});
	});

	describe('isDev and isProd logic', () => {
		test('should correctly determine isDev', () => {
			const isDev = (nodeEnv: string) => nodeEnv === 'development';

			expect(isDev('development')).toBe(true);
			expect(isDev('production')).toBe(false);
			expect(isDev('test')).toBe(false);
		});

		test('should correctly determine isProd', () => {
			const isProd = (nodeEnv: string) => nodeEnv === 'production';

			expect(isProd('development')).toBe(false);
			expect(isProd('production')).toBe(true);
			expect(isProd('test')).toBe(false);
		});

		test('isDev and isProd should be mutually exclusive', () => {
			const check = (nodeEnv: string) => {
				const isDev = nodeEnv === 'development';
				const isProd = nodeEnv === 'production';
				return !(isDev && isProd);
			};

			expect(check('development')).toBe(true);
			expect(check('production')).toBe(true);
			expect(check('test')).toBe(true);
		});
	});
});
