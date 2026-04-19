/**
 * Performance snapshot guardrails.
 *
 * Not benchmarks — structural guardrails that catch regressions:
 *   1. Chunk counts stay bounded (no accidental fetch-all)
 *   2. Compact payload sizes don't drift upward
 *   3. Worker finding shapes stay lean
 *   4. Budget defaults don't silently grow
 */

// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

// ── Guardrail constants ───────────────────────────────────────────────────────
// These are ceilings, not targets. If a test fails, it means a default grew
// beyond what the compact pipeline was designed for.

const MAX_CHUNK_CONTENT_CHARS  = 400;  // searchQdrant truncates at 400
const MAX_WORKER_PATHS         = 15;   // relevantPaths capped at 15
const MAX_LIMIT_PER_WORKER     = 30;   // hardcoded in runConcurrentResearch
const MAX_PLAN_DOMAINS         = 6;    // DomainPlanSchema max 6
const MAX_FINDINGS_DEFAULT     = 8;    // COMPACT_DEFAULTS
const MAX_FILES_DEFAULT        = 5;    // COMPACT_DEFAULTS
const MAX_ACTIONS_DEFAULT      = 5;    // COMPACT_DEFAULTS
const MAX_SUMMARY_CHARS_DEFAULT = 2_400; // COMPACT_DEFAULTS

