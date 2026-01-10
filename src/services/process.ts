import { config } from '@/config';
import type { ServerStatus } from '@/types';
import { ConfigValidationError, ProcessError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { type Subprocess, spawn } from 'bun';

const MAX_LOG_LINES = 1000;

class ProcessService {
	private process: Subprocess | null = null;
	private startedAt: Date | null = null;
	private version: string | null = null;
	private logs: string[] = [];

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
		});

		await Bun.sleep(500);

		if (!this.process || this.process.killed) {
			throw new ProcessError('sing-box failed to start - check your configuration');
		}

		logger.info('sing-box started', { pid: this.process.pid });
	}

	async stop(): Promise<void> {
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
		};
	}

	getLogs(limit?: number): string[] {
		if (limit && limit > 0) {
			return this.logs.slice(-limit);
		}
		return [...this.logs];
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
