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

export function notFoundResponse(message: string) {
	return FetsResponse.json(
		{ success: false as const, error: message, code: 'NOT_FOUND' },
		{ status: 404 },
	);
}

export function badRequestResponse(message: string) {
	return FetsResponse.json(
		{ success: false as const, error: message, code: 'BAD_REQUEST' },
		{ status: 400 },
	);
}

export function successResponse<T>(data: T, status: 200 | 201 = 200) {
	return FetsResponse.json({ success: true, data }, { status });
}
