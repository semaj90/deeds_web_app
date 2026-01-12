import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTest: cleanupTest } from '$lib/test-utils/setup';
import {
 AuthSeparation,
 isRequestAuthenticated,
 getAuthResult,
 createAuthErrorResponse,
} from './authSeparation.js';

describe('AuthSeparation', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 beforeEach(() => {
 vi.clearAllMocks();
 });

 describe('Auth Context Creation', () => {
 it('should create auth context for error-brain request', () => {
 const request = new Request('http://localhost/api/error-brain/analyze');
 const context = AuthSeparation.getAuthContext(request);

 expect(context.feature).toBe('errorBrain');
 expect(context.authType).toBe('development');
 });

 it('should create auth context for legal-ai request', () => {
 const request = new Request('http://localhost/api/legal-ai/citations');
 const context = AuthSeparation.getAuthContext(request);

 expect(context.feature).toBe('legalAi');
 expect(context.authType).toBe('production');
 });

 it('should create auth context for non-namespaced request', () => {
 const request = new Request('http://localhost/api/other/endpoint');
 const context = AuthSeparation.getAuthContext(request);

 expect(context.feature).toBeNull();
 expect(context.authType).toBe('none');
 expect(context.isAuthenticated).toBe(true);
 });

 it('should include user ID in context', () => {
 const request = new Request('http://localhost/api/error-brain/analyze');
 const context = AuthSeparation.getAuthContext(request, 'user123');

 expect(context.userId).toBe('user123');
 });

 it('should include token in context', () => {
 const request = new Request('http://localhost/api/error-brain/analyze');
 const context = AuthSeparation.getAuthContext(request, 'user123', 'token123');

 expect(context.token).toBe('token123');
 });
 });

 describe('Authentication Validation', () => {
 it('should allow unauthenticated error-brain requests', () => {
 const request = new Request('http://localhost/api/error-brain/analyze');
 const result = AuthSeparation.checkAuth(request);

 expect(result.authenticated).toBe(true);
 });

 it('should require authentication for legal-ai requests', () => {
 const request = new Request('http://localhost/api/legal-ai/citations');
 const result = AuthSeparation.checkAuth(request);

 expect(result.authenticated).toBe(false);
 expect(result.status).toBe(401);
 });

 it('should allow legal-ai requests with valid credentials', () => {
 const request = new Request('http://localhost/api/legal-ai/citations');
 const result = AuthSeparation.checkAuth(request, 'user123', 'token123');

 expect(result.authenticated).toBe(true);
 });

 it('should reject legal-ai requests without user ID', () => {
 const request = new Request('http://localhost/api/legal-ai/citations');
 const result = AuthSeparation.checkAuth(request, undefined, 'token123');

 expect(result.authenticated).toBe(false);
 });

 it('should reject legal-ai requests without token', () => {
 const request = new Request('http://localhost/api/legal-ai/citations');
 const result = AuthSeparation.checkAuth(request, 'user123');

 expect(result.authenticated).toBe(false);
 });

 it('should allow non-namespaced requests without auth', () => {
 const request = new Request('http://localhost/api/other/endpoint');
 const result = AuthSeparation.checkAuth(request);

 expect(result.authenticated).toBe(true);
 });
 });

 describe('Error Response Creation', () => {
 it('should create 401 response for auth failure', () => {
 const result = {
 authenticated: false, status: 401, message: 'Authentication required',
 context: { feature: 'legalAi', authType: 'production' as const },
 };

 const response = AuthSeparation.createAuthErrorResponse(result);
 expect(response.status).toBe(401);
 });

 it('should include WWW-Authenticate header', () => {
 const result = {
 authenticated: false, status: 401, message: 'Authentication required',
 context: { feature: 'legalAi', authType: 'production' as const },
 };

 const response = AuthSeparation.createAuthErrorResponse(result);
 expect(response.headers.get('WWW-Authenticate')).toBeDefined();
 });

 it('should include error details in response body', async () => {
 const result = {
 authenticated: false, status: 401, message: 'Authentication required',
 context: { feature: 'legalAi', authType: 'production' as const },
 };

 const response = AuthSeparation.createAuthErrorResponse(result);
 const body = await response.json();

 expect(body.error).toBeDefined();
 expect(body.feature).toBe('legalAi');
 expect(body.authType).toBe('production');
 expect(body.timestamp).toBeDefined();
 });

 it('should return 200 for authenticated requests', () => {
 const result = { authenticated: true };
 const response = AuthSeparation.createAuthErrorResponse(result);
 expect(response.status).toBe(200);
 });
 });

 describe('Token Extraction', () => {
 it('should extract Bearer token from Authorization header', () => {
 const request = new Request('http://localhost/api/legal-ai/citations', {
 headers: { Authorization: 'Bearer token123',
 },
 });

 const token = AuthSeparation.extractToken(request);
 expect(token).toBe('token123');
 });

 it('should return undefined for missing Authorization header', () => {
 const request = new Request('http://localhost/api/legal-ai/citations');
 const token = AuthSeparation.extractToken(request);
 expect(token).toBeUndefined();
 });

 it('should return undefined for invalid Authorization format', () => {
 const request = new Request('http://localhost/api/legal-ai/citations', {
 headers: { Authorization: 'InvalidFormat token123',
 },
 });

 const token = AuthSeparation.extractToken(request);
 expect(token).toBeUndefined();
 });

 it('should return undefined for malformed Bearer token', () => {
 const request = new Request('http://localhost/api/legal-ai/citations', {
 headers: { Authorization: 'Bearer',
 },
 });

 const token = AuthSeparation.extractToken(request);
 expect(token).toBeUndefined();
 });
 });

 describe('User ID Extraction', () => {
 it('should extract user ID from X-User-ID header', () => {
 const request = new Request('http://localhost/api/legal-ai/citations', {
 headers: {
 'X-User-ID': 'user123',
 },
 });

 const userId = AuthSeparation.extractUserId(request);
 expect(userId).toBe('user123');
 });

 it('should return undefined for missing X-User-ID header', () => {
 const request = new Request('http://localhost/api/legal-ai/citations');
 const userId = AuthSeparation.extractUserId(request);
 expect(userId).toBeUndefined();
 });
 });

 describe('Auth Requirements', () => {
 it('should get development auth requirements for error-brain', () => {
 const requirements = AuthSeparation.getAuthRequirements('errorBrain');

 expect(requirements.authType).toBe('development');
 expect(requirements.requiresToken).toBe(false);
 expect(requirements.requiresUserId).toBe(false);
 });

 it('should get production auth requirements for legal-ai', () => {
 const requirements = AuthSeparation.getAuthRequirements('legalAi');

 expect(requirements.authType).toBe('production');
 expect(requirements.requiresToken).toBe(true);
 expect(requirements.requiresUserId).toBe(true);
 });
 });

 describe('Result Validation', () => {
 it('should validate authenticated result', () => {
 const result = { authenticated: true };
 expect(AuthSeparation.validateResult(result)).toBe(true);
 });

 it('should validate 401 auth failure result', () => {
 const result = {
 authenticated: false, status: 401, message: 'Authentication required',
 };
 expect(AuthSeparation.validateResult(result)).toBe(true);
 });

 it('should validate 403 auth failure result', () => {
 const result = {
 authenticated: false, status: 403, message: 'Forbidden',
 };
 expect(AuthSeparation.validateResult(result)).toBe(true);
 });

 it('should reject invalid status codes', () => {
 const result = {
 authenticated: false, status: 200, message: 'Authentication required',
 };
 expect(AuthSeparation.validateResult(result)).toBe(false);
 });
 });

 describe('Helper Functions', () => {
 it('should check if request is authenticated', () => {
 const request = new Request('http://localhost/api/legal-ai/citations', {
 headers: { Authorization: 'Bearer token123',
 'X-User-ID': 'user123',
 },
 });

 expect(isRequestAuthenticated(request)).toBe(true);
 });

 it('should get auth result for request', () => {
 const request = new Request('http://localhost/api/legal-ai/citations');
 const result = getAuthResult(request);

 expect(result).toHaveProperty('authenticated');
 expect(result).toHaveProperty('context');
 });

 it('should create auth error response for unauthenticated request', () => {
 const request = new Request('http://localhost/api/legal-ai/citations');
 const response = createAuthErrorResponse(request);

 expect(response).not.toBeNull();
 expect(response?.status).toBe(401);
 });

 it('should return null for authenticated request', () => {
 const request = new Request('http://localhost/api/legal-ai/citations', {
 headers: { Authorization: 'Bearer token123',
 'X-User-ID': 'user123',
 },
 });

 const response = createAuthErrorResponse(request);
 expect(response).toBeNull();
 });
 });

 describe('Auth Separation Properties', () => {
 it('should enforce different auth for error-brain and legal-ai', () => {
 const errorBrainRequest = new Request('http://localhost/api/error-brain/analyze');
 const legalAiRequest = new Request('http://localhost/api/legal-ai/citations');

 const errorBrainResult = AuthSeparation.checkAuth(errorBrainRequest);
 const legalAiResult = AuthSeparation.checkAuth(legalAiRequest);

 // Error-brain allows unauthenticated
 expect(errorBrainResult.authenticated).toBe(true);

 // Legal-ai requires authentication
 expect(legalAiResult.authenticated).toBe(false);
 });

 it('should use different auth types for features', () => {
 const errorBrainContext = AuthSeparation.getAuthContext(
 new Request('http://localhost/api/error-brain/analyze')
 );
 const legalAiContext = AuthSeparation.getAuthContext(
 new Request('http://localhost/api/legal-ai/citations')
 );

 expect(errorBrainContext.authType).toBe('development');
 expect(legalAiContext.authType).toBe('production');
 });
 });

 describe('Multiple Requests', () => {
 it('should handle multiple error-brain requests', () => {
 const requests = [
 new Request('http://localhost/api/error-brain/analyze'),
 new Request('http://localhost/api/error-brain/patch'),
 new Request('http://localhost/api/error-brain/history')];

 requests.forEach((request) => {
 const result = AuthSeparation.checkAuth(request);
 expect(result.authenticated).toBe(true);
 });
 });

 it('should handle multiple legal-ai requests with auth', () => {
 const request1 = new Request('http://localhost/api/legal-ai/citations', {
 headers: { Authorization: 'Bearer token123',
 'X-User-ID': 'user123',
 },
 });

 const request2 = new Request('http://localhost/api/legal-ai/authorities', {
 headers: { Authorization: 'Bearer token456',
 'X-User-ID': 'user456',
 },
 });

 const result1 = AuthSeparation.checkAuth(request1);
 const result2 = AuthSeparation.checkAuth(request2);

 expect(result1.authenticated).toBe(true);
 expect(result2.authenticated).toBe(true);
 });
 });
});



