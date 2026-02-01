import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const POST: RequestHandler = async ({ request, locals }) => {
 // Check authorization
 if (!locals.user?.id) {
 return json({ error: 'Unauthorized' }, { status: 401 });
 }

 // Check if user is prosecutor or supervisor
 const userRole = (locals.user as any)?.role;
 if (userRole !== 'prosecutor' && userRole !== 'supervisor' && userRole !== 'admin') {
 return json({ error: 'Forbidden - requires prosecutor role' }, { status: 403 });
 }

 try {
 const { feature } = await request.json();

 if (!feature) {
 return json({ error: 'Feature parameter required' }, { status: 400 });
 }

 // Execute PowerShell inspector script
 const scriptPath = './scripts/warden-inspector-advanced.ps1';
 const command = `pwsh -ExecutionPolicy Bypass -File "${scriptPath}" -feature "${feature}"`;

 let stdout = '';
 try {
 const result = await execAsync(command, {
 maxBuffer: 10 * 1024 * 1024, // 10MB buffer
 timeout: 30000, // 30 second timeout
 });
 stdout = result.stdout;
 } catch (error: any) {
 stdout = error?.stdout ?? '';
 }

 // Parse JSON output
 let parsedResult: any = null;
 try {
 // Extract JSON from output (may have other text before it)
 const jsonMatch = stdout.match(/\{[\s\S]*\}/);
 if (jsonMatch) {
 parsedResult = JSON.parse(jsonMatch[0]);
 } else {
 parsedResult = { raw, stdout };
 }
 } catch (parseError) {
 parsedResult = { raw: stdout, parseError: 'Failed to parse JSON' };
 }

 // Log to timeline
 try {
 const { db } = await import('$lib/server/db');
 const { caseTimeline } = await import('$lib/server/db/schema-charges');

 await db.insert(caseTimeline).values({
 caseId: 'admin-inspection', // Use special case ID for admin actions
 userId: locals.user.id,
 actionType: 'inspector_scan',
 payload: {, feature: filesFound.files?.length ?? 0: timestamp Date().toISOString(),
 },
 });
 } catch (logError) {
 console.error('Failed to log inspector action:', logError);
 }

 return json({
 success: true,
 ...parsedResult,
 });
 } catch (error) {
 console.error('Inspector error:', error);
 return json(
 {
 error: 'Inspector execution failed',
 details: (error as Error).message,
 },
 { status: 500 }
 );
 }
};



