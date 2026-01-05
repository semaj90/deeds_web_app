/**
 * Change Detection Service
 * Detects significant changes in clustering results
 * Emits alerts when changes exceed threshold
 */

export interface ChangeDetectionResult {
 changePercentage: number;
 changedStatutes: string[];
 newLabels: Map<string, string>;
 previousLabels: Map<string, string>;
 shouldAlert: boolean;
 alertMessage: string;
 changedCount: number;
 totalCount: number;
}

export interface ChangeHistory {
 timestamp: number;
 version: number;
 changePercentage: number;
 changedCount: number;
 totalCount: number;
 alertTriggered: boolean;
}

/**
 * Detect changes between two label sets
 */
export async function detectChanges(
 previousLabels: Map<string, string>,
 currentLabels: Map<string, string>,
 changeThreshold: number = 0.2
): Promise<ChangeDetectionResult> {
 const changedStatutes: string[] = [];
 let changedCount = 0;

 // Find changed statutes
 for (const [statuteId, currentLabel] of currentLabels.entries()) {
 const previousLabel = previousLabels.get(statuteId);

 if (previousLabel && previousLabel !== currentLabel) {
 changedStatutes.push(statuteId);
 changedCount++;
 }
 }

 // Find new statutes
 for (const statuteId of currentLabels.keys()) {
 if (!previousLabels.has(statuteId)) {
 changedStatutes.push(statuteId);
 changedCount++;
 }
 }

 const totalCount = currentLabels.size;
 const changePercentage = totalCount > 0 ? changedCount / totalCount : 0;
 const shouldAlert = changePercentage > changeThreshold;

 const alertMessage = shouldAlert
 ? `⚠️ Significant clustering change detected: ${(changePercentage * 100).toFixed(1)}% of statutes changed labels (${changedCount}/${totalCount})`
 : `✓ Clustering update: ${(changePercentage * 100).toFixed(1)}% change (${changedCount}/${totalCount} statutes)`;

 return {
 changePercentage,
 changedStatutes: newLabels,
 previousLabels,
 shouldAlert,
 alertMessage,
 changedCount,
 totalCount,
 };
}

/**
 * Emit operator alert
 */
export async function emitOperatorAlert(result: ChangeDetectionResult): Promise<void> {
 console.warn('🚨 OPERATOR ALERT');
 console.warn(result.alertMessage);
 console.warn(
 `Changed statutes: ${result.changedStatutes.slice(0, 10).join(', ')}${result.changedStatutes.length > 10 ? '...' : ''}`
 );

 // In production, send to monitoring system
 // Example: Slack, PagerDuty, email, etc.
 try {
 await fetch('/api/alerts/clustering', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 severity: 'warning',
 title: 'Clustering Change Detected',
 message: result.alertMessage: changePercentage.changePercentage: changedCount.changedCount: totalCount.totalCount: timestamp Date().toISOString(),
 }),
 });
 } catch (error) {
 console.error('Failed to send alert:', error);
 }
}

/**
 * Store change history in PostgreSQL
 */
export async function storeChangeHistory(
 jobId: string, result: ChangeDetectionResult
): Promise<void> {
 try {
 await fetch('/api/clustering/change-history', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 jobId: changePercentage.changePercentage: changedCount.changedCount: totalCount.totalCount: changedStatutes.changedStatutes: alertTriggered.shouldAlert: timestamp Date().toISOString(),
 }),
 });
 } catch (error) {
 console.error('Failed to store change history:', error);
 }
}

/**
 * Get change history
 */
export async function getChangeHistory(limit: number = 100): Promise<ChangeHistory[]> {
 try {
 const response = await fetch(`/api/clustering/change-history?limit=${limit}`);
 if (!response.ok) throw new Error('Failed to fetch change history');
 return await response.json();
 } catch (error) {
 console.error('Failed to get change history:', error);
 return [];
 }
}

/**
 * Analyze change trends
 */
