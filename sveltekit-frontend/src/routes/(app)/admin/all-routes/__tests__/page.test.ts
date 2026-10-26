import { describe, expect, it } from 'vitest';
import { _resolveRouteFields } from '../+page.server.js';
import { astNodeToRouteNode, resolveRouteFields } from '../route-lineage.js';

describe('All Routes Page & AST Node Mapping', () => {
	it('normalizes phase72 routePath and filePath into RouteNode shape with PROVEN lineage', () => {
		expect(_resolveRouteFields).toBe(resolveRouteFields);
		const astNode = {
			id: 'route__app__admin_atlas',
			routePath: '/admin/atlas',
			filePath: 'src/routes/(app)/admin/atlas/+page.svelte',
			kind: 'page',
		};

		const resolved = resolveRouteFields(astNode);
		expect(resolved.ok).toBe(true);
		if (resolved.ok) {
			expect(resolved.rawPath).toBe('/admin/atlas');
			expect(resolved.file).toContain('+page.svelte');
			expect(resolved.source).toBe('route_ast_graph');
			expect(resolved.lineageStatus).toBe('PROVEN');
		}

		const node = astNodeToRouteNode(astNode);
		expect(node).not.toBeNull();
		expect(node?.path).toBe('/admin/atlas');
		expect(node?.group).toBe('(admin)');
		expect(node?.source).toBe('route_ast_graph');
		expect(node?.lineageStatus).toBe('PROVEN');
	});

	it('rejects records missing a valid routePath or path with MISSING_ROUTE_PATH', () => {
		const invalidNode = {
			id: 'orphan_node',
			filePath: 'src/routes/(app)/orphan/+page.svelte',
		};

		const resolved = resolveRouteFields(invalidNode);
		expect(resolved.ok).toBe(false);
		if (!resolved.ok) {
			expect(resolved.reason).toBe('MISSING_ROUTE_PATH');
		}

		expect(astNodeToRouteNode(invalidNode)).toBeNull();
	});

	it('classifies /demos/* and /api/* routes into dedicated groups', () => {
		expect(astNodeToRouteNode({ id: 'd1', routePath: '/demos/webgpu-memory-palace', filePath: 'src/routes/(app)/demos/webgpu-memory-palace/+page.svelte' })?.group).toBe('(demos)');
		expect(astNodeToRouteNode({ id: 'a1', routePath: '/admin/all-routes', filePath: 'src/routes/(app)/admin/all-routes/+page.svelte' })?.group).toBe('(admin)');
		expect(astNodeToRouteNode({ id: 'api1', routePath: '/api/routes/metadata', filePath: 'src/routes/api/routes/metadata/+server.ts' })?.group).toBe('(api)');
	});
});

