import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { appendFile, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '@/config';
import { logger } from '@/utils/logger';

class LogStorageService {
	private logs: string[] = [];
	private writeBuffer: string[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private isInitialized = false;

	async init(): Promise<void> {
		if (this.isInitialized) return;

		if (config.logs.persist) {
			await this.ensureLogDir();
			await this.loadExistingLogs();
		}

		this.isInitialized = true;
		logger.info('Log storage initialized', {
			persist: config.logs.persist,
			maxLines: config.logs.maxLines,
			filePath: config.logs.filePath,
		});
	}

	add(line: string): void {
		this.logs.push(line);

		if (this.logs.length > config.logs.maxLines) {
			this.logs.shift();
		}

		if (config.logs.persist) {
			this.writeBuffer.push(line);
			this.scheduleFlush();
		}
	}

	get(limit?: number): string[] {
		if (limit && limit > 0) {
			return this.logs.slice(-limit);
		}
		return [...this.logs];
	}

	clear(): void {
		this.logs = [];
		if (config.logs.persist) {
			this.writeBuffer = [];
		}
	}

	async flush(): Promise<void> {
		if (!config.logs.persist || this.writeBuffer.length === 0) return;

		const lines = this.writeBuffer.splice(0, this.writeBuffer.length);
		const content = `${lines.join('\n')}\n`;

		try {
			await this.rotateIfNeeded();
			await appendFile(config.logs.filePath, content);
		} catch (error) {
			logger.error('Failed to write logs to file', {
				error: error instanceof Error ? error.message : String(error),
			});
			this.writeBuffer.unshift(...lines);
		}
	}

	private scheduleFlush(): void {
		if (this.flushTimer) return;

		this.flushTimer = setTimeout(async () => {
			this.flushTimer = null;
			await this.flush();
		}, 1000);
	}

	private async ensureLogDir(): Promise<void> {
		const dir = dirname(config.logs.filePath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
			logger.debug('Created log directory', { dir });
		}
	}

	private async loadExistingLogs(): Promise<void> {
		try {
			if (!existsSync(config.logs.filePath)) return;

			const content = await readFile(config.logs.filePath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			const startIndex = Math.max(0, lines.length - config.logs.maxLines);
			this.logs = lines.slice(startIndex);

			logger.debug('Loaded existing logs', { count: this.logs.length });
		} catch (error) {
			logger.warn('Failed to load existing logs', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async rotateIfNeeded(): Promise<void> {
		try {
			if (!existsSync(config.logs.filePath)) return;

			const stats = statSync(config.logs.filePath);
			if (stats.size < config.logs.fileMaxSize) return;

			const rotatedPath = `${config.logs.filePath}.1`;
			await rename(config.logs.filePath, rotatedPath);
			await writeFile(config.logs.filePath, '');

			await this.cleanupOldFiles();

			logger.info('Log file rotated', { size: stats.size });
		} catch (error) {
			logger.error('Failed to rotate log file', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async cleanupOldFiles(): Promise<void> {
		const dir = dirname(config.logs.filePath);
		const baseName = config.logs.filePath.split('/').pop()!;

		const rotatedFiles = readdirSync(dir)
			.filter((f) => f.startsWith(baseName) && f !== baseName)
			.map((f) => ({
				name: f,
				path: `${dir}/${f}`,
				mtime: statSync(`${dir}/${f}`).mtime.getTime(),
			}))
			.sort((a, b) => b.mtime - a.mtime);

		const filesToDelete = rotatedFiles.slice(config.logs.fileMaxFiles - 1);
		for (const file of filesToDelete) {
			unlinkSync(file.path);
			logger.debug('Deleted old log file', { file: file.name });
		}
	}
}

export const logStorageService = new LogStorageService();
