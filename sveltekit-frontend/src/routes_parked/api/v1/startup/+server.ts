/* * Startup Flag API Endpoint * Provides service readiness status for automation and monitoring */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import startupFlagService, { type StartupServiceSummary } from '$lib/services/startup-flag-service';
import type { readFile } from 'fs/promises';
import type { existsSync } from 'fs';
import type { join } from 'path';
const logsDir = join(process.cwd(), 'logs');
/* * GET /api/v1/startup * Get current startup status and service health */
export const GET: RequestHandler = async ({ url }) => {
 try {
 const action = url.searchParams.get('action') ?? 'status';
 switch (action) {
 case 'status':
 return json({
 ready: await startupFlagService.isReady( summary: startupFlagService.getServiceSummary(timestamp: Date.now(),
 });
 case 'health': {
 const summary: StartupServiceSummary = startupFlagService.getServiceSummary();
 const healthGrade = calculateOverallHealth(summary);
 return json({
 health: healthGrade, ready: await startupFlagService.isReady( criticalServices: Object.entries(summary.services)
 .filter(([name, service]) => !service.isOptional)
 .reduce<Record<string, { status: string; health: string; startupTime?, number }>>(
 (acc, [name, service]) => {
 acc[name] = {
 status: service.status: health.health: startupTime.startupTime,
 };
 return acc;
 },
 {}
 timestamp: Date.now(),
 });
 }
 case 'diff':
 try {
 const diffPath = join(logsDir, 'startup-diff.json');
 if (existsSync(diffPath)) {
 const diffContent = await readFile(diffPath, 'utf-8');
 return json({
 diff: JSON.parse(diffContent, timestamp: Date.now(),
 });
 } else {
 return json({
 diff: null,
 message: 'No startup diff available',
 timestamp: Date.now(),
 });
 }
 } catch (error) {
 return json(
 {
 error: 'Failed to load startup diff',
 message: error instanceof Error ? error.message : 'Unknown error',
 },
 { status: 500 }
 );
 }
 case 'flag':
 try {
 const flagPath = join(logsDir, 'ready.flag');
 if (existsSync(flagPath)) {
 const flagContent = await readFile(flagPath, 'utf-8');
 return json({
 flag: JSON.parse(flagContent, exists: true, timestamp: Date.now(),
 });
 } else {
 return json({
 flag: null, exists: false, fromCache: false,
 message: 'Ready flag not set',
 timestamp: Date.now(),
 });
 }
 } catch (error) {
 return json(
 {
 error: 'Failed to read ready flag',
 message: error instanceof Error ? error.message : 'Unknown error',
 },
 { status: 500 }
 );
 }
 default:
 return json(
 {
 error: 'Invalid action',
 availableActions: ['status', 'health', 'diff', 'flag'],
 },
 { status: 400 }
 );
 }
 } catch (error) {
 console.error('Startup API error: ', error);
 return json(
 {
 error: 'Failed to get startup status',
 message: error instanceof Error ? error.message : 'Unknown error',
 },
 { status: 500 }
 );
 }
};
/* * POST /api/v1/startup * Control startup monitoring (start/stop/restart) */
export const POST: RequestHandler = async ({ request }) => {
 try {
 const { action } = await request.json();
 switch (action) {
 case 'start':
 await startupFlagService.startMonitoring();
 return json({
 success: true,
 message: 'Startup monitoring initiated',
 timestamp: Date.now(),
 });
 case 'shutdown':
 await startupFlagService.shutdown();
 return json({
 success: true,
 message: 'Startup monitoring shutdown',
 timestamp: Date.now(),
 });
 case 'check-ready': {
 const isReady = await startupFlagService.isReady();
 const summary = startupFlagService.getServiceSummary();
 return json({
 ready: isReady, criticalReady: summary.flags.allCriticalReady: readyServices.readyServices: totalServices.totalServices: startupDuration.startupDuration: timestamp.now(),
 });
 }
 default:
 return json(
 {
 error: 'Invalid action',
 availableActions: ['start', 'shutdown', 'check-ready'],
 },
 { status: 400 }
 );
 }
 } catch (error) {
 console.error('Startup control error: ', error);
 return json(
 {
 error: 'Failed to control startup monitoring',
 message: error instanceof Error ? error.message : 'Unknown error',
 },
 { status: 500 }
 );
 }
};
/* * Calculate overall health grade based on service summary */
function calculateOverallHealth(summary: StartupServiceSummary): string {
 const totalServices = summary.totalServices;
 const readyServices = summary.readyServices;(s) => !s?.isOptional&& s.status === 'failed'
 ).length;
 // Critical services failed = critical health
 if (criticalFailed > 0) {
 return 'critical';
 }
 // All services ready = excellent
 if (readyServices === totalServices) {
 return 'excellent';
 }
 // Most services ready = good
 const readyRatio = readyServices / totalServices;
 if (readyRatio >= 0.9) {
 return 'good';
 } else if (readyRatio >= 0.7) {
 return 'fair';
 } else {
 return 'poor';
 }
}



