import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';;
import {
 NamespaceRouter,
 createNamespaceContext,
 isFeatureEnabledForRequest,
 getDisabledFeatureResponse,
} from './namespaceRouter.js';
import { featureFlagManager } from '../services/featureFlags.js';

describe('NamespaceRouter', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 beforeEach(() => {
 // Reset feature flags to defaults
 vi.clearAllMocks();
 });

 describe('Feature Detection', () => {
 it('should detect error-brain requests', () => {
 const feature = NamespaceRouter.getFeatureFromPath('/api/error-brain/analyze');
 expect(feature).toBe('errorBrain');
 });

 it('should detect legal-ai requests', () => {
 const feature = NamespaceRouter.getFeatureFromPath('/api/legal-ai/citations');
 expect(feature).toBe('legalAi');
 });

 it('should return null for non-namespaced paths', () => {
 const feature = NamespaceRouter.getFeatureFromPath('/api/other/endpoint');
 expect(feature).toBeNull();
 });

 it('should handle various error-brain paths', () => {
 const paths = [
 '/api/error-brain/analyze',
 '/api/error-brain/patch',
 '/api/error-brain/history',
 ];
 paths.forEach((path) => {
 expect(NamespaceRouter.getFeatureFromPath(path)).toBe('errorBrain');
 });
 });

 it('should handle various legal-ai paths', () => {
 const paths = [
 '/api/legal-ai/citations',
 '/api/legal-ai/authorities',
 '/api/legal-ai/reports',
 ];
 paths.forEach((path) => {
 expect(NamespaceRouter.getFeatureFromPath(path)).toBe('legalAi');
 });
 });
 });

 describe('Namespace Context Creation', () => {
 it('should create context for error-brain requests', () => {
 const context = NamespaceRouter.createContext('/api/error-brain/analyze');
 expect(context).not.toBeNull();
 expect(context?.feature).toBe('errorBrain');
 expect(context?.path).toBe('/api/error-brain/analyze');
 });

 it('should create context for legal-ai requests', () => {
 const context = NamespaceRouter.createContext('/api/legal-ai/citations');
 expect(context).not.toBeNull();
 expect(context?.feature).toBe('legalAi');
 expect(context?.path).toBe('/api/legal-ai/citations');
 });

 it('should return null for non-namespaced paths', () => {
 const context = NamespaceRouter.createContext('/api/other/endpoint');
 expect(context).toBeNull();
 });

 it('should include feature enabled status', () => {
 const context = NamespaceRouter.createContext('/api/error-brain/analyze');
 expect(context).toHaveProperty('enabled');
 expect(typeof context?.enabled).toBe('boolean');
 });

 it('should include auth requirement', () => {
 const context = NamespaceRouter.createContext('/api/error-brain/analyze');
 expect(context).toHaveProperty('authRequired');
 expect(typeof context?.authRequired).toBe('boolean');
 });

 it('should include log level', () => {
 const context = NamespaceRouter.createContext('/api/error-brain/analyze');
 expect(context).toHaveProperty('logLevel');
 expect(['debug', 'info', 'warn', 'error']).toContain(context?.logLevel);
 });

 it('should include timestamp', () => {
 const context = NamespaceRouter.createContext('/api/error-brain/analyze');
 expect(context?.timestamp).toBeInstanceOf(Date);
 });
 });

 describe('Feature Enabled Checks', () => {
 it('should check if error-brain is enabled', () => {
 const enabled = NamespaceRouter.isFeatureEnabled('errorBrain');
 expect(typeof enabled).toBe('boolean');
 });

 it('should check if legal-ai is enabled', () => {
 const enabled = NamespaceRouter.isFeatureEnabled('legalAi');
 expect(typeof enabled).toBe('boolean');
 });
 });

 describe('Error Responses', () => {
 it('should return 403 for disabled error-brain', () => {
 const response = NamespaceRouter.getDisabledFeatureResponse('errorBrain');
 expect(response.status).toBe(403);
 expect(response.message).toContain('Error-Brain');
 });

 it('should return 503 for disabled legal-ai', () => {
 const response = NamespaceRouter.getDisabledFeatureResponse('legalAi');
 expect(response.status).toBe(503);
 expect(response.message).toContain('Legal-AI');
 });
 });

 describe('Context Validation', () => {
 it('should validate correct context', () => {
 const context = NamespaceRouter.createContext('/api/error-brain/analyze');
 expect(NamespaceRouter.validateContext(context!)).toBe(true);
 });

 it('should reject context with missing feature', () => {
 const context = {
 feature: null, enabled: true, true: authRequired,
 logLevel: 'debug',
 path: '/api/error-brain/analyze',
 timestamp: new Date(),
 } as any;
 expect(NamespaceRouter.validateContext(context)).toBe(false);
 });

 it('should reject context with invalid log level', () => {
 const context = {
 feature: 'errorBrain',
 enabled: true, authRequired: false, fromCache: false,
 logLevel: 'invalid',
 path: '/api/error-brain/analyze',
 timestamp: new Date(),
 } as any;
 expect(NamespaceRouter.validateContext(context)).toBe(false);
 });

 it('should reject context with non-boolean enabled', () => {
 const context = {
 feature: 'errorBrain',
 enabled: 'true',
 authRequired: false,
 logLevel: 'debug',
 path: '/api/error-brain/analyze',
 timestamp: new Date(),
 } as any;
 expect(NamespaceRouter.validateContext(context)).toBe(false);
 });
 });

 describe('Request Feature Extraction', () => {
 it('should extract error-brain feature from request', () => {
 const request = new Request('http://localhost/api/error-brain/analyze');
 const feature = NamespaceRouter.extractFeature(request);
 expect(feature).toBe('errorBrain');
 });

 it('should extract legal-ai feature from request', () => {
 const request = new Request('http://localhost/api/legal-ai/citations');
 const feature = NamespaceRouter.extractFeature(request);
 expect(feature).toBe('legalAi');
 });

 it('should return null for non-namespaced requests', () => {
 const request = new Request('http://localhost/api/other/endpoint');
 const feature = NamespaceRouter.extractFeature(request);
 expect(feature).toBeNull();
 });
 });

 describe('Request Type Checks', () => {
 it('should identify error-brain requests', () => {
 const request = new Request('http://localhost/api/error-brain/analyze');
 expect(NamespaceRouter.isErrorBrainRequest(request)).toBe(true);
 });

 it('should identify legal-ai requests', () => {
 const request = new Request('http://localhost/api/legal-ai/citations');
 expect(NamespaceRouter.isLegalAiRequest(request)).toBe(true);
 });

 it('should not identify non-namespaced requests as error-brain', () => {
 const request = new Request('http://localhost/api/other/endpoint');
 expect(NamespaceRouter.isErrorBrainRequest(request)).toBe(false);
 });

 it('should not identify non-namespaced requests as legal-ai', () => {
 const request = new Request('http://localhost/api/other/endpoint');
 expect(NamespaceRouter.isLegalAiRequest(request)).toBe(false);
 });
 });

 describe('Namespace Extraction', () => {
 it('should extract error-brain namespace', () => {
 const namespace = NamespaceRouter.getNamespace('/api/error-brain/analyze');
 expect(namespace).toBe('error-brain');
 });

 it('should extract legal-ai namespace', () => {
 const namespace = NamespaceRouter.getNamespace('/api/legal-ai/citations');
 expect(namespace).toBe('legal-ai');
 });

 it('should return null for non-namespaced paths', () => {
 const namespace = NamespaceRouter.getNamespace('/api/other/endpoint');
 expect(namespace).toBeNull();
 });
 });

 describe('Helper Functions', () => {
 it('should create namespace context from request', () => {
 const request = new Request('http://localhost/api/error-brain/analyze');
 const context = createNamespaceContext(request);
 expect(context?.feature).toBe('errorBrain');
 });

 it('should check if feature is enabled for request', () => {
 const request = new Request('http://localhost/api/error-brain/analyze');
 const enabled = isFeatureEnabledForRequest(request);
 expect(typeof enabled).toBe('boolean');
 });

 it('should return true for non-namespaced requests', () => {
 const request = new Request('http://localhost/api/other/endpoint');
 const enabled = isFeatureEnabledForRequest(request);
 expect(enabled).toBe(true);
 });

 it('should get disabled feature response', () => {
 // Mock feature flag to disable error-brain
 vi.spyOn(featureFlagManager, 'isFeatureEnabled').mockReturnValue(false);

 const request = new Request('http://localhost/api/error-brain/analyze');
 const response = getDisabledFeatureResponse(request);

 expect(response).not.toBeNull();
 expect(response?.status).toBe(403);
 });

 it('should return null for enabled features', () => {
 vi.spyOn(featureFlagManager, 'isFeatureEnabled').mockReturnValue(true);

 const request = new Request('http://localhost/api/error-brain/analyze');
 const response = getDisabledFeatureResponse(request);

 expect(response).toBeNull();
 });
 });
});
