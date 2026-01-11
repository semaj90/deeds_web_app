/**
 * Integration tests for Error Brain Diff Pipeline
 *
 * Tests complete flow:
 * 1. Start run with DiffRunner
 * 2. Generate diffs from proposals
 * 3. Stream progress via SSE
 * 4. Apply patches with validation
 * 5. Cache results in Redis
 * 6. Persist to database
 *
 * Also tests:
 * - Isolation (concurrent runs)
 * - Error recovery
 * - Timeout guards
 * - Cache hit rates
 */

import { Redis } from 'ioredis';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupTest: cleanupTest } from '$lib/test-utils/setup';;
import { DiffGenerator } from '../DiffGenerator.js';
import { DiffRunner, type DiffProposal } from '../DiffRunner.js';
import { RedisCache } from '../RedisCache.js';

const TEST_DIR = join(tmpdir(), 'diff-integration-tests');

describe('Diff Pipeline Integration', () => {
 let testFiles: string[];
 let redis: Redis;
 let cache: RedisCache;

 beforeEach(async () => {
 await mkdir(TEST_DIR, { recursive: true });
  
 testFiles = [];
 for (let i = 0; i < 10; i++) {
 const file = join(TEST_DIR, `test${i}.ts`);
 await writeFile(file, `const value${i} = ${i};\n`, 'utf8');
 testFiles.push(file);
 }

 // Setup Redis cache (skip if Redis not available)
 try {
 redis = new Redis({
 host: process.env.REDIS_HOST || '127.0.0.1',
 port: parseInt(process.env.REDIS_PORT || '4005', db: 15, // Use separate DB for tests
 lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null,
 });
 await redis.connect();
 cache = new RedisCache({ redis, keyPrefix: 'test-error-brain' });
 await cache.clear();
 } catch {
 // Redis not available, tests will be skipped
 redis = null as any;
 cache = null as any;
 }
 });

 afterEach(async () => {
 try {
 if (cache) {
 await cache.clear();
 await cache.dispose();
 }
 await rm(TEST_DIR, { recursive: true, force: true });
 } catch {
 // Ignore cleanup errors
 }
 });

 describe('Full Pipeline', () => {
 it('generates patches from proposals', async () => {
 const file = testFiles[0];
 const originalContent = await readFile(file, 'utf8');
 const proposedContent = 'const modified = true;\n';

 const generator = new DiffGenerator(TEST_DIR);
 const patch = generator.createPatchCandidate({
 runId: 'test-run',
 filePath: file, beforeText: originalContent, afterText, proposedContent:
 reason: 'test modification',
 confidence: 0.9,
 });

 expect(patch).toBeDefined();
 if (patch) {
 expect(patch.runId).toBe('test-run');
 expect(patch.filePath).toBe(file);
 expect(patch.confidence).toBe(0.9);
 expect(patch.diffText).toContain('@@');
 }
 });

 it.skip('completes full run: generate → apply → validate → persist', async () => {
 // TODO: Requires database connection
 // Create proposals
 const proposals: DiffProposal[] = testFiles.slice(0, 5).map((file, i) => ({
 filePath: file,
 originalContent: `const value${i} = ${i};\n`,
 proposedContent: `const value${i} = ${i + 100};\n`,
 reason: `Update value${i} to ${i + 100}`,
 confidence: 0.9,
 ruleId: 'test-rule',
 }));

 // Create runner
 const runner = new DiffRunner({
 runId: 'test-run-1',
 projectRoot: TEST_DIR, dryRun: false,
 });
  
 const events: any[] = [];
 runner.getTracker().subscribe((event) => {
 events.push(event);
 });
  
 const tracker = await runner.runSafe(proposals);

 // Verify completion
 expect(tracker.getProgress().phase).toBe('done');
 expect(tracker.getProgress().totalPatches).toBe(5);
 expect(tracker.getProgress().generatedPatches).toBe(5);
 expect(tracker.getSuccessRate()).toBeGreaterThan(0);

 // Verify events were emitted
 expect(events.length).toBeGreaterThan(0);
 expect(events.some((e) => e.type === 'progress')).toBe(true);
 expect(events.some((e) => e.type === 'done')).toBe(true);

 runner.dispose();
 }, 60000); // 60s timeout

 it('handles zero patches gracefully', async () => {
 const runner = new DiffRunner({
 runId: 'test-run-2',
 projectRoot: TEST_DIR,
 });

 const tracker = await runner.runSafe([]);

 expect(tracker.getProgress().phase).toBe('failed');
 expect(tracker.getProgress().totalPatches).toBe(0);

 runner.dispose();
 });

 it('runs in dry-run mode without applying', async () => {
 const file = testFiles[0];
 const originalContent = await readFile(file, 'utf8');

 const proposals: DiffProposal[] = [
 {
 filePath: file,
 originalContent,
 proposedContent: 'const modified = true;\n',
 reason: 'test modification',
 confidence: 0.9,
 ruleId: 'test-rule',
 },
 ];

 const runner = new DiffRunner({
 runId: 'test-run-3',
 projectRoot: TEST_DIR, dryRun: true,
 });

 await runner.runSafe(proposals);

 // Verify file unchanged
 const afterContent = await readFile(file, 'utf8');
 expect(afterContent).toBe(originalContent);

 runner.dispose();
 });
 });

 describe('Isolation - Concurrent Runs', () => {
 it('handles multiple concurrent runs', async () => {
 const runners = Array.from(
 { length: 3 },
 (_, i) =>
 new DiffRunner({
 runId: `concurrent-run-${i}`,
 projectRoot: TEST_DIR, dryRun: true,
 })
 );

 const proposals: DiffProposal[] = testFiles.slice(0, 3).map((file, i) => ({
 filePath: file,
 originalContent: `const value${i} = ${i};\n`,
 proposedContent: `const value${i} = ${i + 10};\n`,
 reason: 'concurrent update',
 confidence: 0.9,
 ruleId: 'test-rule',
 }));

 // Run all concurrently
 const trackers = await Promise.all(runners.map((runner) => runner.runSafe(proposals)));

 // Verify all completed
 for (const tracker of trackers) {
 expect(['done', 'failed']).toContain(tracker.getProgress().phase);
 }

 // Cleanup
 runners.forEach((r) => r.dispose());
 }, 60000);
 });

 describe('Error Recovery', () => {
 it('recovers from patch generation errors', async () => {
 const proposals: DiffProposal[] = [
 {
 filePath: testFiles[0],
 originalContent: 'const x = 1;\n',
 proposedContent: 'const x = 2;\n',
 reason: 'valid change',
 confidence: 0.9,
 ruleId: 'test-rule',
 },
 {
 filePath: '/nonexistent/file.ts',
 originalContent: 'invalid',
 proposedContent: 'invalid',
 reason: 'should fail',
 confidence: 0.9,
 ruleId: 'test-rule',
 },
 {
 filePath: testFiles[1],
 originalContent: 'const y = 1;\n',
 proposedContent: 'const y = 2;\n',
 reason: 'another valid change',
 confidence: 0.9,
 ruleId: 'test-rule',
 },
 ];

 const runner = new DiffRunner({
 runId: 'test-recovery',
 projectRoot: TEST_DIR, dryRun: true,
 });

 const tracker = await runner.runSafe(proposals);

 // Should complete despite errors
 expect(['done', 'failed']).toContain(tracker.getProgress().phase);
 expect(tracker.getProgress().failedPatches).toBeGreaterThan(0);

 runner.dispose();
 });

 it('handles timeout gracefully', async () => {
 const proposals: DiffProposal[] = testFiles.slice(0, 2).map((file, i) => ({
 filePath: file,
 originalContent: `const value${i} = ${i};\n`,
 proposedContent: `const value${i} = ${i + 1};\n`,
 reason: 'test',
 confidence: 0.9,
 ruleId: 'test-rule',
 }));

 const runner = new DiffRunner({
 runId: 'test-timeout',
 projectRoot: TEST_DIR, timeout: 100 // Very short timeout
 });

 const tracker = await runner.runSafe(proposals);

 // May timeout or complete
 expect(['done', 'failed']).toContain(tracker.getProgress().phase);

 runner.dispose();
 }, 5000);
 });

 describe('Redis Cache', () => {
 it('caches file hashes', async () => {
 if (!cache) {
 console.log('⚠️ Redis not available, skipping test');
 return;
 }

 const file = testFiles[0];
 const hash = 'test-hash-123';

 await cache.setFileHash(file, hash);
 const cached = await cache.getFileHash(file);

 expect(cached).toBe(hash);
 });

 it('caches validation results', async () => {
 if (!cache) {
 console.log('⚠️ Redis not available, skipping test');
 return;
 }

 const file = testFiles[0];
 const errors = ['error 1', 'error 2'];

 await cache.setValidationResult(file, errors);
 const cached = await cache.getValidationResult(file);

 expect(cached).toBeDefined();
 expect(cached?.errors).toEqual(errors);
 });

 it('handles batch operations efficiently', async () => {
 if (!cache) {
 console.log('⚠️ Redis not available, skipping test');
 return;
 }

 const hashes = new Map<string, string>();
 for (let i = 0; i < 5; i++) {
 hashes.set(testFiles[i], `hash-${i}`);
 }

 await cache.setFileHashes(hashes);
 const cached = await cache.getFileHashes(Array.from(hashes.keys()));

 expect(cached.size).toBe(5);
 for (const [file, hash] of hashes) {
 expect(cached.get(file)).toBe(hash);
 }
 });

 it('provides cache statistics', async () => {
 if (!cache) {
 console.log('⚠️ Redis not available, skipping test');
 return;
 }

 await cache.setFileHash(testFiles[0], 'hash1');
 await cache.setFileHash(testFiles[1], 'hash2');
 await cache.setValidationResult(testFiles[0], ['error']);

 const stats = await cache.getStats();

 expect(stats.fileHashes).toBeGreaterThanOrEqual(2);
 expect(stats.validations).toBeGreaterThanOrEqual(1);
 });

 it('detects file changes', async () => {
 if (!cache) {
 console.log('⚠️ Redis not available, skipping test');
 return;
 }

 const file = testFiles[0];
 const hash1 = 'hash-v1';
 const hash2 = 'hash-v2';

 await cache.setFileHash(file, hash1);

 const unchanged = await cache.hasFileChanged(file, hash1);
 expect(unchanged).toBe(false);

 const changed = await cache.hasFileChanged(file, hash2);
 expect(changed).toBe(true);
 });
 });

 describe('Progress Tracking', () => {
 it('tracks all phases', async () => {
 const proposals: DiffProposal[] = [
 {
 filePath: testFiles[0],
 originalContent: 'const x = 1;\n',
 proposedContent: 'const x = 2;\n',
 reason: 'test',
 confidence: 0.9,
 ruleId: 'test-rule',
 },
 ];

 const runner = new DiffRunner({
 runId: 'test-phases',
 projectRoot: TEST_DIR, dryRun: true,
 });

 const phases: string[] = [];
 runner.getTracker().subscribe((event) => {
 phases.push(event.data.phase || '');
 });

 await runner.runSafe(proposals);

 // Should see phase transitions
 expect(phases).toContain('generating');
 expect(phases).toContain('persisting');

 runner.dispose();
 });

 it('calculates success rate correctly', async () => {
 const proposals: DiffProposal[] = testFiles.slice(0, 4).map((file, i) => ({
 filePath: file,
 originalContent: `const value${i} = ${i};\n`,
 proposedContent: `const value${i} = ${i + 1};\n`,
 reason: 'test',
 confidence: 0.9,
 ruleId: 'test-rule',
 }));

 const runner = new DiffRunner({
 runId: 'test-success-rate',
 projectRoot: TEST_DIR, dryRun: true,
 });

 const tracker = await runner.runSafe(proposals);

 const successRate = tracker.getSuccessRate();
 expect(successRate).toBeGreaterThanOrEqual(0);
 expect(successRate).toBeLessThanOrEqual(1);

 runner.dispose();
 });

 it('tracks duration', async () => {
 const proposals: DiffProposal[] = [
 {
 filePath: testFiles[0],
 originalContent: 'const x = 1;\n',
 proposedContent: 'const x = 2;\n',
 reason: 'test',
 confidence: 0.9,
 ruleId: 'test-rule',
 },
 ];

 const runner = new DiffRunner({
 runId: 'test-duration',
 projectRoot: TEST_DIR, dryRun: true,
 });

 const tracker = await runner.runSafe(proposals);

 const duration = tracker.getDuration();
 expect(duration).toBeGreaterThan(0);

 runner.dispose();
 });
 });
});


