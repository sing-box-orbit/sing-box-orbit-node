import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
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
			const file = Bun.file(config.logs.filePath);
			const existing = (await file.exists()) ? await file.text() : '';
			await Bun.write(config.logs.filePath, existing + content);
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
		try {
			await stat(dir);
		} catch {
			await mkdir(dir, { recursive: true });
			logger.debug('Created log directory', { dir });
		}
	}

	private async loadExistingLogs(): Promise<void> {
		try {
			const file = Bun.file(config.logs.filePath);
			if (!(await file.exists())) return;

			const content = await file.text();
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
			const file = Bun.file(config.logs.filePath);
			if (!(await file.exists())) return;

			const fileSize = file.size;
			if (fileSize < config.logs.fileMaxSize) return;

			const rotatedPath = `${config.logs.filePath}.1`;
			await rename(config.logs.filePath, rotatedPath);
			await Bun.write(config.logs.filePath, '');

			await this.cleanupOldFiles();

			logger.info('Log file rotated', { size: fileSize });
		} catch (error) {
			logger.error('Failed to rotate log file', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async cleanupOldFiles(): Promise<void> {
		const dir = dirname(config.logs.filePath);
		const baseName = config.logs.filePath.split('/').pop()!;

		const files = await readdir(dir);
		const rotatedFiles: { name: string; path: string; mtime: number }[] = [];

		for (const f of files) {
			if (f.startsWith(baseName) && f !== baseName) {
				const filePath = `${dir}/${f}`;
				const fileStat = await stat(filePath);
				rotatedFiles.push({
					name: f,
					path: filePath,
					mtime: fileStat.mtime.getTime(),
				});
			}
		}

		rotatedFiles.sort((a, b) => b.mtime - a.mtime);

		const filesToDelete = rotatedFiles.slice(config.logs.fileMaxFiles - 1);
		for (const file of filesToDelete) {
			await rm(file.path);
			logger.debug('Deleted old log file', { file: file.name });
		}
	}
}

export const logStorageService = new LogStorageService();
