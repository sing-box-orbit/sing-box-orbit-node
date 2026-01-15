import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const mockConfig: { logLevel: LogLevel } = {
	logLevel: 'info',
};

mock.module('@/config', () => ({
	config: mockConfig,
}));

const { logger } = await import('@/utils/logger');

describe('Logger', () => {
	let consoleLogSpy: ReturnType<typeof spyOn>;
	let consoleWarnSpy: ReturnType<typeof spyOn>;
	let consoleErrorSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
		consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
		consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	describe('log levels', () => {
		test('info should log when level is info', () => {
			mockConfig.logLevel = 'info';
			logger.info('Test message');

			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			expect(consoleLogSpy.mock.calls[0][0]).toContain('Test message');
			expect(consoleLogSpy.mock.calls[0][0]).toContain('INFO');
		});

		test('debug should not log when level is info', () => {
			mockConfig.logLevel = 'info';
			logger.debug('Debug message');

			expect(consoleLogSpy).not.toHaveBeenCalled();
		});

		test('debug should log when level is debug', () => {
			mockConfig.logLevel = 'debug';
			logger.debug('Debug message');

			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			expect(consoleLogSpy.mock.calls[0][0]).toContain('Debug message');
			expect(consoleLogSpy.mock.calls[0][0]).toContain('DEBUG');
		});

		test('warn should use console.warn', () => {
			mockConfig.logLevel = 'info';
			logger.warn('Warning message');

			expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
			expect(consoleWarnSpy.mock.calls[0][0]).toContain('Warning message');
			expect(consoleWarnSpy.mock.calls[0][0]).toContain('WARN');
		});

		test('error should use console.error', () => {
			mockConfig.logLevel = 'info';
			logger.error('Error message');

			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
			expect(consoleErrorSpy.mock.calls[0][0]).toContain('Error message');
			expect(consoleErrorSpy.mock.calls[0][0]).toContain('ERROR');
		});

		test('error should log even when level is error', () => {
			mockConfig.logLevel = 'error';
			logger.error('Error only');
			logger.warn('Should not appear');
			logger.info('Should not appear');

			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
			expect(consoleWarnSpy).not.toHaveBeenCalled();
			expect(consoleLogSpy).not.toHaveBeenCalled();
		});
	});

	describe('message formatting', () => {
		test('should include timestamp in ISO format', () => {
			mockConfig.logLevel = 'info';
			logger.info('Test');

			const output = consoleLogSpy.mock.calls[0][0] as string;
			expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		});

		test('should include metadata as JSON', () => {
			mockConfig.logLevel = 'info';
			logger.info('Test', { key: 'value', num: 42 });

			const output = consoleLogSpy.mock.calls[0][0] as string;
			expect(output).toContain('{"key":"value","num":42}');
		});

		test('should pad log level to 5 characters', () => {
			mockConfig.logLevel = 'debug';

			logger.info('Test');
			expect(consoleLogSpy.mock.calls[0][0]).toContain('INFO ');

			logger.debug('Test');
			expect(consoleLogSpy.mock.calls[1][0]).toContain('DEBUG');
		});
	});

	describe('log level hierarchy', () => {
		test('warn level should log warn and error only', () => {
			mockConfig.logLevel = 'warn';

			logger.debug('debug');
			logger.info('info');
			logger.warn('warn');
			logger.error('error');

			expect(consoleLogSpy).not.toHaveBeenCalled();
			expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		});

		test('debug level should log everything', () => {
			mockConfig.logLevel = 'debug';

			logger.debug('debug');
			logger.info('info');
			logger.warn('warn');
			logger.error('error');

			expect(consoleLogSpy).toHaveBeenCalledTimes(2);
			expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		});
	});
});
