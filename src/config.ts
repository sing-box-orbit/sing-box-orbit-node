import { resolve } from 'node:path';
import { cleanEnv, num, str } from 'envalid';

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
	SINGBOX_BIN: str({ default: 'sing-box', desc: 'Path to sing-box binary' }),
	SINGBOX_CONFIG_PATH: str({
		default: '/etc/sing-box/config.json',
		desc: 'Path to sing-box config',
	}),
	SINGBOX_WORKING_DIR: str({ default: '/etc/sing-box', desc: 'sing-box working directory' }),
	LOG_LEVEL: logLevel,
});

export const config = {
	isDev: env.NODE_ENV === 'development',
	isProd: env.NODE_ENV === 'production',
	host: env.HOST,
	port: env.PORT,
	apiKey: env.API_KEY,
	singbox: {
		binary: resolvePath(env.SINGBOX_BIN),
		configPath: resolvePath(env.SINGBOX_CONFIG_PATH),
		workingDir: resolvePath(env.SINGBOX_WORKING_DIR),
	},
	logLevel: env.LOG_LEVEL,
} as const;

export type Config = typeof config;
