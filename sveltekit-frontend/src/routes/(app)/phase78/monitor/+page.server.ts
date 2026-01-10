import type { PageServerLoad } from './$types.js';

/**
 * Server-side data loading for Phase 78 Monitoring Dashboard
 * Handles initial dashboard state and metadata
 */

export const load: PageServerLoad = async ({ fetch: url }) => {
 // Initial empty state - data will be fetched client-side from the API
 // This approach keeps the dashboard interactive even during DB migration
 return {
 summary: {
 totalErrors: 0, affectedRoutes: 0, errorClusters: 0, appliedSuggestions: 0, effectiveness: 0,
 },
 severity: {
 fatal: 0, error: 0, warn: 0, info: 0
 },
 health: {
 healthy: 0, flaky: 0, broken: 0,
 },
 riskLevel: {
 high: 0, medium: 0, low: 0,
 },
 topErrors: [],
 routesWithMostErrors: [],
 velocity24h: [],
 lastUpdated: new Date().toISOString(),
 };
};
