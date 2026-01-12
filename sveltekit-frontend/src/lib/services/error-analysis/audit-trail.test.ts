import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest: cleanupTest } from '$lib/test-utils/setup';
import fc from 'fast-check';
import { AuditTrail, type AuditEntry } from './audit-trail.js';
import type { ServiceConfig } from './types.js';

describe('AuditTrail', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 let auditTrail: AuditTrail;
 const config: ServiceConfig = {
 maxRetries: 3, retryDelayMs: 100
 };

 beforeEach(() => {
 auditTrail = new AuditTrail(config);
 });

 describe('logAnalysis', () => {
 it('should log successful analysis', async () => {
 const details = { errorCount: 5, clustersFound: 2 };
 const entry = await auditTrail.logAnalysis(details, 'success');

 expect(entry).toHaveProperty('id');
 expect(entry).toHaveProperty('timestamp');
 expect(entry.operation).toBe('analyze');
 expect(entry.status).toBe('success');
 expect(entry.details).toEqual(details);
 });

 it('should log failed analysis with error message', async () => {
 const details = { errorCount: 0 };
 const errorMessage = 'Analysis failed';
 const entry = await auditTrail.logAnalysis(details, 'failure', errorMessage);

 expect(entry.status).toBe('failure');
 expect(entry.errorMessage).toBe(errorMessage);
 });

 it('should generate unique IDs', async () => {
 const entry1 = await auditTrail.logAnalysis({}, 'success');
 const entry2 = await auditTrail.logAnalysis({}, 'success');

 expect(entry1.id).not.toBe(entry2.id);
 });

 it('should set timestamp', async () => {
 const before = new Date();
 const entry = await auditTrail.logAnalysis({}, 'success');
 const after = new Date();

 const entryTime = new Date(entry.timestamp);
 expect(entryTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
 expect(entryTime.getTime()).toBeLessThanOrEqual(after.getTime());
 });
 });

 describe('logFix', () => {
 it('should log fix operation', async () => {
 const details = { file: 'test.ts', line: 10 };
 const entry = await auditTrail.logFix(details, 'success');

 expect(entry.operation).toBe('fix');
 expect(entry.details).toEqual(details);
 });

 it('should log failed fix', async () => {
 const entry = await auditTrail.logFix({}, 'failure', 'Fix failed');

 expect(entry.status).toBe('failure');
 expect(entry.errorMessage).toBe('Fix failed');
 });
 });

 describe('logValidation', () => {
 it('should log validation operation', async () => {
 const details = { newErrors: 0 };
 const entry = await auditTrail.logValidation(details, 'success');

 expect(entry.operation).toBe('validate');
 expect(entry.details).toEqual(details);
 });
 });

 describe('logRollback', () => {
 it('should log rollback operation', async () => {
 const details = { reason: 'Validation failed' };
 const entry = await auditTrail.logRollback(details, 'success');

 expect(entry.operation).toBe('rollback');
 expect(entry.details).toEqual(details);
 });
 });

 describe('logFeatureFlagChange', () => {
 it('should log enable operation', async () => {
 const entry = await auditTrail.logFeatureFlagChange('error-brain', true, 'success');

 expect(entry.operation).toBe('enable');
 expect(entry.details.flag).toBe('error-brain');
 expect(entry.details.enabled).toBe(true);
 });

 it('should log disable operation', async () => {
 const entry = await auditTrail.logFeatureFlagChange('error-brain', false, 'success');

 expect(entry.operation).toBe('disable');
 expect(entry.details.enabled).toBe(false);
 });
 });

 describe('queryHistory', () => {
 beforeEach(async () => {
 await auditTrail.logAnalysis({ count: 1 }, 'success');
 await auditTrail.logFix({ file: 'test.ts' }, 'success');
 await auditTrail.logValidation({ errors: 0 }, 'success');
 await auditTrail.logAnalysis({ count: 2 }, 'failure', 'Error');
 });

 it('should return all entries', async () => {
 const results = await auditTrail.queryHistory();

 expect(results.length).toBe(4);
 });

 it('should filter by operation', async () => {
 const results = await auditTrail.queryHistory({ operation: 'analyze' });

 expect(results.length).toBe(2);
 expect(results.every((e: any) => e.operation === 'analyze')).toBe(true);
 });

 it('should sort by timestamp descending', async () => {
 const results = await auditTrail.queryHistory();

 for (let i = 0; i < results.length - 1; i++) {
 const current = new Date(results[i].timestamp).getTime();
 const next = new Date(results[i + 1].timestamp).getTime();
 expect(current).toBeGreaterThanOrEqual(next);
 }
 });

 it('should apply limit', async () => {
 const results = await auditTrail.queryHistory({ limit: 2 });

 expect(results.length).toBe(2);
 });

 it('should apply offset', async () => {
 const allResults = await auditTrail.queryHistory();
 const offsetResults = await auditTrail.queryHistory({ offset: 2 });

 expect(offsetResults.length).toBe(2);
 expect(offsetResults[0].id).toBe(allResults[2].id);
 });

 it('should filter by date range', async () => {
 const now = new Date();
 const future = new Date(now.getTime() + 1000);

 const results = await auditTrail.queryHistory({
 startDate: new Date(now.getTime() - 10000, endDate: future,
 });

 expect(results.length).toBeGreaterThan(0);
 });
 });

 describe('getAllEntries', () => {
 it('should return all entries', async () => {
 await auditTrail.logAnalysis({}, 'success');
 await auditTrail.logFix({}, 'success');

 const entries = await auditTrail.getAllEntries();

 expect(entries.length).toBe(2);
 });

 it('should return empty array initially', async () => {
 const entries = await auditTrail.getAllEntries();

 expect(entries.length).toBe(0);
 });
 });

 describe('getEntryCount', () => {
 it('should return correct count', async () => {
 await auditTrail.logAnalysis({}, 'success');
 await auditTrail.logFix({}, 'success');

 const count = await auditTrail.getEntryCount();

 expect(count).toBe(2);
 });

 it('should return 0 initially', async () => {
 const count = await auditTrail.getEntryCount();

 expect(count).toBe(0);
 });
 });

 describe('clearEntries', () => {
 it('should clear all entries', async () => {
 await auditTrail.logAnalysis({}, 'success');
 await auditTrail.logFix({}, 'success');

 await auditTrail.clearEntries();

 const count = await auditTrail.getEntryCount();
 expect(count).toBe(0);
 });
 });

 describe('getEntriesByOperation', () => {
 beforeEach(async () => {
 await auditTrail.logAnalysis({}, 'success');
 await auditTrail.logAnalysis({}, 'failure');
 await auditTrail.logFix({}, 'success');
 });

 it('should return entries for operation', async () => {
 const results = await auditTrail.getEntriesByOperation('analyze');

 expect(results.length).toBe(2);
 expect(results.every((e: any) => e.operation === 'analyze')).toBe(true);
 });

 it('should return empty array for non-existent operation', async () => {
 const results = await auditTrail.getEntriesByOperation('nonexistent');

 expect(results.length).toBe(0);
 });
 });

 describe('getEntriesByStatus', () => {
 beforeEach(async () => {
 await auditTrail.logAnalysis({}, 'success');
 await auditTrail.logAnalysis({}, 'failure');
 await auditTrail.logFix({}, 'success');
 });

 it('should return successful entries', async () => {
 const results = await auditTrail.getEntriesByStatus('success');

 expect(results.length).toBe(2);
 expect(results.every((e: any) => e.status === 'success')).toBe(true);
 });

 it('should return failed entries', async () => {
 const results = await auditTrail.getEntriesByStatus('failure');

 expect(results.length).toBe(1);
 expect(results.every((e: any) => e.status === 'failure')).toBe(true);
 });
 });

 describe('getSuccessRate', () => {
 it('should return 100% for all successful', async () => {
 await auditTrail.logAnalysis({}, 'success');
 await auditTrail.logFix({}, 'success');

 const rate = await auditTrail.getSuccessRate();

 expect(rate).toBe(100);
 });

 it('should return 0% for all failed', async () => {
 await auditTrail.logAnalysis({}, 'failure');
 await auditTrail.logFix({}, 'failure');

 const rate = await auditTrail.getSuccessRate();

 expect(rate).toBe(0);
 });

 it('should return 50% for mixed', async () => {
 await auditTrail.logAnalysis({}, 'success');
 await auditTrail.logFix({}, 'failure');

 const rate = await auditTrail.getSuccessRate();

 expect(rate).toBe(50);
 });

 it('should return 0 for empty', async () => {
 const rate = await auditTrail.getSuccessRate();

 expect(rate).toBe(0);
 });
 });

 describe('getStatistics', () => {
 beforeEach(async () => {
 await auditTrail.logAnalysis({}, 'success');
 await auditTrail.logAnalysis({}, 'failure');
 await auditTrail.logFix({}, 'success');
 });

 it('should return correct statistics', async () => {
 const stats = await auditTrail.getStatistics();

 expect(stats.totalEntries).toBe(3);
 expect(stats.successCount).toBe(2);
 expect(stats.failureCount).toBe(1);
 expect(stats.successRate).toBeCloseTo(66.67, 1);
 });

 it('should count operations correctly', async () => {
 const stats = await auditTrail.getStatistics();

 expect(stats.operationCounts['analyze']).toBe(2);
 expect(stats.operationCounts['fix']).toBe(1);
 });
 });

 describe('Property: Audit Trail Completeness', () => {
 it(
 'for any operation, audit trail should record it',
 fc.asyncProperty(
 fc.constantFrom('analyze', 'fix', 'validate', 'rollback'),
 async (operation: any) => {
 let entry: AuditEntry;

 switch (operation) {
 case 'analyze':
 entry = await auditTrail.logAnalysis({}, 'success');
 break;
 case 'fix':
 entry = await auditTrail.logFix({}, 'success');
 break;
 case 'validate':
 entry = await auditTrail.logValidation({}, 'success');
 break;
 case 'rollback':
 entry = await auditTrail.logRollback({}, 'success');
 break;
 default:
 throw new Error(`Unknown operation: ${ operation }`);
 }

 expect(entry!.operation).toBe(operation);
 expect(entry!.status).toBe('success');
 expect(entry!).toHaveProperty('timestamp');
 expect(entry!).toHaveProperty('id');
 expect(entry.operation).toBe(operation);
 expect(entry.status).toBe('success');
 expect(entry).toHaveProperty('timestamp');
 expect(entry).toHaveProperty('id');
 expect(entry.operation).toBe(operation);
 expect(entry.status).toBe('success');
 expect(entry).toHaveProperty('timestamp');
 expect(entry).toHaveProperty('id');
 }
 )
 );
 });

 describe('Property: Query Consistency', () => {
 it(
 'querying with no filters should return all entries',
 fc.asyncProperty(
 fc.array(fc.record({ count: fc.integer() }), { minLength: 1, maxLength: 10 }),
 async (detailsArray: any) => {
 for (const details of detailsArray) {
 await auditTrail.logAnalysis(details, 'success');
 }

 const allEntries = await auditTrail.getAllEntries();
 const queriedEntries = await auditTrail.queryHistory();

 expect(queriedEntries.length).toBe(allEntries.length);
 }
 )
 );
 });

 describe('Property: Status Tracking', () => {
 it(
 'success rate should be between 0 and 100',
 fc.asyncProperty(
 fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
 async (statuses: any) => {
 for (const status of statuses) {
 await auditTrail.logAnalysis({}, status ? 'success' : 'failure');
 }

 const rate = await auditTrail.getSuccessRate();

 expect(rate).toBeGreaterThanOrEqual(0);
 expect(rate).toBeLessThanOrEqual(100);
 }
 )
 );
 });
 describe('Integration: Full Audit Workflow', () => {
 it('should handle complete audit workflow', async () => {
 // Log analysis
 const analysis = await auditTrail.logAnalysis({ errors: 5 }, 'success');
 expect(analysis.operation).toBe('analyze');

 // Log fix
 const fix = await auditTrail.logFix({ file: 'test.ts' }, 'success');
 expect(fix.operation).toBe('fix');

 // Log validation
 const validation = await auditTrail.logValidation({ newErrors: 0 }, 'success');
 expect(validation.operation).toBe('validate');

 // Query history
 const history = await auditTrail.queryHistory();
 expect(history.length).toBe(3);

 // Get statistics
 const stats = await auditTrail.getStatistics();
 expect(stats.totalEntries).toBe(3);
 expect(stats.successCount).toBe(3);
 expect(stats.successRate).toBe(100);

 // Get success rate
 const rate = await auditTrail.getSuccessRate();
 expect(rate).toBe(100);
 });
 });
});


