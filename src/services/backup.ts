import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '@/config';
import { logger } from '@/utils/logger';

export interface Backup {
	id: string;
	createdAt: string;
	reason: string;
	configHash: string;
	size: number;
	filename: string;
}

class BackupService {
	private readonly backupDir = config.configApi.backupDir;
	private readonly maxBackups = config.configApi.backupMaxCount;

	async init(): Promise<void> {
		await mkdir(this.backupDir, { recursive: true });
	}

	async create(configContent: string, reason = 'manual'): Promise<Backup> {
		await this.init();

		const id = this.generateId();
		const filename = `config-${id}.json`;
		const filepath = join(this.backupDir, filename);
		const configHash = await this.hashContent(configContent);

		const existing = await this.findByHash(configHash);
		if (existing) {
			logger.debug('Backup already exists with same hash', { existingId: existing.id });
			return existing;
		}

		await Bun.write(filepath, configContent);

		const fileStats = await stat(filepath);
		const backup: Backup = {
			id,
			createdAt: new Date().toISOString(),
			reason,
			configHash,
			size: fileStats.size,
			filename,
		};

		await this.saveMetadata(id, backup);
		await this.rotate();

		logger.info('Config backup created', { id, reason, size: backup.size });

		return backup;
	}

	async list(): Promise<Backup[]> {
		await this.init();

		const files = await readdir(this.backupDir);
		const metaFiles = files.filter((f) => f.endsWith('.meta.json'));

		const backups: Backup[] = [];
		for (const metaFile of metaFiles) {
			try {
				const content = await Bun.file(join(this.backupDir, metaFile)).json();
				backups.push(content as Backup);
			} catch (error) {
				logger.debug('Failed to read backup metadata', {
					file: metaFile,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return backups.sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		);
	}

	async get(id: string): Promise<Backup | null> {
		const metaPath = join(this.backupDir, `config-${id}.meta.json`);
		const file = Bun.file(metaPath);

		if (!(await file.exists())) {
			return null;
		}

		try {
			return (await file.json()) as Backup;
		} catch {
			return null;
		}
	}

	async getContent(id: string): Promise<string | null> {
		const backup = await this.get(id);
		if (!backup) {
			return null;
		}

		const filepath = join(this.backupDir, backup.filename);
		const file = Bun.file(filepath);

		if (!(await file.exists())) {
			return null;
		}

		return file.text();
	}

	async delete(id: string): Promise<boolean> {
		const backup = await this.get(id);
		if (!backup) {
			return false;
		}

		const configPath = join(this.backupDir, backup.filename);
		const metaPath = join(this.backupDir, `config-${id}.meta.json`);

		try {
			await rm(configPath, { force: true });
			await rm(metaPath, { force: true });
			logger.info('Backup deleted', { id });
			return true;
		} catch (error) {
			logger.error('Failed to delete backup', { id, error });
			return false;
		}
	}

	private async findByHash(hash: string): Promise<Backup | null> {
		const backups = await this.list();
		return backups.find((b) => b.configHash === hash) ?? null;
	}

	private async rotate(): Promise<void> {
		const backups = await this.list();

		if (backups.length <= this.maxBackups) {
			return;
		}

		const toDelete = backups.slice(this.maxBackups);
		for (const backup of toDelete) {
			await this.delete(backup.id);
			logger.debug('Rotated old backup', { id: backup.id });
		}
	}

	private async saveMetadata(id: string, backup: Backup): Promise<void> {
		const metaPath = join(this.backupDir, `config-${id}.meta.json`);
		await Bun.write(metaPath, JSON.stringify(backup, null, 2));
	}

	private generateId(): string {
		const now = new Date();
		const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5);
		const random = Math.random().toString(36).slice(2, 8);
		return `${timestamp}_${random}`;
	}

	private async hashContent(content: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(content);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
	}
}

export const backupService = new BackupService();
