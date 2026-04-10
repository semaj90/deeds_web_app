/**
 * Custom Error Classes for Legal AI Platform
 * Provides structured, actionable error handling with status codes and error codes
 * for consistent front-end messaging and debugging
 *
 * Layer contract:
 *   - Routes use SvelteKit error()/redirect()/json()
 *   - Services/middleware throw HttpServiceError subclasses
 *   - GPU/analysis throw plain Errors (no HTTP concerns)
 */

/**
 * Base HTTP service error — used by ALL service-layer error classes.
 * Routes catch these and translate to SvelteKit responses.
 * NO SvelteKit imports allowed in this file.
 */
export class HttpServiceError extends Error {
	status: number;
	code: string;
	context?: Record<string, unknown>;

	constructor(message: string, code: string, status: number, context?: Record<string, unknown>) {
		super(message);
		this.name = new.target.name;
		this.code = code;
		this.status = status;
		this.context = context;
	}

	toJSON() {
		return {
			error: this.message,
			code: this.code,
			status: this.status,
			context: this.context
		};
	}
}

export class UnauthorizedError extends HttpServiceError {
	constructor(message = 'Authentication required', context?: Record<string, unknown>) {
		super(message, 'UNAUTHORIZED', 401, context);
	}
}

export class ForbiddenError extends HttpServiceError {
	constructor(message = 'Insufficient permissions', context?: Record<string, unknown>) {
		super(message, 'FORBIDDEN', 403, context);
	}
}

export class NotFoundError extends HttpServiceError {
	constructor(message = 'Resource not found', context?: Record<string, unknown>) {
		super(message, 'NOT_FOUND', 404, context);
	}
}

export class ServiceUnavailableError extends HttpServiceError {
	constructor(message = 'Service unavailable', context?: Record<string, unknown>) {
		super(message, 'SERVICE_UNAVAILABLE', 503, context);
	}
}

export function isHttpServiceError(error: unknown): error is HttpServiceError {
	return error instanceof HttpServiceError;
}

/**
 * Base authentication error class
 * All auth-related errors inherit from this for consistent handling
 */
export class AuthError extends Error {
    code: string;
	status: number;
    context?: Record<string, unknown>;

    constructor(
        message: string,
        code: string = 'AUTH_ERROR',
        status: number = 401,
        context?: Record<string, unknown>
    ) {
        super(message);
        this.code = code;
        this.status = status;
        this.context = context;
        this.name = 'AuthError';
        Object.setPrototypeOf(this, AuthError.prototype);
    }

    toJSON() {
        return {
            message: this.message,
            code: this.code,
            status: this.status,
            context: this.context,
        };
    }
}

/**
 * Registration-specific errors
 * Thrown during user account creation
 */
export class RegistrationError extends AuthError {
    constructor(
        message: string,
        code: string = 'REGISTRATION_ERROR',
        context?: Record<string, unknown>
    ) {
        super(message, code, 400, context);
        this.name = 'RegistrationError';
        Object.setPrototypeOf(this, RegistrationError.prototype);
    }
}

/**
 * Session-specific errors
 * Thrown during session creation, validation, or invalidation
 */
export class SessionError extends AuthError {
    constructor(message: string, code: string = 'SESSION_ERROR', context?: Record<string, unknown>) {
        super(message, code, 401, context);
        this.name = 'SessionError';
        Object.setPrototypeOf(this, SessionError.prototype);
    }
}

/**
 * Login-specific errors
 * Thrown during authentication attempt
 */
export class LoginError extends AuthError {
    constructor(message: string, code: string = 'LOGIN_ERROR', context?: Record<string, unknown>) {
        super(message, code, 401, context);
        this.name = 'LoginError';
        Object.setPrototypeOf(this, LoginError.prototype);
    }
}

/**
 * Password-related errors
 * Thrown during password validation or change operations
 */
export class PasswordError extends AuthError {
    constructor(message: string, code: string = 'PASSWORD_ERROR', context?: Record<string, unknown>) {
        super(message, code, 400, context);
        this.name = 'PasswordError';
        Object.setPrototypeOf(this, PasswordError.prototype);
    }
}

/**
 * Profile update errors
 * Thrown during user profile modifications
 */
export class ProfileError extends AuthError {
    constructor(message: string, code: string = 'PROFILE_ERROR', context?: Record<string, unknown>) {
        super(message, code, 400, context);
        this.name = 'ProfileError';
        Object.setPrototypeOf(this, ProfileError.prototype);
    }
}

/**
 * Microservice integration errors
 * Thrown when Go microservice calls fail
 */
export class MicroserviceError extends AuthError {
    constructor(
        message: string,
        code: string = 'MICROSERVICE_ERROR',
        context?: Record<string, unknown>
    ) {
        super(message, code, 502, context);
        this.name = 'MicroserviceError';
        Object.setPrototypeOf(this, MicroserviceError.prototype);
    }
}

/**
 * Helper function to determine if an error is an AuthError
 */
export function isAuthError(error: any): error is AuthError {
    return error instanceof AuthError;
}

/**
 * Helper function to format errors for API responses
 */
export function formatErrorResponse(error: any) {
    if (isAuthError(error)) {
        return {
            success: false,
            error: {
	message: error.message,
                code: error.code,
                status: error.status,
                ...(error.context && { context: error.context }),
            },
	};
    }
    // Handle unknown errors gracefully
    return {
        success: false,
        error: {
	message: 'An unexpected error occurred',
            code: 'UNKNOWN_ERROR',
            status: 500,
        },
	};
}

/**
 * Error codes for common scenarios
 */
export const ERROR_CODES = {
    // Registration
    EMAIL_TAKEN: 'EMAIL_TAKEN',
    INVALID_EMAIL: 'INVALID_EMAIL',
    WEAK_PASSWORD: 'WEAK_PASSWORD',
    REGISTRATION_FAILED: 'REGISTRATION_FAILED',

    // Login
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
    LOGIN_FAILED: 'LOGIN_FAILED',

    // Session
    SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
    SESSION_EXPIRED: 'SESSION_EXPIRED',
    SESSION_INVALID: 'SESSION_INVALID',
    SESSION_ERROR: 'SESSION_ERROR',
    AUTH_REQUIRED: 'AUTH_REQUIRED',

    // Password
    PASSWORD_MISMATCH: 'PASSWORD_MISMATCH',
    PASSWORD_CHANGE_FAILED: 'PASSWORD_CHANGE_FAILED',
    CURRENT_PASSWORD_INCORRECT: 'CURRENT_PASSWORD_INCORRECT',

    // Profile
    PROFILE_UPDATE_FAILED: 'PROFILE_UPDATE_FAILED',
    USER_NOT_FOUND: 'USER_NOT_FOUND',

    // Microservice
    CASE_SERVICE_UNAVAILABLE: 'CASE_SERVICE_UNAVAILABLE',
    CASE_NOT_FOUND: 'CASE_NOT_FOUND',
    DOCUMENT_SERVICE_UNAVAILABLE: 'DOCUMENT_SERVICE_UNAVAILABLE',

    // Database
    DB_ERROR: 'DB_ERROR',
    DB_CONNECTION_FAILED: 'DB_CONNECTION_FAILED',

    // HTTP service errors
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

    // Generic
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;
