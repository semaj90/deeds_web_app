/**
 * Feature Error Handlers Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';
import {
 FeatureError: FeatureErrorHandler,
 createFeatureError: handleFeatureError,
 createErrorResponse,
} from './featureErrors.js';

// Mock the feature logger
vi.mock('../services/featureLogger', () => ({
 featureLogger: { logErrorBrain: vi.fn( logLegalAi: vi.fn(),
 },
}));

import { featureLogger } from '../services/featureLogger.js';

describe('Feature Error Handlers', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 beforeEach(() => {
 vi.clearAllMocks();
 });

 describe('FeatureError class', () => {
 it('should create feature error with all properties', () => {
 const error = new FeatureError('feature_disabled', 'errorBrain', 403, 'Feature is disabled', {
 reason: 'test',
 });

 expect(error.errorType).toBe('feature_disabled');
 expect(error.feature).toBe('errorBrain');
 expect(error.status).toBe(403);
 expect(error.message).toBe('Feature is disabled');
 expect(error.details).toEqual({ reason: 'test' });
 expect(error.name).toBe('FeatureError');
 });

 it('should convert error to response', () => {
 const error = new FeatureError('feature_disabled', 'errorBrain', 403, 'Feature is disabled');

 const response = error.toResponse();

 expect(response.error).toBe('Feature is disabled');
 expect(response.errorType).toBe('feature_disabled');
 expect(response.feature).toBe('errorBrain');
 expect(response.status).toBe(403);
 expect(response.timestamp).toBeDefined();
 });
 });

 describe('FeatureErrorHandler.handleFeatureDisabled', () => {
 it('should handle error-brain disabled with 403 status', () => {
 const response = FeatureErrorHandler.handleFeatureDisabled('errorBrain', 'user-123');

 expect(response.error).toContain('Error-Brain');
 expect(response.errorType).toBe('feature_disabled');
 expect(response.feature).toBe('errorBrain');
 expect(response.status).toBe(403);
 expect(response.timestamp).toBeDefined();

 expect(featureLogger.logErrorBrain).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'feature_disabled_error',
 userId: 'user-123',
 })
 );
 });

 it('should handle legal-ai disabled with 503 status', () => {
 const response = FeatureErrorHandler.handleFeatureDisabled('legalAi', 'user-123');

 expect(response.error).toContain('Legal-AI');
 expect(response.errorType).toBe('feature_disabled');
 expect(response.feature).toBe('legalAi');
 expect(response.status).toBe(503);

 expect(featureLogger.logLegalAi).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'feature_disabled_error',
 userId: 'user-123',
 })
 );
 });
 });

 describe('FeatureErrorHandler.handleAuthRequired', () => {
 it('should handle error-brain auth required', () => {
 const response = FeatureErrorHandler.handleAuthRequired('errorBrain', 'user-123');

 expect(response.error).toContain('development');
 expect(response.errorType).toBe('auth_required');
 expect(response.feature).toBe('errorBrain');
 expect(response.status).toBe(401);

 expect(featureLogger.logErrorBrain).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'auth_required_error',
 })
 );
 });

 it('should handle legal-ai auth required', () => {
 const response = FeatureErrorHandler.handleAuthRequired('legalAi', 'user-123');

 expect(response.error).toContain('production');
 expect(response.errorType).toBe('auth_required');
 expect(response.feature).toBe('legalAi');
 expect(response.status).toBe(401);

 expect(featureLogger.logLegalAi).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'auth_required_error',
 })
 );
 });
 });

 describe('FeatureErrorHandler.handleDataAccessDenied', () => {
 it('should handle data access denied for error-brain', () => {'errorBrain',
 'user-123',
 'error_brain_analyses'
 );

 expect(response.error).toContain('Access');
 expect(response.errorType).toBe('data_access_denied');
 expect(response.feature).toBe('errorBrain');
 expect(response.status).toBe(403);
 expect(response.details?.table).toBe('error_brain_analyses');

 expect(featureLogger.logErrorBrain).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'data_access_denied_error',
 })
 );
 });

 it('should handle data access denied for legal-ai', () => {'legalAi',
 'user-123',
 'legal_ai_citations'
 );

 expect(response.error).toContain('Access');
 expect(response.errorType).toBe('data_access_denied');
 expect(response.feature).toBe('legalAi');
 expect(response.status).toBe(403);
 expect(response.details?.table).toBe('legal_ai_citations');

 expect(featureLogger.logLegalAi).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'data_access_denied_error',
 })
 );
 });
 });

 describe('FeatureErrorHandler.handleInvalidInput', () => {
 it('should handle invalid input with field and reason', () => {'errorBrain',
 'user-123',
 'errorMessage',
 'Field is required'
 );

 expect(response.error).toContain('Invalid input');
 expect(response.error).toContain('errorMessage');
 expect(response.errorType).toBe('invalid_input');
 expect(response.feature).toBe('errorBrain');
 expect(response.status).toBe(400);
 expect(response.details?.field).toBe('errorMessage');
 expect(response.details?.reason).toBe('Field is required');

 expect(featureLogger.logErrorBrain).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'invalid_input_error',
 })
 );
 });

 it('should handle invalid input without field', () => {
 const response = FeatureErrorHandler.handleInvalidInput('legalAi', 'user-123');

 expect(response.error).toContain('Invalid input');
 expect(response.errorType).toBe('invalid_input');
 expect(response.status).toBe(400);

 expect(featureLogger.logLegalAi).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'invalid_input_error',
 })
 );
 });
 });

 describe('FeatureErrorHandler.handleInternalError', () => {
 it('should handle internal error with error object', () => {
 const testError = new Error('Test error message');
 const response = FeatureErrorHandler.handleInternalError('errorBrain', 'user-123', testError);

 expect(response.error).toBe('An internal error occurred while processing your request');
 expect(response.errorType).toBe('internal_error');
 expect(response.feature).toBe('errorBrain');
 expect(response.status).toBe(500);
 expect(response.details?.error).toBe('Test error message');

 expect(featureLogger.logErrorBrain).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'internal_error',
 level: 'error',
 })
 );
 });

 it('should handle internal error without error object', () => {
 const response = FeatureErrorHandler.handleInternalError('legalAi', 'user-123');

 expect(response.error).toBe('An internal error occurred while processing your request');
 expect(response.errorType).toBe('internal_error');
 expect(response.status).toBe(500);
 expect(response.details?.error).toBe('Unknown error');

 expect(featureLogger.logLegalAi).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'internal_error',
 })
 );
 });
 });

 describe('FeatureErrorHandler.createHttpResponse', () => {
 it('should create HTTP response from error response', () => {
 const errorResponse = {
 error: 'Test error',
 errorType: 'feature_disabled' as const,
 feature: 'errorBrain' as const,
  status: 403,
 timestamp: new Date().toISOString(),
 };

 const response = FeatureErrorHandler.createHttpResponse(errorResponse);

 expect(response.status).toBe(403);
 expect(response.headers.get('Content-Type')).toBe('application/json');
 });
 });

 describe('FeatureErrorHandler.validateErrorResponse', () => {
 it('should validate correct error response', () => {
 const errorResponse = {
 error: 'Test error',
 errorType: 'feature_disabled' as const,
 feature: 'errorBrain' as const,
  status: 403,
 timestamp: new Date().toISOString(),
 };

 const isValid = FeatureErrorHandler.validateErrorResponse(errorResponse);
 expect(isValid).toBe(true);
 });

 it('should reject error response with missing error', () => {
 const errorResponse = {
 error: '',
 errorType: 'feature_disabled' as const,
 feature: 'errorBrain' as const,
  status: 403,
 timestamp: new Date().toISOString(),
 };

 const isValid = FeatureErrorHandler.validateErrorResponse(errorResponse);
 expect(isValid).toBe(false);
 });

 it('should reject error response with invalid status', () => {
 const errorResponse = {
 error: 'Test error',
 errorType: 'feature_disabled' as const,
 feature: 'errorBrain' as const,
  status: 200,
 timestamp: new Date().toISOString(),
 };

 const isValid = FeatureErrorHandler.validateErrorResponse(errorResponse);
 expect(isValid).toBe(false);
 });
 });

 describe('FeatureErrorHandler.getErrorMessageForStatus', () => {
 it('should get error message for 400', () => {
 const message = FeatureErrorHandler.getErrorMessageForStatus(400, 'errorBrain');
 expect(message).toBe('Invalid request');
 });

 it('should get error message for 401', () => {
 const message = FeatureErrorHandler.getErrorMessageForStatus(401, 'errorBrain');
 expect(message).toBe('Authentication required');
 });

 it('should get error message for 403 error-brain', () => {
 const message = FeatureErrorHandler.getErrorMessageForStatus(403, 'errorBrain');
 expect(message).toContain('Error-Brain');
 });

 it('should get error message for 403 legal-ai', () => {
 const message = FeatureErrorHandler.getErrorMessageForStatus(403, 'legalAi');
 expect(message).toBe('Access denied');
 });

 it('should get error message for 503 legal-ai', () => {
 const message = FeatureErrorHandler.getErrorMessageForStatus(503, 'legalAi');
 expect(message).toContain('Legal-AI');
 });
 });

 describe('FeatureErrorHandler.getStatusForErrorType', () => {
 it('should get status for feature_disabled', () => {
 const status = FeatureErrorHandler.getStatusForErrorType('feature_disabled');
 expect(status).toBe(503);
 });

 it('should get status for auth_required', () => {
 const status = FeatureErrorHandler.getStatusForErrorType('auth_required');
 expect(status).toBe(401);
 });

 it('should get status for data_access_denied', () => {
 const status = FeatureErrorHandler.getStatusForErrorType('data_access_denied');
 expect(status).toBe(403);
 });

 it('should get status for invalid_input', () => {
 const status = FeatureErrorHandler.getStatusForErrorType('invalid_input');
 expect(status).toBe(400);
 });

 it('should get status for internal_error', () => {
 const status = FeatureErrorHandler.getStatusForErrorType('internal_error');
 expect(status).toBe(500);
 });
 });

 describe('Helper functions', () => {
 it('should create feature error', () => {
 const error = createFeatureError('feature_disabled', 'errorBrain', 'Feature is disabled', {
 reason: 'test',
 });

 expect(error).toBeInstanceOf(FeatureError);
 expect(error.errorType).toBe('feature_disabled');
 expect(error.status).toBe(503);
 });

 it('should handle feature error', () => {
 const error = new FeatureError('feature_disabled', 'errorBrain', 403, 'Feature is disabled');

 const response = handleFeatureError(error);

 expect(response.status).toBe(403);
 expect(response.headers.get('Content-Type')).toBe('application/json');
 });

 it('should create error response', () => {
 const response = createErrorResponse('invalid_input', 'errorBrain', 'Invalid input', {
 field: 'errorMessage',
 });

 expect(response.error).toBe('Invalid input');
 expect(response.errorType).toBe('invalid_input');
 expect(response.status).toBe(400);
 expect(response.details?.field).toBe('errorMessage');
 });
 });
});



