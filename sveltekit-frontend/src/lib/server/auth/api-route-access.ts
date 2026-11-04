import { isAdminRole } from '$lib/server/auth-utils.js';

const PUBLIC_API_PREFIXES = [
	'/api/health',
	'/api/auth',
	'/api/metrics',
	'/api/ping',
	'/api/infrastructure',
	'/api/docs',
	'/api/glossary',
	'/api/statutes',
	'/api/opencode-dispatch',
] as const;

const ADMIN_API_PREFIXES = [
	'/api/admin',
	'/api/codebase-index',
	'/api/codebase',
	'/api/phase89',
	'/api/phase72',
	'/api/phase82',
	'/api/error-brain',
	'/api/errors',
	'/api/internal',
	'/api/cache',
	'/api/consolidation',
	'/api/gpu',
	'/api/gpu-wasm',
	'/api/indexing',
	'/api/pipeline',
	'/api/qlora',
	'/api/rabbitmq',
	'/api/security',
	'/api/topology',
	'/api/worker',
	'/api/generate-cluster',
	'/api/tools',
	'/api/system',
	'/api/ollama',
	'/api/test',
	'/api/graph/hypergraph',
	'/api/mcp',
	'/api/atlas',
] as const;

export type ApiRouteAccessDenial = {
	status: 401 | 403;
	error: 'Authentication required' | 'Admin access required';
};

function matchesPathPrefix(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPublicApiPath(pathname: string): boolean {
	return PUBLIC_API_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}

export function evaluateApiRouteAccess(
	pathname: string,
	user: { role?: unknown } | null | undefined
): ApiRouteAccessDenial | null {
	if (!pathname.startsWith('/api/') || isPublicApiPath(pathname)) return null;
	if (!user) return { status: 401, error: 'Authentication required' };

	const requiresAdmin = ADMIN_API_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
	if (requiresAdmin && !isAdminRole(user.role)) {
		return { status: 403, error: 'Admin access required' };
	}

	return null;
}
