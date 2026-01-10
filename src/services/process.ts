import { type Subprocess, spawn } from 'bun';
import { config } from '@/config';
import type { RestartStats, ServerStatus } from '@/types';
import { ConfigValidationError, ProcessError } from '@/utils/errors';
import { logger } from '@/utils/logger';

const MAX_LOG_LINES = 1000;

class ProcessService {
	private process: Subprocess | null = null;
	private startedAt: Date | null = null;
	private version: string | null = null;
	private logs: string[] = [];
	private restartCount = 0;
	private restartTimestamps: number[] = [];
	private lastRestartAt: Date | null = null;
	private restartTimer: ReturnType<typeof setTimeout> | null = null;
	private maxRestartsReached = false;
	private isShuttingDown = false;

	async start(): Promise<void> {
		const configPath = config.singbox.configPath;

		const file = Bun.file(configPath);
		if (!(await file.exists())) {
			throw new ProcessError('No config file found');
		}

		await this.checkConfig(configPath);

		this.logs = [];

		logger.info('Starting sing-box', { configPath });

		this.process = spawn({
			cmd: [config.singbox.binary, 'run', '-c', configPath],
			cwd: config.singbox.workingDir,
			stdout: 'pipe',
			stderr: 'pipe',
		});

		this.startedAt = new Date();

		const { stdout, stderr } = this.process;
		if (stdout && typeof stdout !== 'number') {
			this.pipeOutput(stdout, 'stdout');
		}
		if (stderr && typeof stderr !== 'number') {
			this.pipeOutput(stderr, 'stderr');
		}

		this.process.exited.then((code) => {
			logger.info('sing-box process exited', { exitCode: code });
			this.process = null;
			this.startedAt = null;

			if (!this.isShuttingDown && config.singbox.autoRestart) {
				this.scheduleRestart(code);
			}
		});

		await Bun.sleep(500);

		if (!this.process || this.process.killed) {
			throw new ProcessError('sing-box failed to start - check your configuration');
		}

		logger.info('sing-box started', { pid: this.process.pid });
	}

	async stop(): Promise<void> {
		this.isShuttingDown = true;
		this.cancelScheduledRestart();

		if (!this.process || this.process.killed) {
			return;
		}

		logger.info('Stopping sing-box', { pid: this.process.pid });

		this.process.kill('SIGTERM');

		const exitCode = await Promise.race([this.process.exited, Bun.sleep(5000).then(() => null)]);

		if (exitCode === null && this.process && !this.process.killed) {
			logger.warn('Force killing sing-box');
			this.process.kill('SIGKILL');
			await this.process.exited;
		}

		this.process = null;
		this.startedAt = null;
	}

	async reload(): Promise<{ pid: number; reloadedAt: string }> {
		if (!this.process || this.process.killed) {
			throw new ProcessError('sing-box is not running');
		}

		await this.checkConfig(config.singbox.configPath);

		logger.info('Reloading sing-box config', { pid: this.process.pid });
		this.process.kill('SIGHUP');

		return {
			pid: this.process.pid,
			reloadedAt: new Date().toISOString(),
		};
	}

	async getStatus(): Promise<ServerStatus> {
		const running = this.process !== null && !this.process.killed;
		const uptime =
			running && this.startedAt ? Math.floor((Date.now() - this.startedAt.getTime()) / 1000) : null;

		if (!this.version) {
			this.version = await this.getVersion();
		}

		return {
			running,
			pid: running ? this.process!.pid : null,
			uptime,
			startedAt: this.startedAt?.toISOString() ?? null,
			version: this.version,
			restartStats: this.getRestartStats(),
		};
	}

	getRestartStats(): RestartStats {
		return {
			enabled: config.singbox.autoRestart,
			count: this.restartCount,
			lastRestartAt: this.lastRestartAt?.toISOString() ?? null,
			nextRestartIn: this.getNextRestartIn(),
			maxRestartsReached: this.maxRestartsReached,
		};
	}

