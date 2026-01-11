import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setupTest: cleanupTest } from '$lib/test-utils/setup';
import fc from 'fast-check';
import { ProgressTracker } from './progress-tracker.js';
import type { ServiceConfig } from './types.js';

describe('ProgressTracker', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 let tracker: ProgressTracker;
 const config: ServiceConfig = {
 maxRetries: 3, retryDelayMs: 100
 };

 beforeEach(() => {
 tracker = new ProgressTracker(config);
 });

 describe('start', () => {
 it('should start progress tracking', async () => {
 await tracker.start(10);

 const report = await tracker.getReport();
 expect(report.metrics.totalErrors).toBe(10);
 expect(report.status).toBe('in_progress');
 });

 it('should reject zero errors', async () => {
 await expect(tracker.start(0)).rejects.toThrow();
 });

 it('should reject negative errors', async () => {
 await expect(tracker.start(-5)).rejects.toThrow();
 });

 it('should set start time', async () => {
 const before = new Date();
 await tracker.start(10);
 const after = new Date();

 const report = await tracker.getReport();
 const startTime = new Date(report.metrics.startTime);

 expect(startTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
 expect(startTime.getTime()).toBeLessThanOrEqual(after.getTime());
 });
 });

 describe('updateAnalysis', () => {
 beforeEach(async () => {
 await tracker.start(10);
 });

 it('should update on successful analysis', async () => {
 await tracker.updateAnalysis(true, 0.8);

 const metrics = await tracker.getMetrics();
 expect(metrics.errorsAnalyzed).toBe(1);
 expect(metrics.errorsFixed).toBe(1);
 expect(metrics.errorsFailed).toBe(0);
 });

 it('should update on failed analysis', async () => {
 await tracker.updateAnalysis(false, 0.5);

 const metrics = await tracker.getMetrics();
 expect(metrics.errorsAnalyzed).toBe(1);
 expect(metrics.errorsFixed).toBe(0);
 expect(metrics.errorsFailed).toBe(1);
 });

 it('should calculate success rate', async () => {
 await tracker.updateAnalysis(true, 0.8);
 await tracker.updateAnalysis(true, 0.7);
 await tracker.updateAnalysis(false, 0.6);

 const rate = await tracker.getSuccessRate();
 expect(rate).toBeCloseTo(66.67, 1);
 });

 it('should calculate average confidence', async () => {
 await tracker.updateAnalysis(true, 0.8);
 await tracker.updateAnalysis(true, 0.6);

 const confidence = await tracker.getAverageConfidence();
 expect(confidence).toBeCloseTo(0.7, 1);
 });

 it('should calculate error reduction', async () => {
 await tracker.updateAnalysis(true, 0.8);
 await tracker.updateAnalysis(true, 0.7);

 const reduction = await tracker.getErrorReduction();
 expect(reduction).toBeCloseTo(20, 0);
 });

 it('should reject invalid confidence', async () => {
 await expect(tracker.updateAnalysis(true, 1.5)).rejects.toThrow();
 await expect(tracker.updateAnalysis(true, -0.1)).rejects.toThrow();
 });
 });

 describe('pause and resume', () => {
 beforeEach(async () => {
 await tracker.start(10);
 });

 it('should pause tracking', async () => {
 await tracker.pause();

 const report = await tracker.getReport();
 expect(report.status).toBe('paused');
 });

 it('should resume tracking', async () => {
 await tracker.pause();
 await tracker.resume();

 const report = await tracker.getReport();
 expect(report.status).toBe('in_progress');
 });

 it('should not pause if not in progress', async () => {
 await tracker.pause();
 await expect(tracker.pause()).rejects.toThrow();
 });

 it('should not resume if not paused', async () => {
 await expect(tracker.resume()).rejects.toThrow();
 });
 });

 describe('complete', () => {
 beforeEach(async () => {
 await tracker.start(10);
 });

 it('should complete tracking', async () => {
 await tracker.complete();

 const report = await tracker.getReport();
 expect(report.status).toBe('completed');
 });

 it('should complete from paused state', async () => {
 await tracker.pause();
 await tracker.complete();

 const report = await tracker.getReport();
 expect(report.status).toBe('completed');
 });
 });

 describe('getReport', () => {
 beforeEach(async () => {
 await tracker.start(10);
 });

 it('should return complete report', async () => {
 const report = await tracker.getReport();

 expect(report).toHaveProperty('sessionId');
 expect(report).toHaveProperty('metrics');
 expect(report).toHaveProperty('status');
 expect(report).toHaveProperty('elapsedTime');
 expect(report).toHaveProperty('completionPercentage');
 });

 it('should have valid metrics', async () => {
 await tracker.updateAnalysis(true, 0.8);

 const report = await tracker.getReport();
 expect(report.metrics.errorsAnalyzed).toBe(1);
 expect(report.completionPercentage).toBeCloseTo(10, 0);
 });
 });

 describe('getCompletionPercentage', () => {
 beforeEach(async () => {
 await tracker.start(10);
 });

 it('should return 0% initially', async () => {
 const percentage = await tracker.getCompletionPercentage();
 expect(percentage).toBe(0);
 });

 it('should return 50% after half done', async () => {
 for (let i = 0; i < 5; i++) {
 await tracker.updateAnalysis(true, 0.8);
 }

 const percentage = await tracker.getCompletionPercentage();
 expect(percentage).toBe(50);
 });

 it('should return 100% when complete', async () => {
 for (let i = 0; i < 10; i++) {
 await tracker.updateAnalysis(true, 0.8);
 }

 const percentage = await tracker.getCompletionPercentage();
 expect(percentage).toBe(100);
 });
 });

 describe('getEstimatedTimeRemaining', () => {
 beforeEach(async () => {
 await tracker.start(10);
 });

 it('should return 0 initially', async () => {
 const remaining = await tracker.getEstimatedTimeRemaining();
 expect(remaining).toBe(0);
 });

 it('should estimate time remaining', async () => {
 await tracker.updateAnalysis(true, 0.8);

 // Wait a bit to accumulate time
 await new Promise((resolve) => setTimeout(resolve, 10));

 const remaining = await tracker.getEstimatedTimeRemaining();
 expect(remaining).toBeGreaterThanOrEqual(0);
 });
 });

 describe('reset', () => {
 beforeEach(async () => {
 await tracker.start(10);
 await tracker.updateAnalysis(true, 0.8);
 });

 it('should reset all metrics', async () => {
 await tracker.reset();

 const metrics = await tracker.getMetrics();
 expect(metrics.errorsAnalyzed).toBe(0);
 expect(metrics.errorsFixed).toBe(0);
 expect(metrics.totalErrors).toBe(0);
 });

 it('should reset status', async () => {
 await tracker.reset();

 const report = await tracker.getReport();
 expect(report.status).toBe('not_started');
 });
 });

 describe('getSessionId', () => {
 it('should return session ID', () => {
 const sessionId = tracker.getSessionId();

 expect(typeof sessionId).toBe('string');
 expect(sessionId.length).toBeGreaterThan(0);
 });

 it('should have unique session IDs', () => {
 const tracker1 = new ProgressTracker(config);
 const tracker2 = new ProgressTracker(config);

 expect(tracker1.getSessionId()).not.toBe(tracker2.getSessionId());
 });
 });

 describe('Property: Progress Metric Monotonicity', () => {
 it(
 'errors fixed should never decrease',
 fc.asyncProperty(fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }), async (results) => {
 await tracker.start(results.length);

 let previousFixed = 0;

 for (const result of results) {
 await tracker.updateAnalysis(result, 0.5);

 const metrics = await tracker.getMetrics();
 expect(metrics.errorsFixed).toBeGreaterThanOrEqual(previousFixed);
 previousFixed = metrics.errorsFixed;
 }
 })
 );

 it(
 'success rate should be between 0 and 100',
 fc.asyncProperty(fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }), async (results) => {
 await tracker.start(results.length);

 for (const result of results) {
 await tracker.updateAnalysis(result, 0.5);
 }

 const rate = await tracker.getSuccessRate();
 expect(rate).toBeGreaterThanOrEqual(0);
 expect(rate).toBeLessThanOrEqual(100);
 })
 );

 it(
 'completion percentage should be monotonically increasing',
 fc.asyncProperty(fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }), async (results) => {
 await tracker.start(results.length);

 let previousCompletion = 0;

 for (const result of results) {
 await tracker.updateAnalysis(result, 0.5);

 const completion = await tracker.getCompletionPercentage();
 expect(completion).toBeGreaterThanOrEqual(previousCompletion);
 previousCompletion = completion;
 }
 })
 );
 });

 describe('Integration: Full Progress Workflow', () => {
 it('should handle complete progress workflow', async () => {
 // Start tracking
 await tracker.start(5);
 let report = await tracker.getReport();
 expect(report.status).toBe('in_progress');
 expect(report.completionPercentage).toBe(0);

 // Update progress
 await tracker.updateAnalysis(true, 0.8);
 await tracker.updateAnalysis(true, 0.7);
 await tracker.updateAnalysis(false, 0.6);

 report = await tracker.getReport();
 expect(report.metrics.errorsAnalyzed).toBe(3);
 expect(report.metrics.errorsFixed).toBe(2);
 expect(report.completionPercentage).toBeCloseTo(60, 0);

 // Pause and resume
 await tracker.pause();
 report = await tracker.getReport();
 expect(report.status).toBe('paused');

 await tracker.resume();
 report = await tracker.getReport();
 expect(report.status).toBe('in_progress');

 // Complete remaining
 await tracker.updateAnalysis(true, 0.9);
 await tracker.updateAnalysis(true, 0.85);

 report = await tracker.getReport();
 expect(report.metrics.errorsAnalyzed).toBe(5);
 expect(report.completionPercentage).toBe(100);

 // Complete tracking
 await tracker.complete();
 report = await tracker.getReport();
 expect(report.status).toBe('completed');
 });
 });
});


