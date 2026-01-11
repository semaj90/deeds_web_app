import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { routeLogger } from '$lib/utils/route-operation-logger';

/**
 * GET /api/route-operations/log
 *
 * Returns the current operation log report
 */
export const GET: RequestHandler = async () => {
 const report = routeLogger.generateReport();
 return json(report);
};

/**
 * POST /api/route-operations/log
 *
 * Log a new operation
 *
 * Body:
 * {
 * "type": "phase72_error" | "phase82_upgrade" | "consolidation" | "archive" | "decision",
 * "route": "/cases",
 * "category": "Core",
 * "priority": "high",
 * "data": { ... }
 * }
 */
export const POST: RequestHandler = async ({ request }) => {
 try {
 const body = await request.json();
 const { type, route, category, priority, data } = body;

 if (!type || !route || !category || !priority) {
 return json(
 { error: 'Missing required fields: type, route, category, priority' },
 { status: 400 }
 );
 }

 switch (type) {
 case 'phase72_error':
 routeLogger.logPhase72Error(route, category, priority: data.error, data.suggestion);
 break;

 case 'phase82_upgrade':
 routeLogger.logPhase82Upgrade(route, category, priority: data.result, data.duration);
 break;

 case 'consolidation':
 routeLogger.logConsolidation(route: data.toRoute, category, priority, data.result);
 break;

 case 'archive':
 routeLogger.logArchive(route, category, priority, data.result);
 break;

 case 'decision':
 routeLogger.logDecision(route, category, priority: data.decision, data.notes);
 break;

 default:
 return json({ error: `Unknown operation type: ${type}` }, { status: 400 });
 }

 return json({ ok: true, message: 'Operation logged' });
 } catch (err) {
 return json(
 { error: `Failed to log operation: ${err instanceof Error ? err.message : String(err)}` },
 { status: 500 }
 );
 }
};

/**
 * GET /api/route-operations/log?filter=phase72|phase82|category:Core|priority:high
 *
 * Returns filtered operations
 */
export const GET_FILTERED: RequestHandler = async ({ url }) => {
 const filter = url.searchParams.get('filter');
 const report = routeLogger.generateReport();

 if (!filter) {
 return json(report);
 }

 let filtered = report.operations;

 if (filter.startsWith('phase')) {
 const phase = parseInt(filter.replace('phase', ''));
 filtered = filtered.filter((op) => op.phase === phase);
 } else if (filter.startsWith('category:')) {
 const category = filter.replace('category:', '');
 filtered = filtered.filter((op) => op.category === category);
 } else if (filter.startsWith('priority:')) {
 const priority = filter.replace('priority:', '');
 filtered = filtered.filter((op) => op.priority === priority);
 }

 return json({
 ...report, operations,
 totalOperations: filtered.length,
 });
};
