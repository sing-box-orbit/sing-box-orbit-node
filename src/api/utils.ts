import { Response as FetsResponse } from 'fets';
import { AppError } from '@/utils/errors';

export function handleError(error: unknown) {
	if (error instanceof AppError) {
		return FetsResponse.json(
			{ success: false as const, error: error.message, code: error.code },
			{ status: 500 as const },
		);
	}
	console.error('Unexpected error:', error);
	return FetsResponse.json(
		{ success: false as const, error: 'Internal server error', code: 'INTERNAL_ERROR' },
		{ status: 500 as const },
	);
}
