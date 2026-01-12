import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';
import {
 FeatureFlagEnforcer,
 isRequestAllowed,
 getEnforcementResult,
 createDenialResponse,
} from './featureFlagEnforcer.js';
import { featureFlagManager } from '../services/featureFlags.js';

describe('FeatureFlagEnforcer', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 beforeEach(() => {
 vi.clearAllMocks();
 });

 describe('Feature Flag Enforcement', () => {
 it('should allow non-namespaced requests', () => {
 const request = new Request('http://localhost/api/other/endpoint');
 const result = FeatureFlagEnforcer.checkRequest(request);
 expect(result.allowed).toBe(true);
 });

 it('should check error-brain feature flag', () => {
 const request = new Request('http://localhost/api/error-brain/analyze');
 const result = FeatureFlagEnforcer.checkRequest(request);
 expect(result.context?.feature).toBe('errorBrain');
 });

 it('should check legal-ai feature flag', () => {
 const request = new Request('http://localhost/api/legal-ai/citations');
 const result = FeatureFlagEnforcer.checkRequest(request);
 expect(result.context?.feature).toBe('legalAi');
 });

 it('should deny disabled error-brain requests', () => {
 vi.spyOn(featureFlagManager, 'isFeatureEnabled').mockReturnValue(false);

 const request = new Request('http://localhost/api/error-brain/analyze');
 const result = FeatureFlagEnforcer.checkRequest(request);

 expect(result.allowed).toBe(false);
 expect(result.status).toBe(403);
 });

 it('should deny disabled legal-ai requests', () => {
 vi.spyOn(featureFlagManager, 'isFeatureEnabled').mockReturnValue(false);

 const request = new Request('http://localhost/api/legal-ai/citations');
 const result = FeatureFlagEnforcer.checkRequest(request);

 expect(result.allowed).toBe(false);
 expect(result.status).toBe(503);
 });

 it('should allow enabled error-brain requests', () => {
 vi.spyOn(featureFlagManager, 'isFeatureEnabled').mockReturnValue(true);

 const request = new Request('http://localhost/api/error-brain/analyze');
 const result = FeatureFlagEnforcer.checkRequest(request);

 expect(result.allowed).toBe(true);
 });

 it('should allow enabled legal-ai requests', () => {
 vi.spyOn(featureFlagManager, 'isFeatureEnabled').mockReturnValue(true);

 const request = new Request('http://localhost/api/legal-ai/citations');
 const result = FeatureFlagEnforcer.checkRequest(request);

 expect(result.allowed).toBe(true);
 });
 });

 describe('Error Response Creation', () => {
 it('should create 403 response for disabled error-brain', () => {
 const result = {
 allowed: false, status: 403, message: 'Error-Brain feature is not enabled',
 context: { feature: 'errorBrain' as const },
 };

 const response = FeatureFlagEnforcer.createErrorResponse(result);
 expect(response.status).toBe(403);
 });

 it('should create 503 response for disabled legal-ai', () => {
 const result = {
 allowed: false, status: 503, message: 'Legal-AI service is unavailable',
 context: { feature: 'legalAi' as const },
 };

 const response = FeatureFlagEnforcer.createErrorResponse(result);
 expect(response.status).toBe(503);
 });

 it('should include error details in response body', async () => {
 const result = {
 allowed: false, status: 403, message: 'Feature disabled',
 context: { feature: 'errorBrain' as const },
 };

 const response = FeatureFlagEnforcer.createErrorResponse(result);
 const body = await response.json();

 expect(body.error).toBeDefined();
 expect(body.feature).toBe('errorBrain');
 expect(body.timestamp).toBeDefined();
 });

 it('should return 200 for allowed requests', () => {
 const result = { allowed: true };
 const response = FeatureFlagEnforcer.createErrorResponse(result);
 expect(response.status).toBe(200);
 });
 });

 describe('Feature Status', () => {
 it('should get feature status for error-brain request', () => {
 const request = new Request('http://localhost/api/error-brain/analyze');
 const status = FeatureFlagEnforcer.getFeatureStatus(request);

 expect(status.feature).toBe('errorBrain');
 expect(typeof status.enabled).toBe('boolean');
 expect(typeof status.requiresAuth).toBe('boolean');
 });

 it('should get feature status for legal-ai request', () => {
 const request = new Request('http://localhost/api/legal-ai/citations');
 const status = FeatureFlagEnforcer.getFeatureStatus(request);

 expect(status.feature).toBe('legalAi');
 expect(typeof status.enabled).toBe('boolean');
 expect(typeof status.requiresAuth).toBe('boolean');
 });

 it('should return null feature for non-namespaced request', () => {
 const request = new Request('http://localhost/api/other/endpoint');
 const status = FeatureFlagEnforcer.getFeatureStatus(request);

 expect(status.feature).toBeNull();
 expect(status.enabled).toBe(true);
 expect(status.requiresAuth).toBe(false);
 });
 });

 describe('Feature Configuration', () => {
 it('should get error-brain feature config', () => {
 const config = FeatureFlagEnforcer.getFeatureConfig('errorBrain');
 expect(config).toHaveProperty('enabled');
 expect(config).toHaveProperty('requireAuth');
 expect(config).toHaveProperty('logLevel');
 });

 it('should get legal-ai feature config', () => {
 const config = FeatureFlagEnforcer.getFeatureConfig('legalAi');
 expect(config).toHaveProperty('enabled');
 expect(config).toHaveProperty('requireAuth');
 expect(config).toHaveProperty('logLevel');
 });

 it('should check if feature is enabled', () => {
 const enabled = FeatureFlagEnforcer.isFeatureEnabled('errorBrain');
 expect(typeof enabled).toBe('boolean');
 });
 });

 describe('Result Validation', () => {
 it('should validate allowed result', () => {
 const result = { allowed: true };
 expect(FeatureFlagEnforcer.validateResult(result)).toBe(true);
 });

 it('should validate denied result with status and message', () => {
 const result = {
 allowed: false, status: 403, message: 'Feature disabled',
 };
 expect(FeatureFlagEnforcer.validateResult(result)).toBe(true);
 });

 it('should reject denied result without status', () => {
 const result = {
 allowed: false,
 message: 'Feature disabled',
 };
 expect(FeatureFlagEnforcer.validateResult(result)).toBe(false);
 });

 it('should reject denied result without message', () => {
 const result = {
 allowed: false, status: 403
 };
 expect(FeatureFlagEnforcer.validateResult(result)).toBe(false);
 });

 it('should reject invalid status codes', () => {
 const result = {
 allowed: false, status: 200, message: 'Feature disabled',
 };
 expect(FeatureFlagEnforcer.validateResult(result)).toBe(false);
 });
 });

 describe('Helper Functions', () => {
 it('should check if request is allowed', () => {
 const request = new Request('http://localhost/api/other/endpoint');
 expect(isRequestAllowed(request)).toBe(true);
 });

 it('should get enforcement result', () => {
 const request = new Request('http://localhost/api/error-brain/analyze');
 const result = getEnforcementResult(request);
 expect(result).toHaveProperty('allowed');
 expect(result).toHaveProperty('context');
 });

 it('should create denial response for disabled feature', () => {
 vi.spyOn(featureFlagManager, 'isFeatureEnabled').mockReturnValue(false);

 const request = new Request('http://localhost/api/error-brain/analyze');
 const response = createDenialResponse(request);

 expect(response).not.toBeNull();
 expect(response?.status).toBe(403);
 });

 it('should return null for allowed requests', () => {
 const request = new Request('http://localhost/api/other/endpoint');
 const response = createDenialResponse(request);

 expect(response).toBeNull();
 });
 });

 describe('Multiple Requests', () => {
 it('should handle multiple error-brain requests', () => {
 const requests = [
 new Request('http://localhost/api/error-brain/analyze'),
 new Request('http://localhost/api/error-brain/patch'),
 new Request('http://localhost/api/error-brain/history')];

 requests.forEach((request) => {
 const result = FeatureFlagEnforcer.checkRequest(request);
 expect(result.context?.feature).toBe('errorBrain');
 });
 });

 it('should handle multiple legal-ai requests', () => {
 const requests = [
 new Request('http://localhost/api/legal-ai/citations'),
 new Request('http://localhost/api/legal-ai/authorities'),
 new Request('http://localhost/api/legal-ai/reports')];

 requests.forEach((request) => {
 const result = FeatureFlagEnforcer.checkRequest(request);
 expect(result.context?.feature).toBe('legalAi');
 });
 });

 it('should handle mixed requests', () => {
 const errorBrainRequest = new Request('http://localhost/api/error-brain/analyze');
 const legalAiRequest = new Request('http://localhost/api/legal-ai/citations');
 const otherRequest = new Request('http://localhost/api/other/endpoint');

 const errorBrainResult = FeatureFlagEnforcer.checkRequest(errorBrainRequest);
 const legalAiResult = FeatureFlagEnforcer.checkRequest(legalAiRequest);
 const otherResult = FeatureFlagEnforcer.checkRequest(otherRequest);

 expect(errorBrainResult.context?.feature).toBe('errorBrain');
 expect(legalAiResult.context?.feature).toBe('legalAi');
 expect(otherResult.context).toBeUndefined();
 });
 });
});



