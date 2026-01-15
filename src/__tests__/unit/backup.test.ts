import { afterAll, beforeAll, describe, expect, mock, spyOn, test } from 'bun:test';
import { rm } from 'node:fs/promises';

const TEST_BACKUP_DIR = `/tmp/test-backup-${Date.now()}-${Math.random().toString(36).slice(2)}`;

mock.module('@/config', () => ({
	config: {
		configApi: {
			backupDir: TEST_BACKUP_DIR,
			backupMaxCount: 3,
		},
	},
}));

mock.module('@/utils/logger', () => ({
	logger: {
		info: mock(() => {}),
		debug: mock(() => {}),
		warn: mock(() => {}),
		error: mock(() => {}),
	},
}));

const { backupService } = await import('@/services/backup');

describe('BackupService', () => {
	let consoleLogSpy: ReturnType<typeof spyOn>;

	beforeAll(() => {
		consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
	});

	afterAll(async () => {
		consoleLogSpy.mockRestore();
		await rm(TEST_BACKUP_DIR, { recursive: true, force: true });
	});

	describe('create', () => {
		test('should create a backup with metadata', async () => {
			const content = JSON.stringify({ log: { level: 'info' } });
			const backup = await backupService.create(content, 'test-reason');

			expect(backup.id).toBeDefined();
			expect(backup.reason).toBe('test-reason');
			expect(backup.size).toBeGreaterThan(0);
			expect(backup.configHash).toBeDefined();
			expect(backup.filename).toMatch(/^config-.+\.json$/);
			expect(backup.createdAt).toBeDefined();
		});

		test('should return existing backup for duplicate content', async () => {
			const content = JSON.stringify({ duplicate: 'test', rand: Math.random() });

			const first = await backupService.create(content, 'first');
			const second = await backupService.create(content, 'second');

			expect(second.id).toBe(first.id);
			expect(second.configHash).toBe(first.configHash);
		});

		test('should create different backups for different content', async () => {
			const content1 = JSON.stringify({ unique1: Math.random() });
			const content2 = JSON.stringify({ unique2: Math.random() });

			const first = await backupService.create(content1, 'first');
			const second = await backupService.create(content2, 'second');

			expect(second.id).not.toBe(first.id);
			expect(second.configHash).not.toBe(first.configHash);
		});
	});

	describe('get and getContent', () => {
		test('should return backup by id', async () => {
			const content = JSON.stringify({ get: 'test', rand: Math.random() });
			const created = await backupService.create(content, 'get-test');

			const backup = await backupService.get(created.id);

			expect(backup).not.toBeNull();
			expect(backup?.id).toBe(created.id);
			expect(backup?.reason).toBe('get-test');
		});

		test('should return null for non-existent id', async () => {
			const backup = await backupService.get('non-existent-id');
			expect(backup).toBeNull();
		});

		test('should return backup content', async () => {
			const originalContent = JSON.stringify({ content: 'test', rand: Math.random() });
			const created = await backupService.create(originalContent, 'content-test');

			const content = await backupService.getContent(created.id);

			expect(content).toBe(originalContent);
		});

		test('should return null content for non-existent backup', async () => {
			const content = await backupService.getContent('non-existent');
			expect(content).toBeNull();
		});
	});

	describe('delete', () => {
		test('should delete existing backup', async () => {
			const content = JSON.stringify({ delete: 'me', rand: Math.random() });
			const created = await backupService.create(content, 'to-delete');

			const deleted = await backupService.delete(created.id);

			expect(deleted).toBe(true);

			const afterDelete = await backupService.get(created.id);
			expect(afterDelete).toBeNull();
		});

		test('should return false for non-existent backup', async () => {
			const deleted = await backupService.delete('non-existent-for-delete');
			expect(deleted).toBe(false);
		});
	});

	describe('list', () => {
		test('should return backups array', async () => {
			const backups = await backupService.list();
			expect(Array.isArray(backups)).toBe(true);
		});
	});

	describe('hash deduplication', () => {
		test('should generate consistent hash for same content', async () => {
			const content = JSON.stringify({ hash: 'consistent', rand: Math.random() });
			const first = await backupService.create(content, 'hash-1');
			const second = await backupService.create(content, 'hash-2');

			expect(first.configHash).toBe(second.configHash);
		});
	});

	describe('file persistence', () => {
		test('should persist backup files and be retrievable', async () => {
			const content = JSON.stringify({ persist: true, rand: Math.random() });
			const backup = await backupService.create(content, 'persist');

			const retrieved = await backupService.get(backup.id);
			const retrievedContent = await backupService.getContent(backup.id);

			expect(retrieved).not.toBeNull();
			expect(retrieved?.id).toBe(backup.id);
			expect(retrievedContent).toBe(content);
		});
	});
});
