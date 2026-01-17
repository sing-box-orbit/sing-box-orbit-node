import { rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawn } from 'bun';
import { config } from '@/config';
import type { SingBoxConfig } from '@/types/singbox';
import { BadRequestError, ConfigValidationError, NotFoundError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { RWLock } from '@/utils/rwlock';
import { backupService } from '../backup';
import { processService } from '../process';

export interface ValidationError {
	path: string;
	message: string;
	code: string;
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
}

export interface ConfigChange {
	type: 'added' | 'removed' | 'modified';
	path: string;
	oldValue?: unknown;
	newValue?: unknown;
}

export class BaseConfigService {
	protected readonly configPath = config.singbox.configPath;
	protected readonly binary = config.singbox.binary;
	protected readonly rwlock = new RWLock();
	protected configCache: SingBoxConfig | null = null;

	async getConfig(): Promise<SingBoxConfig> {
		const release = await this.acquireReadLock();

		try {
			if (this.configCache) {
				return this.configCache;
			}

			const file = Bun.file(this.configPath);

			if (!(await file.exists())) {
				throw new NotFoundError('Configuration file not found');
			}

			const configData = (await file.json()) as SingBoxConfig;
			this.configCache = configData;
			return configData;
		} catch (error) {
			if (error instanceof NotFoundError) {
				throw error;
			}
			throw new BadRequestError(
				`Failed to parse configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		} finally {
			release();
		}
	}

	async setConfig(newConfig: SingBoxConfig, reason = 'api-update'): Promise<void> {
		const release = await this.acquireLock();

		try {
			const validation = await this.validateConfig(newConfig);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(newConfig);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Configuration updated', { reason });
		} finally {
			release();
		}
	}

	async patchConfig(patch: Partial<SingBoxConfig>, reason = 'api-patch'): Promise<SingBoxConfig> {
		const release = await this.acquireLock();

		try {
			const currentConfig = await this.getConfig();
			const merged = this.deepMerge(currentConfig, patch);

			const validation = await this.validateConfig(merged);
			if (!validation.valid) {
				throw new ConfigValidationError(
					validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
				);
			}

			if (config.configApi.backupEnabled) {
				const currentContent = await this.getConfigRaw();
				if (currentContent) {
					await backupService.create(currentContent, reason);
				}
			}

			await this.atomicWrite(merged);

			if (config.configApi.autoReload) {
				await this.reloadIfRunning();
			}

			logger.info('Configuration patched', { reason });
			return merged;
		} finally {
			release();
		}
	}

	async validateConfig(configToValidate: unknown): Promise<ValidationResult> {
		if (configToValidate === null || configToValidate === undefined) {
			return {
				valid: false,
				errors: [
					{
						path: '',
						message: 'Configuration cannot be null or undefined',
						code: 'INVALID_TYPE',
					},
				],
			};
		}

		if (typeof configToValidate !== 'object') {
			return {
				valid: false,
				errors: [
					{
						path: '',
						message: 'Configuration must be an object',
						code: 'INVALID_TYPE',
					},
				],
			};
		}

		return this.validateWithSingbox(configToValidate as SingBoxConfig);
	}

	invalidateCache(): void {
		this.configCache = null;
	}

	protected async getConfigRaw(): Promise<string | null> {
		const file = Bun.file(this.configPath);
		if (!(await file.exists())) {
			return null;
		}
		return file.text();
	}

	protected async validateWithSingbox(configToValidate: SingBoxConfig): Promise<ValidationResult> {
		const tempPath = join(dirname(this.configPath), `.config-validate-${crypto.randomUUID()}.json`);

		try {
			await Bun.write(tempPath, JSON.stringify(configToValidate, null, 2));

			const proc = spawn({
				cmd: [this.binary, 'check', '-c', tempPath],
				stdout: 'pipe',
				stderr: 'pipe',
			});

			const stderr = await new Response(proc.stderr).text();
			const exitCode = await proc.exited;

			if (exitCode !== 0) {
				const errorMatch = stderr.match(/decode config.*?: (.+)/);
				const errorMessage = errorMatch ? errorMatch[1] : stderr.trim();

				return {
					valid: false,
					errors: [
						{
							path: '',
							message: errorMessage || 'Invalid configuration',
							code: 'SINGBOX_VALIDATION_ERROR',
						},
					],
				};
			}

			return { valid: true, errors: [] };
		} finally {
			try {
				const file = Bun.file(tempPath);
				if (await file.exists()) {
					await file.unlink();
				}
			} catch (error) {
				logger.debug('Failed to cleanup temp validation file', {
					tempPath,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	protected async atomicWrite(configToWrite: SingBoxConfig): Promise<void> {
		const tempPath = `${this.configPath}.${crypto.randomUUID()}.tmp`;
		const content = JSON.stringify(configToWrite, null, 2);

		await Bun.write(tempPath, content);
		await rename(tempPath, this.configPath);
		this.configCache = configToWrite;
	}

	protected async reloadIfRunning(): Promise<void> {
		try {
			const status = await processService.getStatus();
			if (status.running) {
				await processService.reload();
				logger.info('sing-box reloaded after config update');
			}
		} catch (error) {
			logger.warn('Failed to reload sing-box', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	protected deepMerge(target: SingBoxConfig, source: Partial<SingBoxConfig>): SingBoxConfig {
		const result = { ...target } as Record<string, unknown>;

		for (const key of Object.keys(source) as (keyof SingBoxConfig)[]) {
			const sourceValue = source[key];
			const targetValue = result[key];

			if (
				sourceValue !== undefined &&
				typeof sourceValue === 'object' &&
				sourceValue !== null &&
				!Array.isArray(sourceValue) &&
				typeof targetValue === 'object' &&
				targetValue !== null &&
				!Array.isArray(targetValue)
			) {
				result[key] = this.deepMergeObject(
					targetValue as Record<string, unknown>,
					sourceValue as Record<string, unknown>,
				);
			} else if (sourceValue !== undefined) {
				result[key] = sourceValue;
			}
		}

		return result as SingBoxConfig;
	}

	protected deepMergeObject(
		target: Record<string, unknown>,
		source: Record<string, unknown>,
	): Record<string, unknown> {
		const result = { ...target };

		for (const key of Object.keys(source)) {
			const sourceValue = source[key];
			const targetValue = result[key];

			if (
				sourceValue !== undefined &&
				typeof sourceValue === 'object' &&
				sourceValue !== null &&
				!Array.isArray(sourceValue) &&
				typeof targetValue === 'object' &&
				targetValue !== null &&
				!Array.isArray(targetValue)
			) {
				result[key] = this.deepMergeObject(
					targetValue as Record<string, unknown>,
					sourceValue as Record<string, unknown>,
				);
			} else if (sourceValue !== undefined) {
				result[key] = sourceValue;
			}
		}

		return result;
	}

	protected compareConfigs(oldConfig: SingBoxConfig, newConfig: SingBoxConfig): ConfigChange[] {
		const changes: ConfigChange[] = [];

		const allKeys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);

		for (const key of allKeys) {
			const oldValue = oldConfig[key as keyof SingBoxConfig];
			const newValue = newConfig[key as keyof SingBoxConfig];

			if (oldValue === undefined && newValue !== undefined) {
				changes.push({ type: 'added', path: key, newValue });
			} else if (oldValue !== undefined && newValue === undefined) {
				changes.push({ type: 'removed', path: key, oldValue });
			} else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
				changes.push({ type: 'modified', path: key, oldValue, newValue });
			}
		}

		return changes;
	}

	protected async acquireLock(): Promise<() => void> {
		return this.rwlock.acquireWrite();
	}

	protected async acquireReadLock(): Promise<() => void> {
		return this.rwlock.acquireRead();
	}
}
