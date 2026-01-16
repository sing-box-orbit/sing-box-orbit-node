const DANGEROUS_PATTERNS = [/[;&|`$(){}[\]<>\\]/g, /\.\./g, /\/etc\//gi, /\/proc\//gi, /\/dev\//gi];

const MAX_STRING_LENGTH = 10000;
const MAX_TAG_LENGTH = 256;
const MAX_PATH_LENGTH = 4096;

export function sanitizeString(value: string, maxLength = MAX_STRING_LENGTH): string {
	if (typeof value !== 'string') {
		return '';
	}
	return value.slice(0, maxLength).trim();
}

export function sanitizeTag(tag: string): string {
	if (typeof tag !== 'string') {
		return '';
	}
	return tag
		.slice(0, MAX_TAG_LENGTH)
		.replace(/[^a-zA-Z0-9_-]/g, '')
		.trim();
}

export function sanitizePath(path: string): string {
	if (typeof path !== 'string') {
		return '';
	}

	let sanitized = path.slice(0, MAX_PATH_LENGTH);

	for (const pattern of DANGEROUS_PATTERNS) {
		if (pattern.test(sanitized)) {
			sanitized = sanitized.replace(pattern, '');
		}
	}

	return sanitized.trim();
}

export function containsDangerousPatterns(value: string): boolean {
	if (typeof value !== 'string') {
		return false;
	}

	return DANGEROUS_PATTERNS.some((pattern) => pattern.test(value));
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
	if (typeof obj !== 'object' || obj === null) {
		return obj;
	}

	const result = { ...obj } as Record<string, unknown>;

	for (const key of Object.keys(result)) {
		const value = result[key];

		if (typeof value === 'string') {
			result[key] = sanitizeString(value);
		} else if (Array.isArray(value)) {
			result[key] = value.map((item) => {
				if (typeof item === 'string') {
					return sanitizeString(item);
				}
				if (typeof item === 'object' && item !== null) {
					return sanitizeObject(item as Record<string, unknown>);
				}
				return item;
			});
		} else if (typeof value === 'object' && value !== null) {
			result[key] = sanitizeObject(value as Record<string, unknown>);
		}
	}

	return result as T;
}

export function validateAndSanitizeConfig<T extends Record<string, unknown>>(
	config: T,
): {
	sanitized: T;
	warnings: string[];
} {
	const warnings: string[] = [];

	function processValue(value: unknown, path: string): unknown {
		if (typeof value === 'string') {
			if (containsDangerousPatterns(value)) {
				warnings.push(`Potentially dangerous pattern found in ${path}`);
			}
			return sanitizeString(value);
		}

		if (Array.isArray(value)) {
			return value.map((item, index) => processValue(item, `${path}[${index}]`));
		}

		if (typeof value === 'object' && value !== null) {
			const result: Record<string, unknown> = {};
			for (const key of Object.keys(value as Record<string, unknown>)) {
				result[key] = processValue(
					(value as Record<string, unknown>)[key],
					path ? `${path}.${key}` : key,
				);
			}
			return result;
		}

		return value;
	}

	const sanitized = processValue(config, '') as T;
	return { sanitized, warnings };
}
