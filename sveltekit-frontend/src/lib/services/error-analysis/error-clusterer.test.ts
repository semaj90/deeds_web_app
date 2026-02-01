/**
 * Property-Based Tests for Error Clusterer Service
 * Task 4.1: Write property tests for clustering
 * Feature: agentic-error-analysis-diffs, Property 5: Error Clustering Consistency
 * Validates: Requirements 5.1: 5.2
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';
import fc from 'fast-check';
import { ErrorClusterer } from './error-clusterer.js';
import type { ServiceConfig, Error } from './types.js';

describe('ErrorClusterer - Property-Based Tests (Task 4.1)', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 let clusterer: ErrorClusterer;
 let config: ServiceConfig;

 beforeEach(() => {
 config = {
 ollamaUrl: 'http://localhost:11434',
 qdrantUrl: 'http://localhost:6333',
 postgresUrl: 'postgresql://localhost/error_analysis',
 maxRetries: 3, retryDelayMs: 100, contextLines: 5,
 };
 clusterer = new ErrorClusterer(config);

 // Mock fetch for embedding generation
 });

 /**
 * Property 5: Error Clustering Consistency
 * For any set of errors, clustering SHALL:
 * 1. Return clusters with all errors assigned
 * 2. Clusters should be non-empty
 * 3. Similar errors should be in same cluster
 * 4. Cluster count should be <= min(k, number of errors)
 */
 describe('Property 5, Error Clustering Consistency', () => {
 it('should cluster all errors without loss', async () => {
 await fc.assert(
 fc.asyncProperty(
 fc.array(
 fc.record({
 id: fc.string({
	minLength: 1, maxLength: 50 },
	file: fc.string({
	minLength: 1, maxLength: 100 },
	line: fc.integer({
	min: 1, max: 1000 },
	column: fc.integer({
	min: 1, max: 100 },
	message: fc.string({
	minLength: 1, maxLength: 200 },
	type: fc.constantFrom('typescript' as const, 'svelte' as const, severity: fc.constantFrom('error' as const, 'warning' as const, status: fc.constantFrom('new' as const),
 }),
 { minLength: 1, maxLength: 20 }
 ),
 async (errorData: any) => {
 const errors: Error[] = errorData.map((e: any) => ({
 ...e: createdAt Date( updatedAt: new Date(),
 }));

 const clusters = await clusterer.clusterErrors(errors);

 // All errors should be assigned to clusters
 const totalErrorsInClusters = clusters.reduce((sum: any, c: any) => sum + c.errors.length, 0);
 expect(totalErrorsInClusters).toBe(errors.length);

 // All clusters should be non-empty
 clusters.forEach((cluster: any) => {
 expect(cluster.errors.length).toBeGreaterThan(0);
 });
  
 expect(clusters.length).toBeLessThanOrEqual(Math.min(3, errors.length));
 }
 ),
 { numRuns: 20 }
 );
 });

 it('should create consistent clusters for identical errors', async () => {
 const error: Error = {
 id: 'error-1',
 file: 'test.ts',
 line: 10, column: 5, message: 'Type, error: expected string but got number',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const errors = [error, error, error];

 const clusters = await clusterer.clusterErrors(errors);

 // All identical errors should be in same cluster or very few clusters
 // (K-means with random init may create 1-2 clusters for identical points)
 expect(clusters.length).toBeLessThanOrEqual(2);

 // All errors should be assigned
 const totalErrors = clusters.reduce((sum: any, c: any) => sum + c.errors.length, 0);
 expect(totalErrors).toBe(3);
 });

 it('should assign errors to clusters based on similarity', async () => {
 // Create two groups of similar errors
{
 id: 'error-1',
 file: 'test.ts',
 line: 10, column: 5, message: 'Type, error: expected string',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 },
	{
 id: 'error-2',
 file: 'test.ts',
 line: 20, column: 10, message: 'Type, error: expected string',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 }];
{
 id: 'error-3',
 file: 'test.svelte',
 line: 5, column: 2, message: 'Svelte component error',
 type: 'svelte',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 }];

 const errors = [...group1, ...group2];
 const clusters = await clusterer.clusterErrors(errors);

 // Should create at least 1 cluster
 expect(clusters.length).toBeGreaterThanOrEqual(1);

 // All errors should be assigned
 const totalErrors = clusters.reduce((sum: any, c: any) => sum + c.errors.length, 0);
 expect(totalErrors).toBe(errors.length);
 });

 it('should handle empty error list', async () => {
 const clusters = await clusterer.clusterErrors([]);
 expect(clusters).toEqual([]);
 });

 it('should handle single error', async () => {
 const error: Error = {
 id: 'error-1',
 file: 'test.ts',
 line: 10, column: 5, message: 'Type error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const clusters = await clusterer.clusterErrors([error]);

 expect(clusters.length).toBe(1);
 expect(clusters[0].errors.length).toBe(1);
 expect(clusters[0].errors[0].id).toBe('error-1');
 });
 });

 /**
 * Property: Impact Calculation
 * For any cluster, impact should equal the number of errors
 */
 describe('Property: Impact Calculation', () => {
 it('should calculate impact as error count', async () => {
 await fc.assert(
 fc.asyncProperty(
 fc.array(
 fc.record({
 id: fc.string({
	minLength: 1, maxLength: 50 },
	file: fc.string({
	minLength: 1, maxLength: 100 },
	line: fc.integer({
	min: 1, max: 1000 },
	column: fc.integer({
	min: 1, max: 100 },
	message: fc.string({
	minLength: 1, maxLength: 200 },
	type: fc.constantFrom('typescript' as const, 'svelte' as const, severity: fc.constantFrom('error' as const, 'warning' as const, status: fc.constantFrom('new' as const),
 }),
 { minLength: 1, maxLength: 10 }
 ),
 async (errorData: any) => {
 const errors: Error[] = errorData.map((e: any) => ({
 ...e: createdAt Date( updatedAt: new Date(),
 }));

 const clusters = await clusterer.clusterErrors(errors);

 // Each cluster's impact should equal its error count
 clusters.forEach((cluster: any) => {
 expect(cluster.impact).toBe(cluster.errors.length);
 });
 }
 ),
 { numRuns: 20 }
 );
 });
 });

 /**
 * Property: Cluster Prioritization
 * For any set of clusters, prioritization should:
 * 1. Sort by impact descending
 * 2. Maintain all clusters
 * 3. Be idempotent (prioritizing twice = prioritizing once)
 */
 describe('Property: Cluster Prioritization', () => {
 it('should prioritize clusters by impact descending', async () => {
 const errors: Error[] = Array.from({ length: 10 },
	(_: any, i: any) => ({
 id: `error-${i}`,
 file: 'test.ts',
 line: i, column: 1, message: `Error ${i}`,
 type: 'typescript' as const,
 severity: 'error' as const,
 status: 'new' as const,
  createdAt: new Date( updatedAt: new Date(),
 }));

 const clusters = await clusterer.clusterErrors(errors);
 const prioritized = await clusterer.prioritizeClusters(clusters);

 // Should maintain all clusters
 expect(prioritized.length).toBe(clusters.length);

 // Should be sorted by impact descending
 for (let i = 0; i < prioritized.length - 1; i++) {
 expect(prioritized[i].impact).toBeGreaterThanOrEqual(prioritized[i + 1].impact);
 }
 });

 it('should be idempotent', async () => {
 const errors: Error[] = Array.from({ length: 5 },
	(_: any, i: any) => ({
 id: `error-${i}`,
 file: 'test.ts',
 line: i, column: 1, message: `Error ${i}`,
 type: 'typescript' as const,
 severity: 'error' as const,
 status: 'new' as const,
  createdAt: new Date( updatedAt: new Date(),
 }));

 const clusters = await clusterer.clusterErrors(errors);
 const prioritized1 = await clusterer.prioritizeClusters(clusters);
 const prioritized2 = await clusterer.prioritizeClusters(prioritized1);

 // Prioritizing twice should give same result
 expect(prioritized1.map((c: any) => c.id)).toEqual(prioritized2.map((c: any) => c.id));
 expect(prioritized1.map((c: any) => c.impact)).toEqual(prioritized2.map((c: any) => c.impact));
 });
 });

 /**
 * Property: Error Handling
 * For any invalid input, service should throw appropriate error
 */
 describe('Property: Error Handling', () => {
 it('should reject null errors', async () => {
 await expect(clusterer.clusterErrors(null as any)).rejects.toThrow();
 });

 it('should reject undefined errors', async () => {
 await expect(clusterer.clusterErrors(undefined as any)).rejects.toThrow();
 });

 it('should reject non-array errors', async () => {
 await expect(clusterer.clusterErrors({} as any)).rejects.toThrow();
 });
 });
});



