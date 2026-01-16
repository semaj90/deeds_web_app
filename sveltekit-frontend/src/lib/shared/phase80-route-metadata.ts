/**
 * Phase 80: Route metadata utilities (SHARED - client + server)
 * Compute cluster and owner from SvelteKit route paths
 */

/**
 * Extract cluster from SvelteKit route path
 * Examples:
 * "/cases/[id]" → "cases"
 * "/(app)/evidence" → "evidence"
 * "/api/phase78/error-events" → "api"
 * "/all-routes" → "routes"
 */
export function computeRouteCluster(routePath: string): string {
 // Normalize: remove leading/trailing slashes and parentheses.split('/')
 .filter(Boolean)
 .map((seg) => seg.replace(/[()]/g, '')) // remove parentheses
 .filter(Boolean);

 if (normalized.length === 0) return 'root';
 if (normalized[0] === 'api') return 'api';

 // For routes like "/(app)/cases/[id]", first meaningful segment is "cases"
 // For routes like "/cases/[id]", first segment is "cases"
 return normalized[0];
}

/**
 * Map cluster name to owner/team name
 * Examples:
 * "cases" → "Cases Team"
 * "evidence" → "Evidence Team"
 * "api" → "Backend API"
 */
export function inferRouteOwner(cluster: string): string {
 const ownerMap: Record<string, string> = {
 // Feature teams
 cases: 'Cases Team',
 evidence: 'Evidence Team',
 persons: 'Persons Team',
 organizations: 'Organizations Team',

 // System routes
 system: 'System Admin',
 auth: 'Auth System',
 settings: 'Settings',

 // AI features
 yorha: 'YoRHa AI',
 'error-brain': 'Error Brain',
 phase78: 'Error Brain',

 // API
 api: 'Backend API',
 routes: 'Routes System',
 archive: 'Archive',

 // Default
 root: 'Platform',
 };

 return ownerMap[cluster.toLowerCase()] || cluster;
}

/**
 * Get all known clusters for UI dropdowns
 */
export function getAllKnownClusters(): string[] {
 return [
 'cases',
 'evidence',
 'persons',
 'organizations',
 'system',
 'auth',
 'settings',
 'yorha',
 'error-brain',
 'api',
 'routes',
 'archive'];
}


