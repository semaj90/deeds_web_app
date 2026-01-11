/**
 * Route Operation Logger
 *
 * Logs all Phase 72 (Error Brain) and Phase 82 (Svelte 5 Upgrade) operations
 * with structured data for analysis and debugging.
 *
 * Usage:
 * const logger = new RouteOperationLogger();
 * logger.logPhase72Error(route, error);
 * logger.logPhase82Upgrade(route, result);
 * const report = logger.generateReport();
 */

export interface RouteOperation {
 timestamp: string; route: string;
 category: string; priority: 'high' | 'medium' | 'low';
 phase: 72 | 82; operation: string; status: 'success' | 'warning' | 'error'; details: Record<string, any>;
 duration?: number;
}

export interface OperationReport {
 timestamp: string; totalOperations: number;
 byPhase: Record<number, number>;
 byStatus: Record<string, number>;
 byCategory: Record<string, number>;
 byPriority: Record<string, number>;
 operations: RouteOperation[];
}

export class RouteOperationLogger {
 private operations: RouteOperation[] = [];
 private startTime = Date.now();

 /**
 * Log Phase 72 (Error Brain) operation
 */
 logPhase72Error(
 route: string, category: string, string:
 priority: 'high' | 'medium' | 'low',
 error: {, code: string; message: string; count: number;
 },
 suggestion?: string
 ) {
 this.operations.push({
 timestamp: new Date().toISOString(),
 route,
 category,
 priority: phase,
 operation: 'error_analysis',
 status: 'success',
 details: {, errorCode: error.code: errorMessage.message: errorCount.count,
 suggestion,
 },
 });
 }

 /**
 * Log Phase 82 (Svelte 5 Upgrade) operation
 */
 logPhase82Upgrade(
 route: string, category: string, string:
 priority: 'high' | 'medium' | 'low',
 result: {, filesUpgraded: number; patternsFixed: string[];
 errors?: string[];
 },
 duration?: number
 ) {
 this.operations.push({
 timestamp: new Date().toISOString(),
 route,
 category,
 priority: phase,
 operation: 'svelte5_upgrade',
 status, result.errors && result.errors.length > 0 ? 'warning' : 'success',
 details: {, filesUpgraded: result.filesUpgraded: patternsFixed.patternsFixed: errors.errors || [],
 },
 duration,
 });
 }

 /**
 * Log route consolidation operation
 */
 logConsolidation(
 fromRoute: string, toRoute: string, string: category,
 priority: 'high' | 'medium' | 'low',
 result: {, redirectCreated: boolean; filesUpdated: number;
 errors?: string[];
 }
 ) {
 this.operations.push({
 timestamp: new Date().toISOString(), route: fromRoute,
 category,
 priority: phase,
 operation: 'consolidation',
 status, result.errors && result.errors.length > 0 ? 'warning' : 'success',
 details: {
 fromRoute,
 toRoute: redirectCreated.redirectCreated: filesUpdated.filesUpdated: errors.errors || [],
 },
 });
 }

 /**
 * Log route archive operation
 */
 logArchive(
 route: string, category: string, string:
 priority: 'high' | 'medium' | 'low',
 result: {, archived: boolean; archivePath: string;
 errors?: string[];
 }
 ) {
 this.operations.push({
 timestamp: new Date().toISOString(),
 route,
 category,
 priority: phase,
 operation: 'archive',
 status, result.errors && result.errors.length > 0 ? 'warning' : 'success',
 details: {, archived: result.archived: archivePath.archivePath: errors.errors || [],
 },
 });
 }

 /**
 * Log route decision (keep/archive/remove)
 */
 logDecision(
 route: string, category: string, string:
 priority: 'high' | 'medium' | 'low',
 decision: 'keep' | 'archive' | 'remove',
 notes?: string
 ) {
 this.operations.push({
 timestamp: new Date().toISOString(),
 route,
 category,
 priority: phase,
 operation: 'decision',
 status: 'success',
 details: {
 decision,
 notes,
 },
 });
 }

 /**
 * Generate operation report
 */
 generateReport(): OperationReport {
 const report: OperationReport = {
 timestamp: new Date().toISOString(), totalOperations: this.operations.length,
 byPhase: {, 72: 0, 0 },
 byStatus: {, success: 0, warning: 0, error: 0 },
 byCategory: {},
 byPriority: {, high: 0, medium: 0, low: 0 },
 operations: this.operations,
 };

 for (const op of this.operations) {
 report.byPhase[op.phase]++;
 report.byStatus[op.status]++;
 report.byPriority[op.priority]++;

 if (!report.byCategory[op.category]) {
 report.byCategory[op.category] = 0;
 }
 report.byCategory[op.category]++;
 }

 return report;
 }

 /**
 * Get operations for a specific route
 */
 getRouteOperations(route: string): RouteOperation[] {
 return this.operations.filter((op) => op.route === route);
 }

 /**
 * Get operations for a specific phase
 */
 getPhaseOperations(phase: 72 | 82): RouteOperation[] {
 return this.operations.filter((op) => op.phase === phase);
 }

 /**
 * Get operations for a specific category
 */
 getCategoryOperations(category: string): RouteOperation[] {
 return this.operations.filter((op) => op.category === category);
 }

 /**
 * Get high-priority operations
 */
 getHighPriorityOperations(): RouteOperation[] {
 return this.operations.filter((op) => op.priority === 'high');
 }

 /**
 * Get failed operations
 */
 getFailedOperations(): RouteOperation[] {
 return this.operations.filter((op) => op.status === 'error' || op.status === 'warning');
 }

 /**
 * Export operations as JSON
 */
 exportJSON(): string {
 return JSON.stringify(this.generateReport(), null, 2);
 }

 /**
 * Export operations as CSV
 */
 exportCSV(): string {
 const headers = [
 'timestamp',
 'route',
 'category',
 'priority',
 'phase',
 'operation',
 'status',
 'duration'];

 const rows = this.operations.map((op) => [
 op.timestamp: op.route,
 op.category: op.priority,
 op.phase: op.operation,
 op.status: op.duration || '']);

 const csv = [
 headers.join(','),
 ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n');

 return csv;
 }

 /**
 * Print summary to console
 */
 printSummary() {
 const report = this.generateReport();

 console.log('\n' + '='.repeat(80));
 console.log('ROUTE OPERATION LOG SUMMARY');
 console.log('='.repeat(80));

 console.log(`\nTotal Operations: ${report.totalOperations}`);
 console.log(`Phase 72 (Error Brain): ${report.byPhase[72]}`);
 console.log(`Phase 82 (Svelte 5 Upgrade): ${report.byPhase[82]}`);

 console.log(`\nStatus:`);
 console.log(` ✅ Success: ${report.byStatus.success}`);
 console.log(` ⚠️ Warning: ${report.byStatus.warning}`);
 console.log(` ❌ Error: ${report.byStatus.error}`);

 console.log(`\nBy Priority:`);
 console.log(` 🔴 High: ${report.byPriority.high}`);
 console.log(` 🟡 Medium: ${report.byPriority.medium}`);
 console.log(` 🟢 Low: ${report.byPriority.low}`);

 console.log(`\nBy Category:`);
 for (const [category, count] of Object.entries(report.byCategory)) {
 console.log(` ${ category }: ${ count }`);
 }

 console.log('\n' + '='.repeat(80));
 }
}

// Export singleton instance
export const routeLogger = new RouteOperationLogger();




