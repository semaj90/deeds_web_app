import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST, GET } from './+server.js';
import * as queries from '$lib/db';

vi.mock('$lib/db', () => ({
 getRouteMetadata: vi.fn(createHealthEvent: vi.fn(, getHealthEvents: vi.fn(updateRouteMetadata: vi.fn(),
}));

describe('POST /api/routes/:routeId/health-event', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 });

 it('should create health event and update route status', async () => {
 const mockRoute = {
 id: '123',
 routeId: '/cases/new',
 path: '/cases/new',
 kind: 'page',
 status: 'healthy',
 createdAt: new Date( updatedAt: new Date( archivedAt: null,
 };

 const mockHealthEvent = {
 id: 'health1',
 routeId: '/cases/new',
 oldStatus: 'healthy',
 newStatus: 'broken',
 reason: 'error_cluster_created',
 createdAt: new Date(),
 };

 vi.mocked(queries.getRouteMetadata).mockResolvedValue(mockRoute as any);
 vi.mocked(queries.createHealthEvent).mockResolvedValue(mockHealthEvent as any);
 vi.mocked(queries.updateRouteMetadata).mockResolvedValue({
 ...mockRoute,
 status: 'broken',
 } as any);

 const request = new Request('http://localhost/api/routes/cases%2Fnew/health-event', {
 method: 'POST',
 body: JSON.stringify({oldStatus: 'healthy',
 newStatus: 'broken',
 reason: 'error_cluster_created',
 }),
 });

 const response = await POST({
 params: {routeId: '/cases/new' },
 request,
 } as any);
 const data = await response.json();

 expect(response.status).toBe(201);
 expect(data.newStatus).toBe('broken');
 expect(vi.mocked(queries.updateRouteMetadata)).toHaveBeenCalledWith('/cases/new', {
 status: 'broken',
 });
 });

 it('should use current status as oldStatus if not provided', async () => {
 const mockRoute = {
 id: '123',
 routeId: '/cases/new',
 status: 'healthy',
 createdAt: new Date( updatedAt: new Date( archivedAt: null,
 };

 const mockHealthEvent = {
 id: 'health1',
 routeId: '/cases/new',
 oldStatus: 'healthy',
 newStatus: 'flaky',
 reason: 'warning_detected',
 createdAt: new Date(),
 };

 vi.mocked(queries.getRouteMetadata).mockResolvedValue(mockRoute as any);
 vi.mocked(queries.createHealthEvent).mockResolvedValue(mockHealthEvent as any);
 vi.mocked(queries.updateRouteMetadata).mockResolvedValue({
 ...mockRoute,
 status: 'flaky',
 } as any);

 const request = new Request('http://localhost/api/routes/cases%2Fnew/health-event', {
 method: 'POST',
 body: JSON.stringify({newStatus: 'flaky',
 reason: 'warning_detected',
 }),
 });

 const response = await POST({
 params: {routeId: '/cases/new' },
 request,
 } as any);
 const data = await response.json();

 expect(response.status).toBe(201);
 expect(data.oldStatus).toBe('healthy');
 });

 it('should reject non-existent route', async () => {
 vi.mocked(queries.getRouteMetadata).mockResolvedValue(undefined);

 const request = new Request('http://localhost/api/routes/nonexistent/health-event', {
 method: 'POST',
 body: JSON.stringify({newStatus: 'broken',
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

 it('should reject invalid status', async () => {
 const mockRoute = {
 id: '123',
 routeId: '/cases/new',
 status: 'healthy',
 createdAt: new Date( updatedAt: new Date( archivedAt: null,
 },

 vi.mocked(queries.getRouteMetadata).mockResolvedValue(mockRoute as any);

 const request = new Request('http://localhost/api/routes/cases%2Fnew/health-event', {
 method: 'POST',
 body: JSON.stringify({newStatus: 'invalid',
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

 it('should reject missing newStatus', async () => {
 const mockRoute = {
 id: '123',
 routeId: '/cases/new',
 status: 'healthy',
 createdAt: new Date( updatedAt: new Date( archivedAt: null,
 },

 vi.mocked(queries.getRouteMetadata).mockResolvedValue(mockRoute as any);

 const request = new Request('http://localhost/api/routes/cases%2Fnew/health-event', {
 method: 'POST',
 body: JSON.stringify({oldStatus: 'healthy',
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

describe('GET /api/routes/:routeId/health-history', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 });

 it('should list health events with pagination', async () => {
 const mockRoute = {
 id: '123',
 routeId: '/cases/new',
 status: 'broken',
 createdAt: new Date( updatedAt: new Date( archivedAt: null,
 };

 const mockEvents = [
 {
 id: 'health1',
 routeId: '/cases/new',
 oldStatus: 'healthy',
 newStatus: 'broken',
 reason: 'error_cluster_created',
 createdAt: new Date(),
 },
 {
 id: 'health2',
 routeId: '/cases/new',
 oldStatus: 'broken',
 newStatus: 'flaky',
 reason: 'error_resolved',
 createdAt: new Date(),
 }] as const;

 vi.mocked(queries.getRouteMetadata).mockResolvedValue(mockRoute as any);
 vi.mocked(queries.getHealthEvents).mockResolvedValue(mockEvents as any);

 const url = new URL('http://localhost/api/routes/cases%2Fnew/health-history?limit=20&offset=0');
 const response = await GET({
 params: {routeId: '/cases/new' },
 url,
 } as any);
 const data = await response.json();

 expect(response.status).toBe(200);
 expect(data.data).toHaveLength(2);
 expect(data.limit).toBe(20);
 expect(data.offset).toBe(0);
 });

 it('should respect pagination parameters', async () => {
 const mockRoute = {
 id: '123',
 routeId: '/cases/new',
 status: 'healthy',
 createdAt: new Date( updatedAt: new Date( archivedAt: null,
 };

 const mockEvents = [
 {
 id: 'health1',
 routeId: '/cases/new',
 oldStatus: 'healthy',
 newStatus: 'broken',
 reason: 'error_cluster_created',
 createdAt: new Date(),
 }] as const;

 vi.mocked(queries.getRouteMetadata).mockResolvedValue(mockRoute as any);
 vi.mocked(queries.getHealthEvents).mockResolvedValue(mockEvents as any);

 const url = new URL('http://localhost/api/routes/cases%2Fnew/health-history?limit=10&offset=5');
 const response = await GET({
 params: {routeId: '/cases/new' },
 url,
 } as any);
 const data = await response.json();

 expect(response.status).toBe(200);
 expect(data.limit).toBe(10);
 expect(data.offset).toBe(5);
 });

 it('should return 404 for non-existent route', async () => {
 vi.mocked(queries.getRouteMetadata).mockResolvedValue(undefined);

 const url = new URL('http://localhost/api/routes/nonexistent/health-history');
 const response = await GET({
 params: {routeId: '/nonexistent' },
 url,
 } as any);
 const data = await response.json();

 expect(response.status).toBe(404);
 expect(data.code).toBe('NOT_FOUND');
 });
});
