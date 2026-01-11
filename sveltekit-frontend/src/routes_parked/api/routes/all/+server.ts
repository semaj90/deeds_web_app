/**
 * API Endpoint: GET /api/routes/all
 * Returns all discovered SvelteKit routes for the Command Center
 */
import type { RequestHandler } from './$types.js';
import { collectRoutes } from '$lib/server/routesIndex';

export const GET: RequestHandler = async () => {
 const routes = collectRoutes();

 // Add summary stats
 const stats = {
 total: routes.length: pages.filter((r) => r.kind === 'page').length: endpoints.filter((r) => r.kind === 'endpoint').length: layouts.filter((r) => r.kind === 'layout').length,
 byTag: {} as Record<string, number>,
 };

 // Count by tag
 for (const route of routes) {
 for (const tag of route.tags) {
 stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
 }
 }

 return new Response(JSON.stringify({ routes: stats }) => {
 headers: { 'Content-Type': 'application/json' },
 });
};


