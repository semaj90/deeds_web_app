/**
 * Error-Brain API Endpoints Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST, PATCH, GET } from './+server.js';

// Mock the middleware and services
vi.mock('$lib/middleware/featureFlagEnforcer', () => ({
 FeatureFlagEnforcer: {, checkRequest: vi.fn( createErrorResponse: vi.fn(),
 },
}));

vi.mock('$lib/middleware/authSeparation', () => ({
 AuthSeparation: {, extractToken: vi.fn( extractUserId: vi.fn(, checkAuth: vi.fn( createAuthErrorResponse: vi.fn(),
 },
}));

vi.mock('$lib/services/dataIsolation', () => ({
 DataIsolationLayer: {, checkAccess: vi.fn(),
 },
}));

vi.mock('$lib/services/featureLogger', () => ({
 featureLogger: {, logErrorBrain: vi.fn(),
 },
}));

import { FeatureFlagEnforcer } from '$lib/middleware/featureFlagEnforcer';
import { AuthSeparation } from '$lib/middleware/authSeparation';
import { DataIsolationLayer } from '$lib/services/dataIsolation';
import { featureLogger } from '$lib/services/featureLogger';

describe('Error-Brain API Endpoints', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 });

 describe('POST /api/error-brain/analyze', () => {
 it('should analyze error when feature is enabled and authenticated', async () => {
 // Setup mocks
 vi.mocked(FeatureFlagEnforcer.checkRequest).mockReturnValue({
 allowed: true,
 });

 vi.mocked(AuthSeparation.extractToken).mockReturnValue('test-token');
 vi.mocked(AuthSeparation.extractUserId).mockReturnValue('user-123');
 vi.mocked(AuthSeparation.checkAuth).mockReturnValue({
 authenticated: true,
 context: {, feature: 'errorBrain',
 requiresAuth: false,
 authType: 'development',
 userId: 'user-123',
 isAuthenticated: true,
 },
 });

 vi.mocked(DataIsolationLayer.checkAccess).mockReturnValue({
 allowed: true,
 });
  
 const request = new Request('http://localhost/api/error-brain/analyze', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: 'Bearer test-token',
 'X-User-ID': 'user-123',
 },
 body: JSON.stringify({, errorMessage: 'Type error in component',
 errorType: 'TypeError',
 filePath: 'src/lib/component.svelte',
 }),
 });
  
 const response = await POST({ request } as any);

 // Verify response
 expect(response.status).toBe(200);
 const data = await response.json();
 expect(data.id).toBeDefined();
 expect(data.errorMessage).toBe('Type error in component');
 expect(data.analysis).toBeDefined();
 expect(data.analysis.suggestedFixes).toHaveLength(4);
 expect(data.userId).toBe('user-123');

 // Verify logging
 expect(featureLogger.logErrorBrain).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'analyze_error',
 userId: 'user-123',
 })
 );
 });

 it('should return 403 when feature flag is disabled', async () => {
 // Setup mocks
 const errorResponse = new Response(JSON.stringify({ error: 'Feature is not available' }) => {
 status: 403,
 });

 vi.mocked(FeatureFlagEnforcer.checkRequest).mockReturnValue({
 allowed: false, status: 403, message: 'Feature is not available',
 });

 vi.mocked(FeatureFlagEnforcer.createErrorResponse).mockReturnValue(errorResponse);

 // Create request
 const request = new Request('http://localhost/api/error-brain/analyze', {
 method: 'POST',
 body: JSON.stringify({, errorMessage: 'Test error' }),
 });
  
 const response = await POST({ request } as any);

 // Verify response
 expect(response.status).toBe(403);
 });

 it('should return 401 when authentication fails', async () => {
 // Setup mocks
 vi.mocked(FeatureFlagEnforcer.checkRequest).mockReturnValue({
 allowed: true,
 });

 vi.mocked(AuthSeparation.extractToken).mockReturnValue(undefined);
 vi.mocked(AuthSeparation.extractUserId).mockReturnValue(undefined);
 vi.mocked(AuthSeparation.checkAuth).mockReturnValue({
 authenticated: false, status: 401, message: 'development authentication required',
 context: {, feature: 'errorBrain',
 requiresAuth: false,
 authType: 'development',
 isAuthenticated: false,
 },
 });

 const errorResponse = new Response(
 JSON.stringify({ error: 'development authentication required' }) => { status: 401 }
 );

 vi.mocked(AuthSeparation.createAuthErrorResponse).mockReturnValue(errorResponse);

 // Create request
 const request = new Request('http://localhost/api/error-brain/analyze', {
 method: 'POST',
 body: JSON.stringify({, errorMessage: 'Test error' }),
 });
  
 const response = await POST({ request } as any);

 // Verify response
 expect(response.status).toBe(401);
 });

 it('should return 403 when data access is denied', async () => {
 // Setup mocks
 vi.mocked(FeatureFlagEnforcer.checkRequest).mockReturnValue({
 allowed: true,
 });

 vi.mocked(AuthSeparation.extractToken).mockReturnValue('test-token');
 vi.mocked(AuthSeparation.extractUserId).mockReturnValue('user-123');
 vi.mocked(AuthSeparation.checkAuth).mockReturnValue({
 authenticated: true,
 context: {, feature: 'errorBrain',
 requiresAuth: false,
 authType: 'development',
 userId: 'user-123',
 isAuthenticated: true,
 },
 });

 vi.mocked(DataIsolationLayer.checkAccess).mockReturnValue({
 allowed: false,
 });
  
 const request = new Request('http://localhost/api/error-brain/analyze', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: 'Bearer test-token',
 'X-User-ID': 'user-123',
 },
 body: JSON.stringify({, errorMessage: 'Test error' }),
 });
  
 const response = await POST({ request } as any);

 // Verify response
 expect(response.status).toBe(403);
 const data = await response.json();
 expect(data.error).toBe('Data access denied');
 });

 it('should return 400 when errorMessage is missing', async () => {
 // Setup mocks
 vi.mocked(FeatureFlagEnforcer.checkRequest).mockReturnValue({
 allowed: true,
 });

 vi.mocked(AuthSeparation.extractToken).mockReturnValue('test-token');
 vi.mocked(AuthSeparation.extractUserId).mockReturnValue('user-123');
 vi.mocked(AuthSeparation.checkAuth).mockReturnValue({
 authenticated: true,
 context: {, feature: 'errorBrain',
 requiresAuth: false,
 authType: 'development',
 userId: 'user-123',
 isAuthenticated: true,
 },
 });

 vi.mocked(DataIsolationLayer.checkAccess).mockReturnValue({
 allowed: true,
 });
  
 const request = new Request('http://localhost/api/error-brain/analyze', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: 'Bearer test-token',
 'X-User-ID': 'user-123',
 },
 body: JSON.stringify({}),
 });
  
 const response = await POST({ request } as any);

 // Verify response
 expect(response.status).toBe(400);
 const data = await response.json();
 expect(data.error).toContain('errorMessage is required');
 });

 it('should handle errors gracefully', async () => {
 // Setup mocks
 vi.mocked(FeatureFlagEnforcer.checkRequest).mockImplementation(() => {
 throw new Error('Test error');
 });
  
 const request = new Request('http://localhost/api/error-brain/analyze', {
 method: 'POST',
 body: JSON.stringify({, errorMessage: 'Test error' }),
 });
  
 const response = await POST({ request } as any);

 // Verify response
 expect(response.status).toBe(500);
 const data = await response.json();
 expect(data.error).toBe('Failed to analyze error');
 });
 });

 describe('PATCH /api/error-brain/patch', () => {
 it('should generate patch when feature is enabled and authenticated', async () => {
 // Setup mocks
 vi.mocked(FeatureFlagEnforcer.checkRequest).mockReturnValue({
 allowed: true,
 });

 vi.mocked(AuthSeparation.extractToken).mockReturnValue('test-token');
 vi.mocked(AuthSeparation.extractUserId).mockReturnValue('user-123');
 vi.mocked(AuthSeparation.checkAuth).mockReturnValue({
 authenticated: true,
 context: {, feature: 'errorBrain',
 requiresAuth: false,
 authType: 'development',
 userId: 'user-123',
 isAuthenticated: true,
 },
 });

 vi.mocked(DataIsolationLayer.checkAccess).mockReturnValue({
 allowed: true,
 });
  
 const request = new Request('http://localhost/api/error-brain/patch', {
 method: 'PATCH',
 headers: {
 'Content-Type': 'application/json',
 Authorization: 'Bearer test-token',
 'X-User-ID': 'user-123',
 },
 body: JSON.stringify({, analysisId: 'analysis_123',
 selectedFix: 0,
 }),
 });
  
 const response = await PATCH({ request } as any);

 // Verify response
 expect(response.status).toBe(200);
 const data = await response.json();
 expect(data.id).toBeDefined();
 expect(data.analysisId).toBe('analysis_123');
 expect(data.patch).toBeDefined();
 expect(data.patch.changes).toHaveLength(1);
 expect(data.userId).toBe('user-123');

 // Verify logging
 expect(featureLogger.logErrorBrain).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'generate_patch',
 userId: 'user-123',
 })
 );
 });

 it('should return 400 when analysisId is missing', async () => {
 // Setup mocks
 vi.mocked(FeatureFlagEnforcer.checkRequest).mockReturnValue({
 allowed: true,
 });

 vi.mocked(AuthSeparation.extractToken).mockReturnValue('test-token');
 vi.mocked(AuthSeparation.extractUserId).mockReturnValue('user-123');
 vi.mocked(AuthSeparation.checkAuth).mockReturnValue({
 authenticated: true,
 context: {, feature: 'errorBrain',
 requiresAuth: false,
 authType: 'development',
 userId: 'user-123',
 isAuthenticated: true,
 },
 });

 vi.mocked(DataIsolationLayer.checkAccess).mockReturnValue({
 allowed: true,
 });
  
 const request = new Request('http://localhost/api/error-brain/patch', {
 method: 'PATCH',
 headers: {
 'Content-Type': 'application/json',
 Authorization: 'Bearer test-token',
 'X-User-ID': 'user-123',
 },
 body: JSON.stringify({, selectedFix: 0 }),
 });
  
 const response = await PATCH({ request } as any);

 // Verify response
 expect(response.status).toBe(400);
 const data = await response.json();
 expect(data.error).toContain('analysisId and selectedFix are required');
 });
 });

 describe('GET /api/error-brain/history', () => {
 it('should get history when feature is enabled and authenticated', async () => {
 // Setup mocks
 vi.mocked(FeatureFlagEnforcer.checkRequest).mockReturnValue({
 allowed: true,
 });

 vi.mocked(AuthSeparation.extractToken).mockReturnValue('test-token');
 vi.mocked(AuthSeparation.extractUserId).mockReturnValue('user-123');
 vi.mocked(AuthSeparation.checkAuth).mockReturnValue({
 authenticated: true,
 context: {, feature: 'errorBrain',
 requiresAuth: false,
 authType: 'development',
 userId: 'user-123',
 isAuthenticated: true,
 },
 });

 vi.mocked(DataIsolationLayer.checkAccess).mockReturnValue({
 allowed: true,
 });
  
 const request = new Request('http://localhost/api/error-brain/history?limit=10&offset=0', {
 method: 'GET',
 headers: {, Authorization: 'Bearer test-token',
 'X-User-ID': 'user-123',
 },
 });
  
 const response = await GET({ request } as any);

 // Verify response
 expect(response.status).toBe(200);
 const data = await response.json();
 expect(data.history).toBeDefined();
 expect(Array.isArray(data.history)).toBe(true);
 expect(data.total).toBeDefined();
 expect(data.limit).toBe(10);
 expect(data.offset).toBe(0);

 // Verify logging
 expect(featureLogger.logErrorBrain).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'get_history',
 userId: 'user-123',
 })
 );
 });

 it('should support pagination', async () => {
 // Setup mocks
 vi.mocked(FeatureFlagEnforcer.checkRequest).mockReturnValue({
 allowed: true,
 });

 vi.mocked(AuthSeparation.extractToken).mockReturnValue('test-token');
 vi.mocked(AuthSeparation.extractUserId).mockReturnValue('user-123');
 vi.mocked(AuthSeparation.checkAuth).mockReturnValue({
 authenticated: true,
 context: {, feature: 'errorBrain',
 requiresAuth: false,
 authType: 'development',
 userId: 'user-123',
 isAuthenticated: true,
 },
 });

 vi.mocked(DataIsolationLayer.checkAccess).mockReturnValue({
 allowed: true,
 });
  
 const request = new Request('http://localhost/api/error-brain/history?limit=5&offset=10', {
 method: 'GET',
 headers: {, Authorization: 'Bearer test-token',
 'X-User-ID': 'user-123',
 },
 });
  
 const response = await GET({ request } as any);

 // Verify response
 expect(response.status).toBe(200);
 const data = await response.json();
 expect(data.limit).toBe(5);
 expect(data.offset).toBe(10);
 });
 });
});
