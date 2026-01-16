import { app } from './app';
import { config } from './config';
import { logStorageService, processService } from './services';
import { AppError, logger } from './utils';

const startServer = async () => {
	if (config.isProd && !config.apiKey) {
		if (config.apiKeyRequired) {
			logger.error('API_KEY is required in production mode. Set API_KEY or API_KEY_REQUIRED=false');
			process.exit(1);
		}
		logger.warn(
			'WARNING: No API_KEY configured in production! API is accessible without authentication.',
		);
	}

	await logStorageService.init();

	try {
		await processService.start();
	} catch (error) {
		if (error instanceof AppError) {
			logger.error(`Failed to start sing-box: ${error.message}`, {
				code: error.code,
			});
		} else if (error instanceof Error) {
			logger.error(`Failed to start sing-box: ${error.message}`);
		} else {
			logger.error('Failed to start sing-box: Unknown error');
		}
		logger.warn('Starting API server without sing-box process...');
	}

	const server = Bun.serve({
		port: config.port,
		hostname: config.host,
		fetch: app.fetch,
	});

	logger.info('sing-box-orbit started', {
		port: server.port,
		hostname: config.host,
		url: `http://${config.host}:${server.port}`,
		docs: `http://${config.host}:${server.port}/docs`,
		authRequired: !!config.apiKey,
		singboxRunning: (await processService.getStatus()).running,
	});

	return server;
};

const shutdown = async (server: ReturnType<typeof Bun.serve>) => {
	logger.info('Shutting down...');

	const shutdownTimeout = setTimeout(() => {
		logger.error('Shutdown timeout exceeded, forcing exit');
		process.exit(1);
	}, 10000);

	try {
		await processService.stop();
		await logStorageService.flush();
		server.stop();
		clearTimeout(shutdownTimeout);
		logger.info('Shutdown complete');
		process.exit(0);
	} catch (error) {
		clearTimeout(shutdownTimeout);
		logger.error('Error during shutdown', {
			error: error instanceof Error ? error.message : 'Unknown error',
		});
		process.exit(1);
	}
};

(async () => {
	const server = await startServer();

	process.on('SIGINT', () => shutdown(server));
	process.on('SIGTERM', () => shutdown(server));

	process.on('uncaughtException', (error) => {
		logger.error('Uncaught exception', { error: error.message, stack: error.stack });
		shutdown(server);
	});

	process.on('unhandledRejection', (reason) => {
		logger.error('Unhandled rejection', {
			reason: reason instanceof Error ? reason.message : String(reason),
		});
	});
})();
