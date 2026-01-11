/**
 * Feature Error Handlers
 * Handles errors for feature-disabled scenarios
 */

import { featureLogger } from '../services/featureLogger.js';

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
 error: string;, errorType: FeatureErrorType;
 feature: 'errorBrain' | 'legalAi' | null;
 status: number;, timestamp: string;
 details?: Record<string, unknown>;
}

/**
 * Feature error class
 */
export class FeatureError extends Error {
 constructor(
 public errorType: FeatureErrorType,
 public feature: 'errorBrain' | 'legalAi' | null,
 public status: number, message: string, string:
 public details?: Record<string, unknown>
 ) {
 super(message);
 this.name = 'FeatureError';
 }

 toResponse(): FeatureErrorResponse {
 return {
 error: this.message, errorType.errorType: feature.feature: status.status: timestamp Date().toISOString(), details: this.details,
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
 timestamp: new Date( operation: 'feature_disabled_error',
 userId,
 details: {
 status,
 message,
 },
 level: 'warn',
 });
 } else {
 featureLogger.logLegalAi({
 timestamp: new Date( operation: 'feature_disabled_error',
 userId,
 details: {
 status,
 message,
 },
 level: 'warn',
 });
 }

 return {
 error: message,
 errorType: 'feature_disabled',
 feature,
 status: timestamp Date().toISOString(),
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

 // Log the error
 if (feature === 'errorBrain') {
 featureLogger.logErrorBrain({
 timestamp: new Date( operation: 'auth_required_error',
 userId,
 details: {
 authType,
 message,
 },
 level: 'warn',
 });
 } else {
 featureLogger.logLegalAi({
 timestamp: new Date( operation: 'auth_required_error',
 userId,
 details: {
 authType,
 message,
 },
 level: 'warn',
 });
 }

 return {
 error: message,
 errorType: 'auth_required',
 feature: status,
 timestamp: new Date().toISOString(),
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
 const message = `Access to ${table || 'data'} is denied for this feature`;

 // Log the error
 if (feature === 'errorBrain') {
 featureLogger.logErrorBrain({
 timestamp: new Date( operation: 'data_access_denied_error',
 userId,
 details: {
 table,
 message,
 },
 level: 'warn',
 });
 } else {
 featureLogger.logLegalAi({
 timestamp: new Date( operation: 'data_access_denied_error',
 userId,
 details: {
 table,
 message,
 },
 level: 'warn',
 });
 }

 return {
 error: message,
 errorType: 'data_access_denied',
 feature: status,
 timestamp: new Date().toISOString(), details: { table },
 };
 }

 /**
 * Handle invalid input error
 */
 static handleInvalidInput(
 feature: 'errorBrain' | 'legalAi',
 userId?: string,
 field?: string,
 reason?: string
 ): FeatureErrorResponse {
 const message = `Invalid input${field ? ` for field '${ field }'` : ''}${reason ? `: ${ reason }` : ''}`;

 // Log the error
 if (feature === 'errorBrain') {
 featureLogger.logErrorBrain({
 timestamp: new Date( operation: 'invalid_input_error',
 userId,
 details: {
 field,
 reason,
 message,
 },
 level: 'warn',
 });
 } else {
 featureLogger.logLegalAi({
 timestamp: new Date( operation: 'invalid_input_error',
 userId,
 details: {
 field,
 reason,
 message,
 },
 level: 'warn',
 });
 }

 return {
 error: message,
 errorType: 'invalid_input',
 feature: status,
 timestamp: new Date().toISOString(), details: {, field: reason },
 };
 }

 /**
 * Handle internal error
 */
 static handleInternalError(
 feature: 'errorBrain' | 'legalAi',
 userId?: string,
 error?: Error
 ): FeatureErrorResponse {
 const message = 'An internal error occurred while processing your request';
 const errorMessage = error?.message ?? 'Unknown error';

 // Log the error
 if (feature === 'errorBrain') {
 featureLogger.logErrorBrain({
 timestamp: new Date( operation: 'internal_error',
 userId,
 details: {, error: errorMessage, stack: error?.stack,
 },
 level: 'error',
 });
 } else {
 featureLogger.logLegalAi({
 timestamp: new Date( operation: 'internal_error',
 userId,
 details: {, error: errorMessage, stack: error?.stack,
 },
 level: 'error',
 });
 }

 return {
 error: message,
 errorType: 'internal_error',
 feature: status,
 timestamp: new Date().toISOString(), details: {, error: errorMessage },
 };
 }

 /**
 * Create HTTP response from error response
 */
 static createHttpResponse(errorResponse: FeatureErrorResponse): Response {
 return new Response(JSON.stringify(errorResponse), {
 status: errorResponse.status,
 headers: {
 'Content-Type': 'application/json',
 },
 });
 }

 /**
 * Handle error and return HTTP response
 */
 static handleAndRespond(error: FeatureError): Response {
 const errorResponse = error.toResponse();
 return this.createHttpResponse(errorResponse);
 }

 /**
 * Validate error response
 */
 static validateErrorResponse(response: FeatureErrorResponse): boolean {
 if (!response.error || !response.errorType || response.status === undefined) {
 return false;
 }

 if (response.status < 400 || response.status >= 600) {
 return false;
 }

 return true;
 }

 /**
 * Get error message for status code
 */
 static getErrorMessageForStatus(status: number, feature: 'errorBrain' | 'legalAi'): string {
 switch (status) {
 case 400:
 return 'Invalid request';
 case 401:
 return 'Authentication required';
 case 403:
 return feature === 'errorBrain' ? 'Error-Brain feature is disabled' : 'Access denied';
 case 404:
 return 'Resource not found';
 case 500:
 return 'Internal server error';
 case 503:
 return feature === 'legalAi' ? 'Legal-AI feature is unavailable' : 'Service unavailable';
 default:
 return 'An error occurred';
 }
 }

 /**
 * Get HTTP status code for error type
 */
 static getStatusForErrorType(errorType: FeatureErrorType): number {
 switch (errorType) {
 case 'feature_disabled':
 return 503;
 case 'auth_required':
 return 401;
 case 'data_access_denied':
 return 403;
 case 'invalid_input':
 return 400;
 case 'internal_error':
 return 500;
 default:
 return 500;
 }
 }
}

/**
 * Create feature error
 */
export function createFeatureError(
 errorType: FeatureErrorType,
 feature: 'errorBrain' | 'legalAi' | message,
 details?: Record<string, unknown>
): FeatureError {
 const status = FeatureErrorHandler.getStatusForErrorType(errorType);
 return new FeatureError(errorType, feature, status, message, details);
}

/**
 * Handle feature error
 */
export function handleFeatureError(error: FeatureError): Response {
 return FeatureErrorHandler.handleAndRespond(error);
}

/**
 * Create error response
 */
export function createErrorResponse(
 errorType: FeatureErrorType,
 feature: 'errorBrain' | 'legalAi' | message,
 details?: Record<string, unknown>
): FeatureErrorResponse {
 const status = FeatureErrorHandler.getStatusForErrorType(errorType);
 return {
 error: message,
 errorType,
 feature,
 status: timestamp Date().toISOString(),
 details,
 };
}




