/**
 * Feature Error Handlers
 * Handles errors for feature-disabled scenarios
 */

import { featureLogger } from '../services/featureLogger.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * Feature error types
 */
export type FeatureErrorType =
	| 'feature_disabled'
	| 'auth_required'
	| 'data_access_denied'
	| 'invalid_input'
	| 'internal_error';

/**
 * Feature error response
 */
export interface FeatureErrorResponse {
	error: string;
	errorType: FeatureErrorType;
	feature: 'errorBrain' | 'legalAi' | null;
	status: number;
	timestamp: string;
	details?: Record<string, unknown>;
}

/**
 * Feature error class
 */
export class FeatureError extends Error {
	constructor(
		public errorType: FeatureErrorType,
		public feature: 'errorBrain' | 'legalAi' | null,
		public status: number,
		message: string,
		public details?: Record<string, unknown>
	) {
		super(message);
		this.name = 'FeatureError';
	}

	toResponse(): FeatureErrorResponse {
		return {
			error: this.message,
			errorType: this.errorType,
			feature: this.feature,
			status: this.status,
			timestamp: new Date().toISOString(),
			details: this.details
		};
	}
}

/**
 * Error handler for feature-disabled scenarios
 */
export class FeatureErrorHandler {
	/**
	 * Handle feature disabled error
	 */
	static handleFeatureDisabled(
		feature: 'errorBrain' | 'legalAi',
		userId?: string
	): FeatureErrorResponse {
		const status = feature === 'errorBrain' ? 403 : 503;
		const message =
			feature === 'errorBrain'
				? 'Error-Brain feature is not available in this environment'
				: 'Legal-AI feature is not available in this environment';

		// Log the error
		if (feature === 'errorBrain') {
			featureLogger.logErrorBrain({
				timestamp: new Date(),
				operation: 'feature_disabled_error',
				userId,
				details: { status, message },
	level: 'warn'
			});
		} else {
			featureLogger.logLegalAi({
				timestamp: new Date(),
				operation: 'feature_disabled_error',
				userId,
				details: { status, message },
	level: 'warn'
			});
		}

		return {
			error: message,
			errorType: 'feature_disabled',
			feature,
			status,
			timestamp: new Date().toISOString()
		};
	}

	/**
	 * Handle authentication required error
	 */
	static handleAuthRequired(
		feature: 'errorBrain' | 'legalAi',
		userId?: string
	): FeatureErrorResponse {
		const authType = feature === 'errorBrain' ? 'development' : 'production';
		const message = `${authType} authentication is required for this feature`;

		if (feature === 'errorBrain') {
			featureLogger.logErrorBrain({
				timestamp: new Date(),
				operation: 'auth_required_error',
				userId,
				details: { authType, message },
	level: 'warn'
			});
		} else {
			featureLogger.logLegalAi({
				timestamp: new Date(),
				operation: 'auth_required_error',
				userId,
				details: { authType, message },
	level: 'warn'
			});
		}

		return {
			error: message,
			errorType: 'auth_required',
			feature,
			status: 401,
			timestamp: new Date().toISOString()
		};
	}

	/**
	 * Handle data access denied error
	 */
	static handleDataAccessDenied(
		feature: 'errorBrain' | 'legalAi',
		userId?: string,
		table?: string
	): FeatureErrorResponse {
		const message = `Access to ${table ?? 'data'} is denied for this feature`;

		if (feature === 'errorBrain') {
			featureLogger.logErrorBrain({
				timestamp: new Date(),
				operation: 'data_access_denied_error',
				userId,
				details: { table, message },
	level: 'warn'
			});
		} else {
			featureLogger.logLegalAi({
				timestamp: new Date(),
				operation: 'data_access_denied_error',
				userId,
				details: { table, message },
	level: 'warn'
			});
		}

		return {
			error: message,
			errorType: 'data_access_denied',
			feature,
			status: 403,
			timestamp: new Date().toISOString()
		};
	}

	/**
	 * Handle invalid input error
	 */
	static handleInvalidInput(
		feature: 'errorBrain' | 'legalAi',
		userId?: string,
		details?: Record<string, unknown>
	): FeatureErrorResponse {
		const message = 'Invalid input provided';

		if (feature === 'errorBrain') {
			featureLogger.logErrorBrain({
				timestamp: new Date(),
				operation: 'invalid_input_error',
				userId,
				details: { ...details, message },
	level: 'warn'
			});
		} else {
			featureLogger.logLegalAi({
				timestamp: new Date(),
				operation: 'invalid_input_error',
				userId,
				details: { ...details, message },
	level: 'warn'
			});
		}

		return {
			error: message,
			errorType: 'invalid_input',
			feature,
			status: 400,
			timestamp: new Date().toISOString(),
			details
		};
	}

	/**
	 * Handle internal error
	 */
	static handleInternalError(
		feature: 'errorBrain' | 'legalAi',
		error: Error,
		userId?: string
	): FeatureErrorResponse {
		const message = 'An internal error occurred';

		if (feature === 'errorBrain') {
			featureLogger.logErrorBrain({
				timestamp: new Date(),
				operation: 'internal_error',
				userId,
				details: {
	errorMessage: error.message, stack: error.stack },
	level: 'error'
			});
		} else {
			featureLogger.logLegalAi({
				timestamp: new Date(),
				operation: 'internal_error',
				userId,
				details: {
	errorMessage: error.message, stack: error.stack },
	level: 'error'
			});
		}

		return {
			error: message,
			errorType: 'internal_error',
			feature,
			status: 500,
			timestamp: new Date().toISOString()
		};
	}

	/**
	 * Create FeatureError from response
	 */
	static fromResponse(response: FeatureErrorResponse): FeatureError {
		return new FeatureError(
			response.errorType,
			response.feature,
			response.status,
			response.error,
			response.details
		);
	}
}

/**
 * Utility to wrap async handlers with feature error handling
 */
export function withFeatureErrorHandling<T>(
	feature: 'errorBrain' | 'legalAi',
	handler: () => Promise<T>,
	userId?: string
): Promise<T | FeatureErrorResponse> {
	return handler().catch((error) => {
		console.error(`Feature ${feature} error:`, error);
		return FeatureErrorHandler.handleInternalError(
			feature,
			error instanceof Error ? error : new Error(String(error)),
			userId
		);
	});
}