	resetRestartStats(): void {
		this.restartCount = 0;
		this.restartTimestamps = [];
		this.lastRestartAt = null;
		this.maxRestartsReached = false;
		this.cancelScheduledRestart();
		logger.info('Restart stats reset');
	}

	getLogs(limit?: number): string[] {
		if (limit && limit > 0) {
			return this.logs.slice(-limit);
		}
		return [...this.logs];
	}

	private scheduleRestart(exitCode: number | null): void {
		const now = Date.now();
		const windowStart = now - config.singbox.restartWindow;
		this.restartTimestamps = this.restartTimestamps.filter((ts) => ts > windowStart);

		if (this.restartTimestamps.length >= config.singbox.maxRestarts) {
			this.maxRestartsReached = true;
			logger.error('Max restarts reached, giving up', {
				restarts: this.restartTimestamps.length,
				window: config.singbox.restartWindow,
				maxRestarts: config.singbox.maxRestarts,
			});
			return;
		}

		const backoffMultiplier = Math.min(this.restartTimestamps.length, 5);
		const delay = config.singbox.restartDelay * 2 ** backoffMultiplier;

		logger.info('Scheduling restart', {
			exitCode,
			delay,
			restartCount: this.restartTimestamps.length + 1,
			maxRestarts: config.singbox.maxRestarts,
		});

		this.restartTimer = setTimeout(async () => {
			this.restartTimer = null;
			this.restartCount++;
			this.restartTimestamps.push(Date.now());
			this.lastRestartAt = new Date();

			try {
				await this.start();
				logger.info('Auto-restart successful', { restartCount: this.restartCount });
			} catch (error) {
				logger.error('Auto-restart failed', {
					error: error instanceof Error ? error.message : String(error),
					restartCount: this.restartCount,
				});
			}
		}, delay);
	}

	private cancelScheduledRestart(): void {
		if (this.restartTimer) {
			clearTimeout(this.restartTimer);
			this.restartTimer = null;
		}
	}

	private getNextRestartIn(): number | null {
		if (!this.restartTimer) {
			return null;
		}
		return config.singbox.restartDelay;
	}

	private addLog(line: string): void {
		this.logs.push(line);
		if (this.logs.length > MAX_LOG_LINES) {
			this.logs.shift();
		}
	}

	private async checkConfig(configPath: string): Promise<void> {
		const proc = spawn({
			cmd: [config.singbox.binary, 'check', '-c', configPath],
			stdout: 'pipe',
			stderr: 'pipe',
		});

		const stderr = await new Response(proc.stderr).text();
		const exitCode = await proc.exited;

		if (exitCode !== 0) {
			const errorMatch = stderr.match(/decode config.*?: (.+)/);
			const errorMessage = errorMatch ? errorMatch[1] : stderr.trim();
			throw new ConfigValidationError(errorMessage || 'Invalid configuration');
		}
	}

	private async getVersion(): Promise<string | null> {
		try {
			const proc = spawn({
				cmd: [config.singbox.binary, 'version'],
				stdout: 'pipe',
				stderr: 'pipe',
			});

			const stdout = await new Response(proc.stdout).text();
			await proc.exited;

			const match = stdout.match(/sing-box version (\S+)/);
			return match ? match[1] : null;
		} catch {
			return null;
		}
	}

	private async pipeOutput(
		stream: ReadableStream<Uint8Array> | null,
		type: 'stdout' | 'stderr',
	): Promise<void> {
		if (!stream) return;

		const reader = stream.getReader();
		const decoder = new TextDecoder();

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const text = decoder.decode(value).trim();
				if (text) {
					const timestamp = new Date().toISOString();
					const logLine = `[${timestamp}] ${text}`;
					this.addLog(logLine);

					if (type === 'stderr') {
						logger.warn(`[sing-box] ${text}`);
					} else {
						logger.debug(`[sing-box] ${text}`);
					}
				}
			}
		} catch {}
	}
}

export const processService = new ProcessService();
