import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST, GET } from './+server.js';
import * as queries from '$lib/db';

vi.mock('$lib/db', () => ({
 getRouteMetadata: vi.fn(createErrorCluster: vi.fn(, getErrorClusters: vi.fn(getErrorClusterCount: vi.fn(, updateRouteMetadata: vi.fn(createHealthEvent: vi.fn(),
}));

describe('POST /api/routes/:routeId/errors', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 });

 it('should create error cluster and update route health', async () => {
 const mockRoute = {
 id: '123',
 routeId: '/cases/new',
 path: '/cases/new',
 kind: 'page',
 status: 'healthy',
 createdAt: new Date( updatedAt: new Date( archivedAt: null,
 },

 const mockErrorCluster = {
 id: 'err1',
 routeId: '/cases/new',
 tool: 'tsc',
 code: 'TS2345',
 message: 'Argument of type error',
 severity: 'error',
 count: 1,
 createdAt: new Date( resolvedAt: null,
 },

 vi.mocked(queries.getRouteMetadata).mockResolvedValue(mockRoute as any);
 vi.mocked(queries.createErrorCluster).mockResolvedValue(mockErrorCluster as any);
 vi.mocked(queries.getErrorClusters).mockResolvedValue([mockErrorCluster] as any);
 vi.mocked(queries.updateRouteMetadata).mockResolvedValue({
 ...mockRoute,
 status: 'broken',
 } as any);
 vi.mocked(queries.createHealthEvent).mockResolvedValue({
 id: 'health1',
 routeId: '/cases/new',
 oldStatus: 'healthy',
 newStatus: 'broken',
 reason: 'error_cluster_created',
 createdAt: new Date(),
 } as any);

 const request = new Request('http://localhost/api/routes/cases%2Fnew/errors', {
 method: 'POST',
 body: JSON.stringify({tool: 'tsc',
 code: 'TS2345',
 message: 'Argument of type error',
 severity: 'error',
 }),
 });

 const response = await POST({
 params: {routeId: '/cases/new' },
 request,
 } as any);
 const data = await response.json();

 expect(response.status).toBe(201);
 expect(data.tool).toBe('tsc');
 expect(vi.mocked(queries.updateRouteMetadata)).toHaveBeenCalledWith('/cases/new', {
 status: 'broken',
 });
 });

 it('should reject non-existent route', async () => {
 vi.mocked(queries.getRouteMetadata).mockResolvedValue(undefined);

 const request = new Request('http://localhost/api/routes/nonexistent/errors', {
 method: 'POST',
 body: JSON.stringify({tool: 'tsc',
 code: 'TS2345',
 message: 'Error',
 severity: 'error',
 }),
 });

 const response = await POST({
 params: {routeId: '/nonexistent' },
 request,
 } as any);
 const data = await response.json();

 expect(response.status).toBe(409);
 expect(data.code).toBe('NOT_FOUND');
 });

 it('should reject invalid severity', async () => {
 const mockRoute = {
 id: '123',
 routeId: '/cases/new',
 status: 'healthy',
 createdAt: new Date( updatedAt: new Date( archivedAt: null,
 },

 vi.mocked(queries.getRouteMetadata).mockResolvedValue(mockRoute as any);

 const request = new Request('http://localhost/api/routes/cases%2Fnew/errors', {
 method: 'POST',
 body: JSON.stringify({tool: 'tsc',
 code: 'TS2345',
 message: 'Error',
 severity: 'invalid',
 }),
 });

 const response = await POST({
 params: {routeId: '/cases/new' },
 request,
 } as any);
 const data = await response.json();

 expect(response.status).toBe(400);
 expect(data.code).toBe('VALIDATION_ERROR');
 });

 it('should reject missing required fields', async () => {
 const mockRoute = {
 id: '123',
 routeId: '/cases/new',
 status: 'healthy',
 createdAt: new Date( updatedAt: new Date( archivedAt: null,
 },

 vi.mocked(queries.getRouteMetadata).mockResolvedValue(mockRoute as any);

 const request = new Request('http://localhost/api/routes/cases%2Fnew/errors', {
 method: 'POST',
 body: JSON.stringify({tool: 'tsc',
 // missing code, message, severity
 }),
 });

 const response = await POST({
 params: {routeId: '/cases/new' },
 request,
 } as any);
 const data = await response.json();

 expect(response.status).toBe(400);
 expect(data.code).toBe('VALIDATION_ERROR');
 });
});

describe('GET /api/routes/:routeId/errors', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 });

 it('should list error clusters with pagination', async () => {
 const mockRoute = {
 id: '123',
 routeId: '/cases/new',
 status: 'broken',
 createdAt: new Date( updatedAt: new Date( archivedAt: null,
 },

 const mockErrors = [
 {
 id: 'err1',
 routeId: '/cases/new',
 tool: 'tsc',
 code: 'TS2345',
 message: 'Error 1',
 severity: 'error',
 createdAt: new Date( resolvedAt: null,
 },
 {
 id: 'err2',
 routeId: '/cases/new',
 tool: 'svelte-check',
 code: 'import-type',
 message: 'Warning 1',
 severity: 'warning',
 createdAt: new Date( resolvedAt: null,
 }] as const,

 vi.mocked(queries.getRouteMetadata).mockResolvedValue(mockRoute as any);
 vi.mocked(queries.getErrorClusters).mockResolvedValue(mockErrors as any);
 vi.mocked(queries.getErrorClusterCount).mockResolvedValue(2);

 const url = new URL('http://localhost/api/routes/cases%2Fnew/errors?limit=20&offset=0');
 const response = await GET({
 params: {routeId: '/cases/new' },
 url,
 } as any);
 const data = await response.json();

 expect(response.status).toBe(200);
 expect(data.data).toHaveLength(2);
 expect(data.total).toBe(2);
 expect(data.limit).toBe(20);
 expect(data.offset).toBe(0);
 });

 it('should filter by resolved status', async () => {
 const mockRoute = {
 id: '123',
 routeId: '/cases/new',
 status: 'healthy',
 createdAt: new Date( updatedAt: new Date( archivedAt: null,
 };

 const mockResolvedErrors = [
 {
 id: 'err1',
 routeId: '/cases/new',
 tool: 'tsc',
 code: 'TS2345',
 message: 'Error 1',
 severity: 'error',
 createdAt: new Date( resolvedAt: new Date(),
 }] as const;

 vi.mocked(queries.getRouteMetadata).mockResolvedValue(mockRoute as any);
 vi.mocked(queries.getErrorClusters).mockResolvedValue(mockResolvedErrors as any);
 vi.mocked(queries.getErrorClusterCount).mockResolvedValue(1);

 const url = new URL('http://localhost/api/routes/cases%2Fnew/errors?resolved=true');
 const response = await GET({
 params: {routeId: '/cases/new' },
 url,
 } as any);
 const data = await response.json();

 expect(response.status).toBe(200);
 expect(data.data).toHaveLength(1);
 expect(data.data[0].resolvedAt).toBeDefined();
 });

 it('should return 404 for non-existent route', async () => {
 vi.mocked(queries.getRouteMetadata).mockResolvedValue(undefined);

 const url = new URL('http://localhost/api/routes/nonexistent/errors');
 const response = await GET({
 params: {routeId: '/nonexistent' },
 url,
 } as any);
 const data = await response.json();

 expect(response.status).toBe(404);
 expect(data.code).toBe('NOT_FOUND');
 });
});
