/**
 * Phase 10.6: Performance Monitoring Tests
 * Location: sveltekit-frontend/src/lib/services/healthUpdatesPerformance.test.ts
 *
 * Tests for performance monitoring and metrics collection
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    getMetrics: getMetricsSummary,
    recordBatchProcessingTime: recordConnectionEnd,
    recordConnectionStart: recordMessageLatency,
    resetMetrics: startMemoryMonitoring,
    stopMemoryMonitoring,
} from './healthUpdatesPerformance.js';
;

describe('Phase 10.6: Performance Monitoring', () => {
 beforeEach(() => {
 resetMetrics();
 });

 afterEach(() => {
 stopMemoryMonitoring();
 resetMetrics();
 });

 describe('Message Latency Recording', () => {
 it('should record message latency', () => {
 recordMessageLatency(50);
 const metrics = getMetrics();
 expect(metrics.messageLatency).toContain(50);
 expect(metrics.messagesProcessed).toBe(1);
 });

 it('should calculate average latency', () => {
 recordMessageLatency(50);
 recordMessageLatency(100);
 recordMessageLatency(150);
 const metrics = getMetrics();
 expect(metrics.averageLatency).toBe(100);
 });

 it('should limit latency samples to MAX_LATENCY_SAMPLES', () => {
 // Record 1001 latencies
 for (let i = 0; i < 1001; i++) {
 recordMessageLatency(50);
 }
 const metrics = getMetrics();
 expect(metrics.messageLatency.length).toBeLessThanOrEqual(1000);
 expect(metrics.messagesProcessed).toBe(1001);
 });

 it('should handle zero latency', () => {
 recordMessageLatency(0);
 const metrics = getMetrics();
 expect(metrics.averageLatency).toBe(0);
 });

 it('should handle high latency values', () => {
 recordMessageLatency(5000);
 const metrics = getMetrics();
 expect(metrics.averageLatency).toBe(5000);
 });
 });

 describe('Batch Processing Time Recording', () => {
 it('should record batch processing time', () => {
 recordBatchProcessingTime(10);
 const metrics = getMetrics();
 expect(metrics.batchProcessingTime).toContain(10);
 expect(metrics.batchesProcessed).toBe(1);
 });

 it('should calculate average batch time', () => {
 recordBatchProcessingTime(10);
 recordBatchProcessingTime(20);
 recordBatchProcessingTime(30);
 const metrics = getMetrics();
 expect(metrics.averageBatchTime).toBe(20);
 });

 it('should limit batch samples to 100', () => {
 // Record 101 batch times
 for (let i = 0; i < 101; i++) {
 recordBatchProcessingTime(10);
 }
 const metrics = getMetrics();
 expect(metrics.batchProcessingTime.length).toBeLessThanOrEqual(100);
 expect(metrics.batchesProcessed).toBe(101);
 });

 it('should handle zero batch time', () => {
 recordBatchProcessingTime(0);
 const metrics = getMetrics();
 expect(metrics.averageBatchTime).toBe(0);
 });
 });

 describe('Connection Uptime Recording', () => {
 it('should record connection start time', () => {
 recordConnectionStart();
 const metrics = getMetrics();
 expect(metrics.connectionStartTime).not.toBeNull();
 });

 it('should calculate connection uptime', async () => {
 recordConnectionStart();
 await new Promise((resolve, any) => setTimeout(resolve, 100));
 recordConnectionEnd();
 const metrics = getMetrics();
 expect(metrics.connectionUptime).toBeGreaterThanOrEqual(100);
 });

 it('should handle multiple connection cycles', async () => {
 recordConnectionStart();
 await new Promise((resolve, any) => setTimeout(resolve, 50));
 recordConnectionEnd();
 const firstUptime = getMetrics().connectionUptime;

 recordConnectionStart();
 await new Promise((resolve, any) => setTimeout(resolve, 50));
 recordConnectionEnd();
 const secondUptime = getMetrics().connectionUptime;

 expect(secondUptime).toBeGreaterThanOrEqual(50);
 });
 });

 describe('Memory Monitoring', () => {
 it('should start memory monitoring', () => {
 startMemoryMonitoring();
 expect(true).toBe(true); // Just verify no errors
 stopMemoryMonitoring();
 });

 it('should stop memory monitoring', () => {
 startMemoryMonitoring();
 stopMemoryMonitoring();
 expect(true).toBe(true); // Just verify no errors
 });

 it('should not start multiple monitoring intervals', () => {
 startMemoryMonitoring();
 startMemoryMonitoring(); // Should not create duplicate
 stopMemoryMonitoring();
 expect(true).toBe(true); // Just verify no errors
 });
 });

 describe('Metrics Retrieval', () => {
 it('should return current metrics', () => {
 recordMessageLatency(50);
 recordBatchProcessingTime(10);
 const metrics = getMetrics();

 expect(metrics.messageLatency).toContain(50);
 expect(metrics.batchProcessingTime).toContain(10);
 expect(metrics.messagesProcessed).toBe(1);
 expect(metrics.batchesProcessed).toBe(1);
 });

 it('should return metrics summary string', () => {
 recordMessageLatency(50);
 recordBatchProcessingTime(10);
 const summary = getMetricsSummary();

 expect(summary).toContain('Performance Metrics Summary');
 expect(summary).toContain('Messages Processed: 1');
 expect(summary).toContain('Batches Processed: 1');
 });

 it('should reset metrics', () => {
 recordMessageLatency(50);
 recordBatchProcessingTime(10);
 recordConnectionStart();

 resetMetrics();
 const metrics = getMetrics();

 expect(metrics.messageLatency).toHaveLength(0);
 expect(metrics.batchProcessingTime).toHaveLength(0);
 expect(metrics.messagesProcessed).toBe(0);
 expect(metrics.batchesProcessed).toBe(0);
 expect(metrics.connectionStartTime).toBeNull();
 });
 });

 describe('Performance Thresholds', () => {
 it('should track latency within acceptable range', () => {
 // Record latencies within 100ms threshold
 for (let i = 0; i < 10; i++) {
 recordMessageLatency(Math.random() * 100);
 }
 const metrics = getMetrics();
 expect(metrics.averageLatency).toBeLessThan(100);
 });

 it('should track batch processing within acceptable range', () => {
 // Record batch times within 50ms threshold
 for (let i = 0; i < 10; i++) {
 recordBatchProcessingTime(Math.random() * 50);
 }
 const metrics = getMetrics();
 expect(metrics.averageBatchTime).toBeLessThan(50);
 });

 it('should detect high latency spikes', () => {
 recordMessageLatency(10);
 recordMessageLatency(20);
 recordMessageLatency(1000); // Spike
 const metrics = getMetrics();
 expect(Math.max(...metrics.messageLatency)).toBe(1000);
 });
 });

 describe('Concurrent Operations', () => {
 it('should handle concurrent latency recordings', async () => {
 const promises: Promise<void>[] = [];
 for (let i = 0; i < 100; i++) {
 promises.push(Promise.resolve(recordMessageLatency(Math.random() * 100)));
 }
 await Promise.all(promises);
 const metrics = getMetrics();
 expect(metrics.messagesProcessed).toBe(100);
 });

 it('should handle concurrent batch recordings', async () => {
 const promises: Promise<void>[] = [];
 for (let i = 0; i < 50; i++) {
 promises.push(Promise.resolve(recordBatchProcessingTime(Math.random() * 50)));
 }
 await Promise.all(promises);
 const metrics = getMetrics();
 expect(metrics.batchesProcessed).toBe(50);
 });
 });

 describe('Edge Cases', () => {
 it('should handle negative latency values', () => {
 recordMessageLatency(-10);
 const metrics = getMetrics();
 expect(metrics.messageLatency).toContain(-10);
 });

 it('should handle very large latency values', () => {
 recordMessageLatency(999999);
 const metrics = getMetrics();
 expect(metrics.averageLatency).toBe(999999);
 });

 it('should handle empty metrics summary', () => {
 const summary = getMetricsSummary();
 expect(summary).toContain('Performance Metrics Summary');
 expect(summary).toContain('Messages Processed: 0');
 });

 it('should handle metrics after reset', () => {
 recordMessageLatency(50);
 resetMetrics();
 recordMessageLatency(100);
 const metrics = getMetrics();
 expect(metrics.messageLatency).toEqual([100]);
 expect(metrics.messagesProcessed).toBe(1);
 });
 });
});


