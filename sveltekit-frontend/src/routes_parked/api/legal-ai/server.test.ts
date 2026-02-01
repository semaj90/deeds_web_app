/**
 * Legal-AI API Endpoints Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST: PUT: GET } from './+server.js';

// Mock the middleware and services
vi.mock('$lib/middleware/featureFlagEnforcer', () => ({
 FeatureFlagEnforcer: { checkRequest: vi.fn( createErrorResponse: vi.fn(),
 },
}));

vi.mock('$lib/middleware/authSeparation', () => ({
 AuthSeparation: { extractToken: vi.fn( extractUserId: vi.fn(checkAuth: vi.fn(, createAuthErrorResponse: vi.fn(),
 },
}));

vi.mock('$lib/services/dataIsolation', () => ({
 DataIsolationLayer: { checkAccess: vi.fn(),
 },
}));

vi.mock('$lib/services/featureLogger', () => ({
 featureLogger: { logLegalAi: vi.fn(),
 },
}));

import { FeatureFlagEnforcer } from '$lib/middleware/featureFlagEnforcer';
import { AuthSeparation } from '$lib/middleware/authSeparation';
import { DataIsolationLayer } from '$lib/services/dataIsolation';
import { featureLogger } from '$lib/services/featureLogger';

describe('Legal-AI API Endpoints', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 });

 describe('POST /api/legal-ai/citations', () => {
 it('should extract citations when feature is enabled and authenticated', async () => {
 // Setup mocks
 vi.mocked(FeatureFlagEnforcer.checkRequest).mockReturnValue({
 allowed: true,
 });

 vi.mocked(AuthSeparation.extractToken).mockReturnValue('test-token');
 vi.mocked(AuthSeparation.extractUserId).mockReturnValue('user-123');
 vi.mocked(AuthSeparation.checkAuth).mockReturnValue({
 authenticated: true,
 context: { feature: 'legalAi',
 requiresAuth: true,
 authType: 'production',
 userId: 'user-123',
 isAuthenticated: true,
 },
 });

 vi.mocked(DataIsolationLayer.checkAccess).mockReturnValue({
 allowed: true,
 });
  
 const request = new Request('http://localhost/api/legal-ai/citations', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: 'Bearer test-token',
 'X-User-ID': 'user-123',
 },
 body: JSON.stringify({, documentId: 'doc-123',
 documentContent: 'This contract cites 42 U.S.C. § 1983 and Miranda v. Arizona',
 documentType: 'contract',
 }),
 });
  
 const response = await POST({ request } as any);

 // Verify response
 expect(response.status).toBe(200);
 const data = await response.json();
 expect(data.id).toBeDefined();
 expect(data.documentId).toBe('doc-123');
 expect(data.citations).toBeDefined();
 expect(Array.isArray(data.citations)).toBe(true);
 expect(data.citations.length).toBeGreaterThan(0);
 expect(data.totalCitations).toBe(data.citations.length);
 expect(data.userId).toBe('user-123');

 // Verify logging
 expect(featureLogger.logLegalAi).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'extract_citations',
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
 const request = new Request('http://localhost/api/legal-ai/citations', {
 method: 'POST',
 body: JSON.stringify({, documentId: 'doc-123',
 documentContent: 'Test content',
 }),
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
 authenticated: false, status: 401, message: 'production authentication required',
 context: { feature: 'legalAi',
 requiresAuth: true,
 authType: 'production',
 isAuthenticated: false,
 },
 });JSON.stringify({ error: 'production authentication required' }) => { status: 401 }
 );

 vi.mocked(AuthSeparation.createAuthErrorResponse).mockReturnValue(errorResponse);

 // Create request
 const request = new Request('http://localhost/api/legal-ai/citations', {
 method: 'POST',
 body: JSON.stringify({, documentId: 'doc-123',
 documentContent: 'Test content',
 }),
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
 context: { feature: 'legalAi',
 requiresAuth: true,
 authType: 'production',
 userId: 'user-123',
 isAuthenticated: true,
 },
 });

 vi.mocked(DataIsolationLayer.checkAccess).mockReturnValue({
 allowed: false,
 });
  
 const request = new Request('http://localhost/api/legal-ai/citations', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: 'Bearer test-token',
 'X-User-ID': 'user-123',
 },
 body: JSON.stringify({, documentId: 'doc-123',
 documentContent: 'Test content',
 }),
 });
  
 const response = await POST({ request } as any);

 // Verify response
 expect(response.status).toBe(403);
 const data = await response.json();
 expect(data.error).toBe('Data access denied');
 });

 it('should return 400 when documentId is missing', async () => {
 // Setup mocks
 vi.mocked(FeatureFlagEnforcer.checkRequest).mockReturnValue({
 allowed: true,
 });

 vi.mocked(AuthSeparation.extractToken).mockReturnValue('test-token');
 vi.mocked(AuthSeparation.extractUserId).mockReturnValue('user-123');
 vi.mocked(AuthSeparation.checkAuth).mockReturnValue({
 authenticated: true,
 context: { feature: 'legalAi',
 requiresAuth: true,
 authType: 'production',
 userId: 'user-123',
 isAuthenticated: true,
 },
 });

 vi.mocked(DataIsolationLayer.checkAccess).mockReturnValue({
 allowed: true,
 });
  
 const request = new Request('http://localhost/api/legal-ai/citations', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: 'Bearer test-token',
 'X-User-ID': 'user-123',
 },
 body: JSON.stringify({, documentContent: 'Test content' }),
 });
  
 const response = await POST({ request } as any);

 // Verify response
 expect(response.status).toBe(400);
 const data = await response.json();
 expect(data.error).toContain('documentId and documentContent are required');
 });

 it('should handle errors gracefully', async () => {
 // Setup mocks
 vi.mocked(FeatureFlagEnforcer.checkRequest).mockImplementation(() => {
 throw new Error('Test error');
 });
  
 const request = new Request('http://localhost/api/legal-ai/citations', {
 method: 'POST',
 body: JSON.stringify({, documentId: 'doc-123',
 documentContent: 'Test content',
 }),
 });
  
 const response = await POST({ request } as any);

 // Verify response
 expect(response.status).toBe(500);
 const data = await response.json();
 expect(data.error).toBe('Failed to extract citations');
 });
 });

 describe('PUT /api/legal-ai/authorities', () => {
 it('should map authorities when feature is enabled and authenticated', async () => {
 // Setup mocks
 vi.mocked(FeatureFlagEnforcer.checkRequest).mockReturnValue({
 allowed: true,
 });

 vi.mocked(AuthSeparation.extractToken).mockReturnValue('test-token');
 vi.mocked(AuthSeparation.extractUserId).mockReturnValue('user-123');
 vi.mocked(AuthSeparation.checkAuth).mockReturnValue({
 authenticated: true,
 context: { feature: 'legalAi',
 requiresAuth: true,
 authType: 'production',
 userId: 'user-123',
 isAuthenticated: true,
 },
 });

 vi.mocked(DataIsolationLayer.checkAccess).mockReturnValue({
 allowed: true,
 });
  
 const request = new Request('http://localhost/api/legal-ai/authorities', {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json',
 Authorization: 'Bearer test-token',
 'X-User-ID': 'user-123',
 },
 body: JSON.stringify({, citationIds: ['citation_1', 'citation_2'],
 }),
 });
  
 const response = await PUT({ request } as any);

 // Verify response
 expect(response.status).toBe(200);
 const data = await response.json();
 expect(data.id).toBeDefined();
 expect(data.authorities).toBeDefined();
 expect(Array.isArray(data.authorities)).toBe(true);
 expect(data.authorities.length).toBeGreaterThan(0);
 expect(data.relationships).toBeDefined();
 expect(Array.isArray(data.relationships)).toBe(true);
 expect(data.userId).toBe('user-123');

 // Verify logging
 expect(featureLogger.logLegalAi).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'map_authorities',
 userId: 'user-123',
 })
 );
 });

 it('should return 400 when citationIds is empty', async () => {
 // Setup mocks
 vi.mocked(FeatureFlagEnforcer.checkRequest).mockReturnValue({
 allowed: true,
 });

 vi.mocked(AuthSeparation.extractToken).mockReturnValue('test-token');
 vi.mocked(AuthSeparation.extractUserId).mockReturnValue('user-123');
 vi.mocked(AuthSeparation.checkAuth).mockReturnValue({
 authenticated: true,
 context: { feature: 'legalAi',
 requiresAuth: true,
 authType: 'production',
 userId: 'user-123',
 isAuthenticated: true,
 },
 });

 vi.mocked(DataIsolationLayer.checkAccess).mockReturnValue({
 allowed: true,
 });
  
 const request = new Request('http://localhost/api/legal-ai/authorities', {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json',
 Authorization: 'Bearer test-token',
 'X-User-ID': 'user-123',
 },
 body: JSON.stringify({, citationIds: [] }),
 });
  
 const response = await PUT({ request } as any);

 // Verify response
 expect(response.status).toBe(400);
 const data = await response.json();
 expect(data.error).toContain('citationIds array is required and must not be empty');
 });
 });

 describe('GET /api/legal-ai/reports', () => {
 it('should get reports when feature is enabled and authenticated', async () => {
 // Setup mocks
 vi.mocked(FeatureFlagEnforcer.checkRequest).mockReturnValue({
 allowed: true,
 });

 vi.mocked(AuthSeparation.extractToken).mockReturnValue('test-token');
 vi.mocked(AuthSeparation.extractUserId).mockReturnValue('user-123');
 vi.mocked(AuthSeparation.checkAuth).mockReturnValue({
 authenticated: true,
 context: { feature: 'legalAi',
 requiresAuth: true,
 authType: 'production',
 userId: 'user-123',
 isAuthenticated: true,
 },
 });

 vi.mocked(DataIsolationLayer.checkAccess).mockReturnValue({
 allowed: true,
 });
  
 const request = new Request('http://localhost/api/legal-ai/reports?limit=10&offset=0', {
 method: 'GET',
 headers: { Authorization: 'Bearer test-token',
 'X-User-ID': 'user-123',
 },
 });
  
 const response = await GET({ request } as any);

 // Verify response
 expect(response.status).toBe(200);
 const data = await response.json();
 expect(data.reports).toBeDefined();
 expect(Array.isArray(data.reports)).toBe(true);
 expect(data.total).toBeDefined();
 expect(data.limit).toBe(10);
 expect(data.offset).toBe(0);

 // Verify logging
 expect(featureLogger.logLegalAi).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'get_reports',
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
 context: { feature: 'legalAi',
 requiresAuth: true,
 authType: 'production',
 userId: 'user-123',
 isAuthenticated: true,
 },
 });

 vi.mocked(DataIsolationLayer.checkAccess).mockReturnValue({
 allowed: true,
 });
  
 const request = new Request('http://localhost/api/legal-ai/reports?limit=5&offset=10', {
 method: 'GET',
 headers: { Authorization: 'Bearer test-token',
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

 it('should return 401 when authentication fails', async () => {
 // Setup mocks
 vi.mocked(FeatureFlagEnforcer.checkRequest).mockReturnValue({
 allowed: true,
 });

 vi.mocked(AuthSeparation.extractToken).mockReturnValue(undefined);
 vi.mocked(AuthSeparation.extractUserId).mockReturnValue(undefined);
 vi.mocked(AuthSeparation.checkAuth).mockReturnValue({
 authenticated: false, status: 401, message: 'production authentication required',
 context: { feature: 'legalAi',
 requiresAuth: true,
 authType: 'production',
 isAuthenticated: false,
 },
 });JSON.stringify({ error: 'production authentication required' }) => { status: 401 }
 );

 vi.mocked(AuthSeparation.createAuthErrorResponse).mockReturnValue(errorResponse);

 // Create request
 const request = new Request('http://localhost/api/legal-ai/reports', {
 method: 'GET',
 });
  
 const response = await GET({ request } as any);

 // Verify response
 expect(response.status).toBe(401);
 });
 });
});



