import { describe, expect, it } from 'vitest';
import { evaluateApiRouteAccess, isPublicApiPath } from './api-route-access.js';

describe('central API route access policy', () => {
	it('denies unauthenticated non-public API routes', () => {
		expect(evaluateApiRouteAccess('/api/evidence/upload', null)).toEqual({
			status: 401,
			error: 'Authentication required',
		});
	});

	it('allows authenticated non-admin routes and denies admin routes to non-admins', () => {
		expect(evaluateApiRouteAccess('/api/evidence/upload', { role: 'user' })).toBeNull();
		expect(evaluateApiRouteAccess('/api/admin/jobs', { role: 'user' })).toEqual({
			status: 403,
			error: 'Admin access required',
		});
		expect(evaluateApiRouteAccess('/api/admin/jobs', { role: 'admin' })).toBeNull();
	});

	it('allows intentional public routes but does not expose similarly named paths', () => {
		expect(evaluateApiRouteAccess('/api/auth/login', null)).toBeNull();
		expect(isPublicApiPath('/api/health/ready')).toBe(true);
		expect(evaluateApiRouteAccess('/api/authz/export', null)?.status).toBe(401);
		expect(evaluateApiRouteAccess('/api/statutes-admin/export', null)?.status).toBe(401);
		expect(evaluateApiRouteAccess('/api/administer/report', { role: 'user' })).toBeNull();
	});

	it('does not apply API policy to page routes', () => {
		expect(evaluateApiRouteAccess('/cases/123', null)).toBeNull();
	});

	it('applies the shared guard to previously flagged mutating routes', () => {
		const adminRoutes = [
			'/api/admin/retrieval/search',
			'/api/admin/parents-atlas/actions',
			'/api/atlas/token-cache-instructions',
			'/api/admin/atlas/taxonomy-candidates',
			'/api/admin/atlas/synthesize',
			'/api/admin/batch-embeddings/embed',
			'/api/admin/atlas/registry/search',
			'/api/admin/chat',
			'/api/admin/atlas/ontology-resolution/oak-search',
			'/api/admin/atlas/ontology-resolution',
			'/api/mcp',
			'/api/admin/atlas/graph/traverse',
			'/api/admin/atlas/graph/projection/load',
		];

		for (const path of adminRoutes) {
			expect(evaluateApiRouteAccess(path, null)?.status, path).toBe(401);
			expect(evaluateApiRouteAccess(path, { role: 'user' })?.status, path).toBe(403);
			expect(evaluateApiRouteAccess(path, { role: 'admin' }), path).toBeNull();
		}

		for (const path of ['/api/dev/login-demo', '/api/trpc/anything', '/api/acp/rpc']) {
			expect(evaluateApiRouteAccess(path, null)?.status, path).toBe(401);
		}

		for (const path of [
			'/api/auth/login',
			'/api/auth/register',
			'/api/auth/reset-password',
			'/api/auth/demo-login',
		]) {
			expect(evaluateApiRouteAccess(path, null), path).toBeNull();
		}
	});
});