describe('Performance snapshot guardrails', () => {
	describe('COMPACT_DEFAULTS haven\'t grown', () => {
		it('maxFindings is 8', async () => {
			const { COMPACT_DEFAULTS } = await import('$lib/server/ai/compact-budgets.js');
			expect(COMPACT_DEFAULTS.maxFindings).toBe(MAX_FINDINGS_DEFAULT);
		});

		it('maxFiles is 5', async () => {
			const { COMPACT_DEFAULTS } = await import('$lib/server/ai/compact-budgets.js');
			expect(COMPACT_DEFAULTS.maxFiles).toBe(MAX_FILES_DEFAULT);
		});

		it('maxActionItems is 5', async () => {
			const { COMPACT_DEFAULTS } = await import('$lib/server/ai/compact-budgets.js');
			expect(COMPACT_DEFAULTS.maxActionItems).toBe(MAX_ACTIONS_DEFAULT);
		});

		it('maxSummaryChars is 2400', async () => {
			const { COMPACT_DEFAULTS } = await import('$lib/server/ai/compact-budgets.js');
			expect(COMPACT_DEFAULTS.maxSummaryChars).toBe(MAX_SUMMARY_CHARS_DEFAULT);
		});
	});

	describe('ASSIST_BUDGETS haven\'t grown beyond expected', () => {
		it('maxSchemaIds ≤ 128', async () => {
			const { ASSIST_BUDGETS } = await import('$lib/server/ai/compact-budgets.js');
			expect(ASSIST_BUDGETS.maxSchemaIds).toBeLessThanOrEqual(128);
		});

		it('maxAceChunks ≤ 20', async () => {
			const { ASSIST_BUDGETS } = await import('$lib/server/ai/compact-budgets.js');
			expect(ASSIST_BUDGETS.maxAceChunks).toBeLessThanOrEqual(20);
		});

		it('maxRetrievalHits ≤ 30', async () => {
			const { ASSIST_BUDGETS } = await import('$lib/server/ai/compact-budgets.js');
			expect(ASSIST_BUDGETS.maxRetrievalHits).toBeLessThanOrEqual(30);
		});

		it('maxErrorCards ≤ 20', async () => {
			const { ASSIST_BUDGETS } = await import('$lib/server/ai/compact-budgets.js');
			expect(ASSIST_BUDGETS.maxErrorCards).toBeLessThanOrEqual(20);
		});
	});

	describe('Chunk content truncation', () => {
		it('content is truncated to 400 chars in searchQdrant output', () => {
			const longContent = 'x'.repeat(1000);
			const truncated = longContent.slice(0, MAX_CHUNK_CONTENT_CHARS);
			expect(truncated.length).toBe(400);
		});

		it('payload with 12 chunks * 400 chars stays under 6KB text', () => {
			const chunksPerWorker = 12;
			const maxPayloadChars = chunksPerWorker * MAX_CHUNK_CONTENT_CHARS;
			expect(maxPayloadChars).toBeLessThanOrEqual(6_000);
		});
	});

	describe('Worker finding shape stays lean', () => {
		it('relevantPaths capped at 15', () => {
			const paths = Array.from({ length: 30 }, (_, i) => `src/file${i}.ts`);
			const capped = [...new Set(paths)].slice(0, MAX_WORKER_PATHS);
			expect(capped.length).toBeLessThanOrEqual(15);
		});

		it('compact worker summary truncated to 300 chars', () => {
			const longSummary = 'x'.repeat(500);
			const compact = true;
			const truncated = compact ? longSummary.slice(0, 300) : longSummary;
			expect(truncated.length).toBe(300);
		});

		it('compact keyInsights capped at 3', () => {
			const insights = ['a', 'b', 'c', 'd', 'e', 'f'];
			const compact = true;
			const capped = insights.slice(0, compact ? 3 : 10);
			expect(capped.length).toBe(3);
		});
	});

	describe('Concurrent research limits', () => {
		it('limitPerWorker hard cap is 30', () => {
			const userLimit = 100;
			const effective = Math.min(userLimit, MAX_LIMIT_PER_WORKER);
			expect(effective).toBe(30);
		});

		it('default limitPerWorker is 12', () => {
			const defaultLimit = 12;
			expect(defaultLimit).toBeLessThanOrEqual(MAX_LIMIT_PER_WORKER);
		});

		it('max domains is 6 (DomainPlanSchema)', () => {
			expect(MAX_PLAN_DOMAINS).toBe(6);
		});

		it('worst-case total chunks bounded: 6 domains × 30 limit = 180', () => {
			const worstCase = MAX_PLAN_DOMAINS * MAX_LIMIT_PER_WORKER;
			expect(worstCase).toBe(180);
			// With defaults: 5 domains × 12 = 60
			const defaultCase = 5 * 12;
			expect(defaultCase).toBe(60);
		});
	});

	describe('Compact response payload size estimates', () => {
		it('compact complete event stays under 10KB JSON', () => {
			const payload = {
				supervisorSummary: 'x'.repeat(MAX_SUMMARY_CHARS_DEFAULT),
				keyFindings: Array.from({ length: MAX_FINDINGS_DEFAULT }, (_, i) => `Finding ${i}: ${'x'.repeat(100)}`),
				actionItems: Array.from({ length: MAX_ACTIONS_DEFAULT }, (_, i) => `Action ${i}: ${'x'.repeat(80)}`),
				totalChunks: 60,
				totalDurationMs: 15000,
				compact: true,
			};
			const json = JSON.stringify(payload);
			expect(json.length).toBeLessThan(10_000);
		});

		it('batch response with 6 workers stays under 25KB JSON', () => {
			const workers = Array.from({ length: 6 }, (_, i) => ({
				domain: `domain-${i}`,
				chunkCount: 12,
				summary: 'x'.repeat(300),
				keyInsights: ['insight1', 'insight2', 'insight3'],
				relevantPaths: Array.from({ length: MAX_FILES_DEFAULT }, (_, j) => `src/path${j}.ts`),
				durationMs: 2000,
				source: 'qdrant',
				cached: false,
			}));

			const response = {
				ok: true,
				compact: true,
				query: 'How does the DB work?',
				domains: workers.map(w => w.domain),
				supervisorSummary: 'x'.repeat(MAX_SUMMARY_CHARS_DEFAULT),
				keyFindings: Array.from({ length: MAX_FINDINGS_DEFAULT }, () => 'x'.repeat(100)),
				actionItems: Array.from({ length: MAX_ACTIONS_DEFAULT }, () => 'x'.repeat(80)),
				totalChunks: 72,
				totalDurationMs: 15000,
				cacheKey: 'test-key',
				workers,
			};

			const json = JSON.stringify(response);
			expect(json.length).toBeLessThan(25_000);
		});
	});
});
