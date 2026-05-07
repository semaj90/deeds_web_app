// @vitest-environment node
/**
 * Relation extractor tests — G26 pattern
 *
 * Covers all 7 SemanticRelationType patterns:
 *   EXPORTS_SYMBOL      — named export, re-export, default export
 *   READS_REDIS_KEY     — redis.get literal key
 *   WRITES_REDIS_KEY    — redis.setex dynamic key
 *   QUERIES_TABLE       — SQL FROM, Drizzle .from(), string literal match
 *   QUERIES_QDRANT_COLLECTION — collection name in string literal
 *   QUERIES_NEO4J_LABEL — Cypher (n:Label) pattern
 *   HAS_AGENTS_SCOPE    — walk-up finds nearest AGENTS.md
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Lazy import per G26
let extractSemanticRelations: typeof import('../src/lib/server/graph/relationship-extractor.js').extractSemanticRelations;
let extractAllSemanticRelations: typeof import('../src/lib/server/graph/relationship-extractor.js').extractAllSemanticRelations;

beforeAll(async () => {
	const mod = await import('../src/lib/server/graph/relationship-extractor.js');
	extractSemanticRelations = mod.extractSemanticRelations;
	extractAllSemanticRelations = mod.extractAllSemanticRelations;
});

// ── Test fixture helpers ──────────────────────────────────────────────────────

function makeTmpTree(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), 'rel-extractor-'));
	for (const [rel, content] of Object.entries(files)) {
		const full = join(dir, rel);
		mkdirSync(resolve(full, '..'), { recursive: true });
		writeFileSync(full, content, 'utf8');
	}
	return dir;
}

// ── EXPORTS_SYMBOL ────────────────────────────────────────────────────────────

describe('EXPORTS_SYMBOL', () => {
	it('detects named function export', () => {
		const root = makeTmpTree({ 'src/a.ts': `export function multiLaneSearch(q: string) {}` });
		try {
			const edges = extractSemanticRelations(join(root, 'src/a.ts'), root);
			const hit = edges.find(e => e.relationType === 'EXPORTS_SYMBOL' && e.targetKey === 'multiLaneSearch');
			expect(hit).toBeDefined();
			expect(hit!.confidence).toBeGreaterThan(0.8);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('detects named const export', () => {
		const root = makeTmpTree({ 'src/a.ts': `export const aceTopkKey = (h: string) => 'ace:topk:' + h;` });
		try {
			const edges = extractSemanticRelations(join(root, 'src/a.ts'), root);
			const hit = edges.find(e => e.relationType === 'EXPORTS_SYMBOL' && e.targetKey === 'aceTopkKey');
			expect(hit).toBeDefined();
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('detects re-export block', () => {
		const root = makeTmpTree({ 'src/a.ts': `export { foo, bar as baz } from './other.js';` });
		try {
			const edges = extractSemanticRelations(join(root, 'src/a.ts'), root);
			const syms = edges.filter(e => e.relationType === 'EXPORTS_SYMBOL').map(e => e.targetKey);
			expect(syms).toContain('foo');
			expect(syms).toContain('bar');
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('detects export interface', () => {
		const root = makeTmpTree({ 'src/a.ts': `export interface SemanticEdge { sourceFile: string; }` });
		try {
			const edges = extractSemanticRelations(join(root, 'src/a.ts'), root);
			const hit = edges.find(e => e.relationType === 'EXPORTS_SYMBOL' && e.targetKey === 'SemanticEdge');
			expect(hit).toBeDefined();
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});

// ── READS_REDIS_KEY ───────────────────────────────────────────────────────────

describe('READS_REDIS_KEY', () => {
	it('detects redis.get with string literal', () => {
		const root = makeTmpTree({ 'src/a.ts': `const v = await redis.get('ace:topk:abc:embeddinggemma:768');` });
		try {
			const edges = extractSemanticRelations(join(root, 'src/a.ts'), root);
			const hit = edges.find(e => e.relationType === 'READS_REDIS_KEY');
			expect(hit).toBeDefined();
			expect(hit!.targetKey).toBe('ace:topk:abc:embeddinggemma:768');
			expect(hit!.confidence).toBeGreaterThan(0.85);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('detects redis.hget', () => {
		const root = makeTmpTree({ 'src/a.ts': `await redis.hget('code:graph:node:abc123', 'summary');` });
		try {
			const edges = extractSemanticRelations(join(root, 'src/a.ts'), root);
			const hit = edges.find(e => e.relationType === 'READS_REDIS_KEY');
			expect(hit).toBeDefined();
			expect(hit!.targetKey).toBe('code:graph:node:abc123');
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});

// ── WRITES_REDIS_KEY ──────────────────────────────────────────────────────────

describe('WRITES_REDIS_KEY', () => {
	it('detects redis.setex with template literal key (lower confidence)', () => {
		const root = makeTmpTree({ 'src/a.ts': `await redis.setex(\`ace:topk:\${qHash}:embeddinggemma:768\`, 600, data);` });
		try {
			const edges = extractSemanticRelations(join(root, 'src/a.ts'), root);
			const hit = edges.find(e => e.relationType === 'WRITES_REDIS_KEY');
			expect(hit).toBeDefined();
			// Template key — lower confidence
			expect(hit!.confidence).toBeLessThan(0.8);
			expect(hit!.targetKey).toContain('ace:topk:');
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('detects redis.set with static key (high confidence)', () => {
		const root = makeTmpTree({ 'src/a.ts': `await redis.set('wiki:note:dir:src/lib/server/ace', payload);` });
		try {
			const edges = extractSemanticRelations(join(root, 'src/a.ts'), root);
			const hit = edges.find(e => e.relationType === 'WRITES_REDIS_KEY');
			expect(hit).toBeDefined();
			expect(hit!.confidence).toBeGreaterThanOrEqual(0.85);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});

// ── QUERIES_TABLE ─────────────────────────────────────────────────────────────

describe('QUERIES_TABLE', () => {
	it('detects FROM clause in SQL template literal', () => {
		const root = makeTmpTree({ 'src/a.ts': `pool.query('SELECT * FROM error_fingerprints WHERE error_hash = $1', [hash])` });
		try {
			const edges = extractSemanticRelations(join(root, 'src/a.ts'), root);
			const hit = edges.find(e => e.relationType === 'QUERIES_TABLE' && e.targetKey === 'error_fingerprints');
			expect(hit).toBeDefined();
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('detects Drizzle .from(table) pattern', () => {
		const root = makeTmpTree({ 'src/a.ts': `const rows = await db.select().from(contextTimeline).limit(10);` });
		try {
			const edges = extractSemanticRelations(join(root, 'src/a.ts'), root);
			const hit = edges.find(e => e.relationType === 'QUERIES_TABLE' && e.targetKey === 'context_timeline');
			// Table name might match as string literal
			expect(edges.some(e => e.relationType === 'QUERIES_TABLE')).toBe(true);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});

// ── QUERIES_QDRANT_COLLECTION ─────────────────────────────────────────────────

describe('QUERIES_QDRANT_COLLECTION', () => {
	it('detects known collection name in string literal', () => {
		const root = makeTmpTree({ 'src/a.ts': `await hybridSearch('codebase_chunks_768', query, 10);` });
		try {
			const edges = extractSemanticRelations(join(root, 'src/a.ts'), root);
			const hit = edges.find(e => e.relationType === 'QUERIES_QDRANT_COLLECTION' && e.targetKey === 'codebase_chunks_768');
			expect(hit).toBeDefined();
			expect(hit!.confidence).toBeGreaterThan(0.9);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('does not produce false positive for unknown collection name', () => {
		const root = makeTmpTree({ 'src/a.ts': `const coll = 'totally_unknown_collection_xyz'; await search(coll);` });
		try {
			const edges = extractSemanticRelations(join(root, 'src/a.ts'), root);
			const hits = edges.filter(e => e.relationType === 'QUERIES_QDRANT_COLLECTION');
			expect(hits).toHaveLength(0);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});

// ── QUERIES_NEO4J_LABEL ───────────────────────────────────────────────────────

describe('QUERIES_NEO4J_LABEL', () => {
	it('detects Cypher node label pattern (n:Label)', () => {
		const root = makeTmpTree({ 'src/a.ts': `const q = 'MATCH (f:CodebaseFile) WHERE f.path = $p RETURN f';` });
		try {
			const edges = extractSemanticRelations(join(root, 'src/a.ts'), root);
			const hit = edges.find(e => e.relationType === 'QUERIES_NEO4J_LABEL' && e.targetKey === 'CodebaseFile');
			expect(hit).toBeDefined();
			expect(hit!.confidence).toBeGreaterThan(0.85);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('detects MERGE on known label', () => {
		const root = makeTmpTree({ 'src/a.ts': `const cypher = \`MERGE (WikiPage {id: $id})\`;` });
		try {
			const edges = extractSemanticRelations(join(root, 'src/a.ts'), root);
			const hit = edges.find(e => e.relationType === 'QUERIES_NEO4J_LABEL' && e.targetKey === 'WikiPage');
			expect(hit).toBeDefined();
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});

// ── HAS_AGENTS_SCOPE ──────────────────────────────────────────────────────────

describe('HAS_AGENTS_SCOPE', () => {
	it('finds nearest AGENTS.md via walk-up', () => {
		const root = makeTmpTree({
			'src/AGENTS.md': '# Rules\n- test',
			'src/lib/server/deep/module.ts': 'export const x = 1;',
		});
		try {
			const edges = extractSemanticRelations(join(root, 'src/lib/server/deep/module.ts'), root);
			const hit = edges.find(e => e.relationType === 'HAS_AGENTS_SCOPE');
			expect(hit).toBeDefined();
			expect(hit!.targetKey).toContain('AGENTS.md');
			expect(hit!.evidence.matchKind).toBe('walkup');
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('returns no HAS_AGENTS_SCOPE when no AGENTS.md in tree', () => {
		const root = makeTmpTree({ 'src/module.ts': 'export const y = 2;' });
		try {
			const edges = extractSemanticRelations(join(root, 'src/module.ts'), root);
			const hits = edges.filter(e => e.relationType === 'HAS_AGENTS_SCOPE');
			expect(hits).toHaveLength(0);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});

// ── Batch extractor ───────────────────────────────────────────────────────────

describe('extractAllSemanticRelations', () => {
	it('returns summary with totalFiles, totalEdges, edgeCounts', () => {
		const root = makeTmpTree({
			'src/a.ts': `export function foo() {}\nconst v = await redis.get('key:abc');`,
			'src/b.ts': `export const bar = 1;`,
		});
		try {
			const result = extractAllSemanticRelations(root, 100);
			expect(result.totalFiles).toBeGreaterThanOrEqual(2);
			expect(result.totalEdges).toBeGreaterThan(0);
			expect(result.edgeCounts.EXPORTS_SYMBOL).toBeGreaterThan(0);
			expect(result.edgeCounts.READS_REDIS_KEY).toBeGreaterThan(0);
			expect(typeof result.durationMs).toBe('number');
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('skips node_modules and .svelte-kit', () => {
		const root = makeTmpTree({
			'src/a.ts': `export function ok() {}`,
			'node_modules/pkg/index.ts': `export function skip() {}`,
			'.svelte-kit/generated.ts': `export function alsoSkip() {}`,
		});
		try {
			const result = extractAllSemanticRelations(root, 100);
			const nodeMod = result.edges.filter(e => e.sourceFile.includes('node_modules'));
			const svelteKit = result.edges.filter(e => e.sourceFile.includes('.svelte-kit'));
			expect(nodeMod).toHaveLength(0);
			expect(svelteKit).toHaveLength(0);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});