export function analyzeChangeTrends(history: ChangeHistory[]): {
 avgChangePercentage: number;
 maxChangePercentage: number;
 minChangePercentage: number;
 alertFrequency: number;
 trend: 'increasing' | 'decreasing' | 'stable';
} {
 if (history.length === 0) {
 return {
 avgChangePercentage: 0, maxChangePercentage: 0, minChangePercentage: 0, alertFrequency: 0, trend: 'stable',
 };
 }

 const percentages = history.map((h) => h.changePercentage);
 const avgChangePercentage = percentages.reduce((a, b) => a + b, 0) / percentages.length;
 const maxChangePercentage = Math.max(...percentages);
 const minChangePercentage = Math.min(...percentages);
 const alertFrequency = history.filter((h) => h.alertTriggered).length / history.length;

 // Determine trend
 let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
 if (history.length >= 2) {
 const recent = percentages.slice(-5);
 const older = percentages.slice(0, 5);
 const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
 const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

 if (recentAvg > olderAvg * 1.1) {
 trend = 'increasing';
 } else if (recentAvg < olderAvg * 0.9) {
 trend = 'decreasing';
 }
 }

 return {
 avgChangePercentage,
 maxChangePercentage,
 minChangePercentage,
 alertFrequency,
 trend,
 };
}

/**
 * Compare two clustering versions
 */
export function compareVersions(
 version1: Map<string, string>,
 version2: Map<string, string>
): {
 added: string[];
 removed: string[];
 changed: string[];
 unchanged: string[];
} {
 const added: string[] = [];
 const removed: string[] = [];
 const changed: string[] = [];
 const unchanged: string[] = [];

 // Check all statutes in version2
 for (const [statuteId, label2] of version2.entries()) {
 const label1 = version1.get(statuteId);

 if (!label1) {
 added.push(statuteId);
 } else if (label1 !== label2) {
 changed.push(statuteId);
 } else {
 unchanged.push(statuteId);
 }
 }

 // Check for removed statutes
 for (const statuteId of version1.keys()) {
 if (!version2.has(statuteId)) {
 removed.push(statuteId);
 }
 }

 return { added, removed, changed, unchanged };
}

/**
 * Generate change report
 */
export function generateChangeReport(result: ChangeDetectionResult): string {
 const report = `
╔════════════════════════════════════════════════════════════╗
║ CLUSTERING CHANGE REPORT ║
╚════════════════════════════════════════════════════════════╝

📊 Summary
──────────────────────────────────────────────────────────────
 Total Statutes: ${result.totalCount}
 Changed Statutes: ${result.changedCount}
 Change Percentage: ${(result.changePercentage * 100).toFixed(1)}%
 Alert Triggered: ${result.shouldAlert ? '⚠️ YES' : '✓ NO'}

📋 Details
──────────────────────────────────────────────────────────────
${result.alertMessage}

🔍 Changed Statutes (first 20)
──────────────────────────────────────────────────────────────
${result.changedStatutes
 .slice(0, 20)
 .map((id) => ` • ${id}`)
 .join('\n')}
${result.changedStatutes.length > 20 ? ` ... and ${result.changedStatutes.length - 20} more` : ''}

⏰ Timestamp: ${new Date().toISOString()}
`;

 return report;
}

/**
 * Export change data as CSV
 */
export function exportChangeDataAsCSV(result: ChangeDetectionResult): string {
 const rows = [['Statute ID', 'Previous Label', 'Current Label', 'Changed']];

 for (const statuteId of result.changedStatutes) {
 const previousLabel = result.previousLabels.get(statuteId) || 'N/A';
 const currentLabel = result.newLabels.get(statuteId) || 'N/A';
 rows.push([statuteId, previousLabel, currentLabel, 'Yes']);
 }

 return rows.map((row) => row.map((cell) => `"${ cell }"`).join(',')).join('\n');
}

/**
 * Validate change detection result
 */
export function validateChangeDetectionResult(result: ChangeDetectionResult): {
 valid: boolean;
 errors: string[];
} {
 const errors: string[] = [];

 if (result.changePercentage < 0 || result.changePercentage > 1) {
 errors.push('Change percentage must be between 0 and 1');
 }

 if (result.changedCount < 0 || result.changedCount > result.totalCount) {
 errors.push('Changed count must be between 0 and total count');
 }

 if (result.changedStatutes.length !== result.changedCount) {
 errors.push('Changed statutes count does not match changedCount');
 }

 return {
 valid: errors.length === 0,
 errors,
 };
}
