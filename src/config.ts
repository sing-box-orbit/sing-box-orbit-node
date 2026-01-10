import { resolve } from 'node:path';
import { bool, cleanEnv, num, str } from 'envalid';

const resolvePath = (p: string) => (p.startsWith('/') ? p : resolve(process.cwd(), p));

const logLevel = str({
	choices: ['debug', 'info', 'warn', 'error'] as const,
	default: 'info',
	desc: 'Logging level',
});

const env = cleanEnv(process.env, {
	NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),
	HOST: str({ default: '0.0.0.0', desc: 'Server host' }),
	PORT: num({ default: 3333, desc: 'Server port' }),
	API_KEY: str({ default: '', desc: 'API key for authentication' }),
	RATE_LIMIT_ENABLED: bool({ default: true, desc: 'Enable rate limiting' }),
	RATE_LIMIT_MAX_REQUESTS: num({ default: 100, desc: 'Max requests per window' }),
	RATE_LIMIT_WINDOW_MS: num({ default: 60000, desc: 'Time window in milliseconds' }),
	SINGBOX_BIN: str({ default: 'sing-box', desc: 'Path to sing-box binary' }),
	SINGBOX_CONFIG_PATH: str({
		default: '/etc/sing-box/config.json',
		desc: 'Path to sing-box config',
	}),
	SINGBOX_WORKING_DIR: str({ default: '/etc/sing-box', desc: 'sing-box working directory' }),
	SINGBOX_AUTO_RESTART: bool({ default: true, desc: 'Auto-restart sing-box on crash' }),
	SINGBOX_RESTART_DELAY: num({ default: 1000, desc: 'Initial delay before restart (ms)' }),
	SINGBOX_MAX_RESTARTS: num({ default: 5, desc: 'Max restarts within window before giving up' }),
	SINGBOX_RESTART_WINDOW: num({ default: 60000, desc: 'Time window for counting restarts (ms)' }),
	LOG_LEVEL: logLevel,
	LOG_MAX_LINES: num({ default: 1000, desc: 'Max log lines to keep in memory' }),
	LOG_PERSIST: bool({ default: true, desc: 'Persist logs to file' }),
	LOG_FILE_MAX_SIZE: num({ default: 10485760, desc: 'Max log file size in bytes (default 10MB)' }),
	LOG_FILE_MAX_FILES: num({ default: 5, desc: 'Max number of rotated log files to keep' }),
});

export const config = {
	isDev: env.NODE_ENV === 'development',
	isProd: env.NODE_ENV === 'production',
	host: env.HOST,
	port: env.PORT,
	apiKey: env.API_KEY,
	rateLimit: {
		enabled: env.RATE_LIMIT_ENABLED,
		maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
		windowMs: env.RATE_LIMIT_WINDOW_MS,
	},
	singbox: {
		binary: resolvePath(env.SINGBOX_BIN),
		configPath: resolvePath(env.SINGBOX_CONFIG_PATH),
		workingDir: resolvePath(env.SINGBOX_WORKING_DIR),
		autoRestart: env.SINGBOX_AUTO_RESTART,
		restartDelay: env.SINGBOX_RESTART_DELAY,
		maxRestarts: env.SINGBOX_MAX_RESTARTS,
		restartWindow: env.SINGBOX_RESTART_WINDOW,
	},
	logLevel: env.LOG_LEVEL,
	logs: {
		maxLines: env.LOG_MAX_LINES,
		persist: env.LOG_PERSIST,
		fileMaxSize: env.LOG_FILE_MAX_SIZE,
		fileMaxFiles: env.LOG_FILE_MAX_FILES,
		filePath: resolve(process.cwd(), 'data/logs/singbox.log'),
	},
} as const;

export type Config = typeof config;
