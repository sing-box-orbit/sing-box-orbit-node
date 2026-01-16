import { config } from '@/config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levels: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

const colors = {
	debug: '\x1b[36m',
	info: '\x1b[32m',
	warn: '\x1b[33m',
	error: '\x1b[31m',
	reset: '\x1b[0m',
};

function shouldLog(level: LogLevel): boolean {
	return levels[level] >= levels[config.logLevel];
}

function formatTimestamp(): string {
	return new Date().toISOString();
}

function formatTextMessage(level: LogLevel, message: string, meta?: object): string {
	const timestamp = formatTimestamp();
	const color = colors[level];
	const reset = colors.reset;
	const levelStr = level.toUpperCase().padEnd(5);

	let output = `${color}[${timestamp}] ${levelStr}${reset} ${message}`;

	if (meta) {
		output += ` ${JSON.stringify(meta)}`;
	}

	return output;
}

function formatJsonMessage(level: LogLevel, message: string, meta?: object): string {
	return JSON.stringify({
		timestamp: formatTimestamp(),
		level,
		message,
		...meta,
	});
}

function formatMessage(level: LogLevel, message: string, meta?: object): string {
	if (config.logFormat === 'json') {
		return formatJsonMessage(level, message, meta);
	}
	return formatTextMessage(level, message, meta);
}

export const logger = {
	debug(message: string, meta?: object) {
		if (shouldLog('debug')) {
			console.log(formatMessage('debug', message, meta));
		}
	},

	info(message: string, meta?: object) {
		if (shouldLog('info')) {
			console.log(formatMessage('info', message, meta));
		}
	},

	warn(message: string, meta?: object) {
		if (shouldLog('warn')) {
			console.warn(formatMessage('warn', message, meta));
		}
	},

	error(message: string, meta?: object) {
		if (shouldLog('error')) {
			console.error(formatMessage('error', message, meta));
		}
	},
};
