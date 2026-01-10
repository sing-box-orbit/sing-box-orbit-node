export class AppError extends Error {
	constructor(
		message: string,
		public statusCode = 500,
		public code?: string,
	) {
		super(message);
		this.name = 'AppError';
	}
}

export class UnauthorizedError extends AppError {
	constructor(message = 'Unauthorized') {
		super(message, 401, 'UNAUTHORIZED');
		this.name = 'UnauthorizedError';
	}
}

export class NotFoundError extends AppError {
	constructor(message = 'Not found') {
		super(message, 404, 'NOT_FOUND');
		this.name = 'NotFoundError';
	}
}

export class BadRequestError extends AppError {
	constructor(message = 'Bad request') {
		super(message, 400, 'BAD_REQUEST');
		this.name = 'BadRequestError';
	}
}

export class ProcessError extends AppError {
	constructor(message: string) {
		super(message, 500, 'PROCESS_ERROR');
		this.name = 'ProcessError';
	}
}

export class ConfigValidationError extends AppError {
	constructor(message: string) {
		super(message, 400, 'CONFIG_VALIDATION_ERROR');
		this.name = 'ConfigValidationError';
	}
}
