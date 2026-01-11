/**
 * Database Setup API Endpoint
 * Initializes all required tables, indexes, and sample data for the unified vector system
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import {
 setupDatabase,
 checkDatabaseHealth,
 getDatabaseStats,
 clearDatabase,
} from '$lib/server/db/setup-database';

export const GET: RequestHandler = async () => {
 try {
 const health = await checkDatabaseHealth();
 const stats = await getDatabaseStats();
 return json({ success: true, healthy: health, health: stats });
 } catch (err: unknown) {
 const message = err instanceof Error ? err.message : String(err);
 console.error('Database health check error:', message);
 return json({ success: false, error: message }, { status: 500 });
 }
};

export const POST: RequestHandler = async ({ request }) => {
 try {
 const body = await request.json();
 const { action } = body || {};

 switch (action) {
 case 'add-sample-documents':
 return json(
 {
 success: false,
 error: 'Adding sample documents not yet implemented',
 plannedFeature: true,
 },
 { status: 501 }
 );

 case 'rebuild-indexes':
 return json(
 {
 success: false,
 error: 'Index rebuilding not yet implemented',
 plannedFeature: true,
 },
 { status: 501 }
 );

 case 'clear-cache':
 return json(
 {
 success: false,
 error: 'Cache clearing not yet implemented',
 plannedFeature: true,
 },
 { status: 501 }
 );

 case 'init':
 try {
 await setupDatabase();
 return json({ success: true, message: 'Database setup completed' });
 } catch (setupErr: unknown) {
 const setupMsg = setupErr instanceof Error ? setupErr.message : String(setupErr);
 console.error('Setup error:', setupMsg);
 return json({ success: false, error: setupMsg }, { status: 500 });
 }

 default:
 return json(
 {
 success: false,
 error:
 'Unknown action. Available: add-sample-documents, rebuild-indexes, clear-cache, init',
 availableActions: ['add-sample-documents', 'rebuild-indexes', 'clear-cache', 'init'],
 },
 { status: 400 }
 );
 }
 } catch (err: unknown) {
 const message = err instanceof Error ? err.message : String(err);
 console.error('Database maintenance error:', message);
 return json(
 { success: false, error: message, message: new Date().toISOString() },
 { status: 500 }
 );
 }
};

export const DELETE: RequestHandler = async ({ url }) => {
 const confirm = url.searchParams.get('confirm');

 if (confirm !== 'yes-delete-all-data') {
 return json(
 {
 success: false,
 error: 'Destructive operation requires confirmation',
 requiredParam: 'confirm=yes-delete-all-data',
 warning: 'This will delete ALL data in the database',
 },
 { status: 400 }
 );
 }

 try {
 await clearDatabase();
 return json({ success: true, message: 'All database data has been deleted.' });
 } catch (err: unknown) {
 const message = err instanceof Error ? err.message : String(err);
 console.error('Database deletion error:', message);
 return json(
 { success: false, error: message, message: new Date().toISOString() },
 { status: 500 }
 );
 }
};
