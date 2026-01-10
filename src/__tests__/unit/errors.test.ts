import { describe, expect, test } from 'bun:test';
import {
	AppError,
	BadRequestError,
	ConfigValidationError,
	NotFoundError,
	ProcessError,
	UnauthorizedError,
} from '@/utils/errors';

describe('Error Classes', () => {
	describe('AppError', () => {
		test('should create error with default status code 500', () => {
			const error = new AppError('Something went wrong');

			expect(error.message).toBe('Something went wrong');
			expect(error.statusCode).toBe(500);
			expect(error.code).toBeUndefined();
			expect(error.name).toBe('AppError');
		});

		test('should create error with custom status code', () => {
			const error = new AppError('Custom error', 418);

			expect(error.statusCode).toBe(418);
		});

		test('should create error with custom code', () => {
			const error = new AppError('Custom error', 500, 'CUSTOM_CODE');

			expect(error.code).toBe('CUSTOM_CODE');
		});

		test('should be instance of Error', () => {
			const error = new AppError('Test');

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(AppError);
		});
	});

	describe('UnauthorizedError', () => {
		test('should create with default message', () => {
			const error = new UnauthorizedError();

			expect(error.message).toBe('Unauthorized');
			expect(error.statusCode).toBe(401);
			expect(error.code).toBe('UNAUTHORIZED');
			expect(error.name).toBe('UnauthorizedError');
		});

		test('should create with custom message', () => {
			const error = new UnauthorizedError('Invalid token');

			expect(error.message).toBe('Invalid token');
			expect(error.statusCode).toBe(401);
		});

		test('should be instance of AppError', () => {
			const error = new UnauthorizedError();

			expect(error).toBeInstanceOf(AppError);
			expect(error).toBeInstanceOf(UnauthorizedError);
		});
	});

	describe('NotFoundError', () => {
		test('should create with default message', () => {
			const error = new NotFoundError();

			expect(error.message).toBe('Not found');
			expect(error.statusCode).toBe(404);
			expect(error.code).toBe('NOT_FOUND');
			expect(error.name).toBe('NotFoundError');
		});

		test('should create with custom message', () => {
			const error = new NotFoundError('User not found');

			expect(error.message).toBe('User not found');
		});

		test('should be instance of AppError', () => {
			const error = new NotFoundError();

			expect(error).toBeInstanceOf(AppError);
		});
	});

	describe('BadRequestError', () => {
		test('should create with default message', () => {
			const error = new BadRequestError();

			expect(error.message).toBe('Bad request');
			expect(error.statusCode).toBe(400);
			expect(error.code).toBe('BAD_REQUEST');
			expect(error.name).toBe('BadRequestError');
		});

		test('should create with custom message', () => {
			const error = new BadRequestError('Invalid input');

			expect(error.message).toBe('Invalid input');
		});

		test('should be instance of AppError', () => {
			const error = new BadRequestError();

			expect(error).toBeInstanceOf(AppError);
		});
	});

	describe('ProcessError', () => {
		test('should create with message', () => {
			const error = new ProcessError('Process failed to start');

			expect(error.message).toBe('Process failed to start');
			expect(error.statusCode).toBe(500);
			expect(error.code).toBe('PROCESS_ERROR');
			expect(error.name).toBe('ProcessError');
		});

		test('should be instance of AppError', () => {
			const error = new ProcessError('Test');

			expect(error).toBeInstanceOf(AppError);
		});
	});

	describe('ConfigValidationError', () => {
		test('should create with message', () => {
			const error = new ConfigValidationError('Invalid config format');

			expect(error.message).toBe('Invalid config format');
			expect(error.statusCode).toBe(400);
			expect(error.code).toBe('CONFIG_VALIDATION_ERROR');
			expect(error.name).toBe('ConfigValidationError');
		});

		test('should be instance of AppError', () => {
			const error = new ConfigValidationError('Test');

			expect(error).toBeInstanceOf(AppError);
		});
	});
});
