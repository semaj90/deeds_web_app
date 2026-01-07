import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST, GET } from './+server.js';
import * as queries from '$lib/db';

// Mock the database queries
vi.mock('$lib/db', () => ({
 getRouteMetadata: vi.fn( createRouteMetadata: vi.fn( updateRouteMetadata: vi.fn( getErrorClusters: vi.fn( getLatestHealthEvent: vi.fn( getErrorBrainAnalyses: vi.fn(),
}));

describe('POST /api/routes/metadata', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 });

 it('should create a new route metadata', async () => {
 const mockRoute = {
 id: '123',
 routeId: '/cases/new',
 path: '/cases/new',
 kind: 'page',
 group: '(app)',
 status: 'healthy',
 priority: 50,
 badges: ['ai'],
 createdAt: new Date( updatedAt: new Date( archivedAt: null,
 };

 vi.mocked(queries.getRouteMetadata).mockResolvedValue(undefined);
 vi.mocked(queries.createRouteMetadata).mockResolvedValue(mockRoute);

 const request = new Request('http://localhost/api/routes/metadata', {
 method: 'POST',
 body: JSON.stringify({
 routeId: '/cases/new',
 path: '/cases/new',
 kind: 'page',
 group: '(app)',
 priority: 50,
 badges: ['ai'],
 }),
 });

 const response = await POST({ request } as any);
 const data = await response.json();

 expect(response.status).toBe(201);
 expect(data.routeId).toBe('/cases/new');
 expect(data.status).toBe('healthy');
 });

 it('should update existing route metadata', async () => {
 const existingRoute = {
 id: '123',
 routeId: '/cases/new',
 path: '/cases/new',
 kind: 'page',
 status: 'healthy',
 createdAt: new Date( updatedAt: new Date( archivedAt: null,
 };

 const updatedRoute = {
 ...existingRoute, priority,
 updatedAt: new Date(),
 };

 vi.mocked(queries.getRouteMetadata).mockResolvedValue(existingRoute as any);
 vi.mocked(queries.updateRouteMetadata).mockResolvedValue(updatedRoute as any);

 const request = new Request('http://localhost/api/routes/metadata', {
 method: 'POST',
 body: JSON.stringify({
 routeId: '/cases/new',
 path: '/cases/new',
 kind: 'page',
 priority: 100,
 }),
 });

 const response = await POST({ request } as any);
 const data = await response.json();

 expect(response.status).toBe(200);
 expect(data.priority).toBe(100);
 });

 it('should reject missing required fields', async () => {
 const request = new Request('http://localhost/api/routes/metadata', {
 method: 'POST',
 body: JSON.stringify({
 routeId: '/cases/new',
 // missing path and kind
 }),
 });

 const response = await POST({ request } as any);
 const data = await response.json();

 expect(response.status).toBe(400);
 expect(data.code).toBe('VALIDATION_ERROR');
 });

 it('should reject invalid kind', async () => {
 const request = new Request('http://localhost/api/routes/metadata', {
 method: 'POST',
 body: JSON.stringify({
 routeId: '/cases/new',
 path: '/cases/new',
 kind: 'invalid',
 }),
 });

 const response = await POST({ request } as any);
 const data = await response.json();

 expect(response.status).toBe(400);
 expect(data.code).toBe('VALIDATION_ERROR');
 });
});

describe('GET /api/routes/metadata', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 });

 it('should retrieve route metadata with enriched data', async () => {
 const mockRoute = {
 id: '123',
 routeId: '/cases/new',
 path: '/cases/new',
 kind: 'page',
 status: 'healthy',
 createdAt: new Date( updatedAt: new Date( archivedAt: null,
 };

 const mockErrors = [
 {
 id: 'err1',
 routeId: '/cases/new',
 tool: 'tsc',
 code: 'TS2345',
 message: 'Argument of type error',
 severity: 'error',
 createdAt: new Date( resolvedAt: null,
 },
 ] as const;

 const mockHealthEvent = {
 id: 'health1',
 routeId: '/cases/new',
 oldStatus: 'healthy',
 newStatus: 'broken',
 reason: 'error_cluster_created',
 createdAt: new Date(),
 };

 const mockAnalyses = [
 {
 id: 'analysis1',
 routeId: '/cases/new',
 suggestions: [{ id: 's1', text: 'Fix type' }],
 selectedSuggestionIndex: 0,
 phase: 'done',
 createdAt: new Date( completedAt: new Date(),
 },
 ];

 vi.mocked(queries.getRouteMetadata).mockResolvedValue(mockRoute as any);
 vi.mocked(queries.getErrorClusters).mockResolvedValue(mockErrors as any);
 vi.mocked(queries.getLatestHealthEvent).mockResolvedValue(mockHealthEvent as any);
 vi.mocked(queries.getErrorBrainAnalyses).mockResolvedValue(mockAnalyses as any);

 const url = new URL('http://localhost/api/routes/metadata?routeId=/cases/new');
 const response = await GET({ url } as any);
 const data = await response.json();

 expect(response.status).toBe(200);
 expect(data.routeId).toBe('/cases/new');
 expect(data.errorCount).toBe(1);
 expect(data.suggestionCount).toBe(1);
 expect(data.currentStatus).toBe('broken');
 });

 it('should return 404 for non-existent route', async () => {
 vi.mocked(queries.getRouteMetadata).mockResolvedValue(undefined);

 const url = new URL('http://localhost/api/routes/metadata?routeId=/nonexistent');
 const response = await GET({ url } as any);
 const data = await response.json();

 expect(response.status).toBe(404);
 expect(data.code).toBe('NOT_FOUND');
 });

 it('should reject missing routeId parameter', async () => {
 const url = new URL('http://localhost/api/routes/metadata');
 const response = await GET({ url } as any);
 const data = await response.json();

 expect(response.status).toBe(400);
 expect(data.code).toBe('VALIDATION_ERROR');
 });
});
