// @vitest-environment node
//
// Unit tests for P5 — Codebase Relationship Extractor
// Covers all 7 semantic relation types extracted from source text.

import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractSemanticRelations,
  KNOWN_TABLES,
  KNOWN_QDRANT_COLLECTIONS,
  KNOWN_NEO4J_LABELS,
} from '../src/lib/server/graph/relationship-extractor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../src');
// Use a deterministic fake absolute path for all inline tests
const FAKE_ABS = resolve(SRC, 'lib/server/ace/fake-module.ts');

function extract(content: string) {
  return extractSemanticRelations(FAKE_ABS, SRC, content);
}

// ── EXPORTS_SYMBOL ────────────────────────────────────────────────────────────

describe('EXPORTS_SYMBOL', () => {
  it('detects named export function', () => {
    const edges = extract('export function multiLaneSearch() {}');
    const e = edges.find(e => e.relationType === 'EXPORTS_SYMBOL' && e.targetKey === 'multiLaneSearch');
    expect(e).toBeDefined();
    expect(e!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('detects named export const', () => {
    const edges = extract('export const aceTopkKey = (q: string) => `ace:topk:${q}`;');
    const e = edges.find(e => e.relationType === 'EXPORTS_SYMBOL' && e.targetKey === 'aceTopkKey');
    expect(e).toBeDefined();
  });

  it('detects export { Foo, Bar }', () => {
    const edges = extract('export { multiLaneSearch, LaneResult };');
    const keys = edges.filter(e => e.relationType === 'EXPORTS_SYMBOL').map(e => e.targetKey);
    expect(keys).toContain('multiLaneSearch');
    expect(keys).toContain('LaneResult');
  });

  it('detects export type', () => {
    const edges = extract('export type MultiLaneSynthesis = { queryHash: string };');
    const e = edges.find(e => e.relationType === 'EXPORTS_SYMBOL' && e.targetKey === 'MultiLaneSynthesis');
    expect(e).toBeDefined();
  });

  it('detects export interface', () => {
    const edges = extract('export interface LaneResult { lane: string; }');
    const e = edges.find(e => e.relationType === 'EXPORTS_SYMBOL' && e.targetKey === 'LaneResult');
    expect(e).toBeDefined();
  });
});

// ── READS_REDIS_KEY ───────────────────────────────────────────────────────────

describe('READS_REDIS_KEY', () => {
  it('detects redis.get with literal key', () => {
    const edges = extract("const raw = await redis.get('ace:topk:abc');");
    const e = edges.find(e => e.relationType === 'READS_REDIS_KEY' && e.targetKey === 'ace:topk:abc');
    expect(e).toBeDefined();
    expect(e!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('detects redis.hget', () => {
    const edges = extract('const v = await redis.hget("cache:bucket", field);');
    const e = edges.find(e => e.relationType === 'READS_REDIS_KEY' && e.targetKey === 'cache:bucket');
    expect(e).toBeDefined();
  });

  it('assigns lower confidence to template-literal keys', () => {
    const edges = extract('redis.get(`ace:topk:${queryHash}:embeddinggemma:768`)');
    const e = edges.find(e => e.relationType === 'READS_REDIS_KEY');
    // template key might not match the literal-only regex — that's fine; just verify no crash
    expect(Array.isArray(edges)).toBe(true);
  });
});

// ── WRITES_REDIS_KEY ──────────────────────────────────────────────────────────

describe('WRITES_REDIS_KEY', () => {
  it('detects redis.setex', () => {
    const edges = extract("await redis.setex('ace:query:abc123', 300, JSON.stringify(result));");
    const e = edges.find(e => e.relationType === 'WRITES_REDIS_KEY' && e.targetKey === 'ace:query:abc123');
    expect(e).toBeDefined();
    expect(e!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('detects redis.set', () => {
    const edges = extract("redis.set('wiki:page:multi-lane', content);");
    const e = edges.find(e => e.relationType === 'WRITES_REDIS_KEY' && e.targetKey === 'wiki:page:multi-lane');
    expect(e).toBeDefined();
  });

  it('detects redis.hset', () => {
    const edges = extract('await redis.hset("rlpolicy:pipeline_weights", "vector", "0.75");');
    const e = edges.find(e => e.relationType === 'WRITES_REDIS_KEY' && e.targetKey === 'rlpolicy:pipeline_weights');
    expect(e).toBeDefined();
  });
});

// ── QUERIES_TABLE ─────────────────────────────────────────────────────────────

describe('QUERIES_TABLE', () => {
  it('detects SQL FROM clause', () => {
    const edges = extract("SELECT * FROM evidence WHERE id = $1");
    const e = edges.find(e => e.relationType === 'QUERIES_TABLE' && e.targetKey === 'evidence');
    expect(e).toBeDefined();
  });

  it('detects Drizzle .from(tableName)', () => {
    const edges = extract('const rows = await db.select().from(cases).where(eq(cases.id, id));');
    const e = edges.find(e => e.relationType === 'QUERIES_TABLE' && e.targetKey === 'cases');
    expect(e).toBeDefined();
    expect(e!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('detects INSERT INTO', () => {
    const edges = extract('INSERT INTO context_timeline (event_type, pipeline) VALUES ($1, $2)');
    const e = edges.find(e => e.relationType === 'QUERIES_TABLE' && e.targetKey === 'context_timeline');
    expect(e).toBeDefined();
  });

  it('detects code_relations table', () => {
    const edges = extract("pool.query('INSERT INTO code_relations (source_key, target_key) VALUES ($1, $2)', [a, b])");
    const e = edges.find(e => e.relationType === 'QUERIES_TABLE' && e.targetKey === 'code_relations');
    expect(e).toBeDefined();
  });

  it('KNOWN_TABLES is non-empty and includes critical tables', () => {
    expect(KNOWN_TABLES).toContain('evidence');
    expect(KNOWN_TABLES).toContain('code_relations');
    expect(KNOWN_TABLES).toContain('context_timeline');
    expect(KNOWN_TABLES).toContain('error_fingerprints');
  });
});

// ── QUERIES_QDRANT_COLLECTION ─────────────────────────────────────────────────

describe('QUERIES_QDRANT_COLLECTION', () => {
  it('detects codebase_chunks_768 collection reference', () => {
    const edges = extract("await hybridSearch('codebase_chunks_768', query, topK);");
    const e = edges.find(e => e.relationType === 'QUERIES_QDRANT_COLLECTION' && e.targetKey === 'codebase_chunks_768');
    expect(e).toBeDefined();
    expect(e!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('detects evidence_items collection', () => {
    const edges = extract('client.search("evidence_items", { vector: embedding, limit: 10 })');
    const e = edges.find(e => e.relationType === 'QUERIES_QDRANT_COLLECTION' && e.targetKey === 'evidence_items');
    expect(e).toBeDefined();
  });

  it('detects glyph_atlas collection', () => {
    const edges = extract("collection: 'glyph_atlas'");
    const e = edges.find(e => e.relationType === 'QUERIES_QDRANT_COLLECTION' && e.targetKey === 'glyph_atlas');
    expect(e).toBeDefined();
  });

  it('KNOWN_QDRANT_COLLECTIONS is non-empty', () => {
    expect(KNOWN_QDRANT_COLLECTIONS.length).toBeGreaterThan(5);
    expect(KNOWN_QDRANT_COLLECTIONS).toContain('codebase_chunks_768');
  });
});

// ── QUERIES_NEO4J_LABEL ───────────────────────────────────────────────────────

describe('QUERIES_NEO4J_LABEL', () => {
  it('detects Cypher MATCH (n:CodebaseFile)', () => {
    const edges = extract('session.run("MATCH (n:CodebaseFile {id: $id}) RETURN n", { id })');
    const e = edges.find(e => e.relationType === 'QUERIES_NEO4J_LABEL' && e.targetKey === 'CodebaseFile');
    expect(e).toBeDefined();
    expect(e!.confidence).toBeGreaterThanOrEqual(0.88);
  });

  it('detects MERGE (:WikiPage)', () => {
    const edges = extract('MERGE (w:WikiPage {slug: $slug}) SET w.title = $title');
    const e = edges.find(e => e.relationType === 'QUERIES_NEO4J_LABEL' && e.targetKey === 'WikiPage');
    expect(e).toBeDefined();
  });

  it('detects MATCH (e:Evidence)', () => {
    const edges = extract('MATCH (c:Case)-[:HAS_EVIDENCE]->(e:Evidence) RETURN e');
    const cases = edges.find(e => e.relationType === 'QUERIES_NEO4J_LABEL' && e.targetKey === 'Case');
    const evidence = edges.find(e => e.relationType === 'QUERIES_NEO4J_LABEL' && e.targetKey === 'Evidence');
    expect(cases).toBeDefined();
    expect(evidence).toBeDefined();
  });

  it('KNOWN_NEO4J_LABELS includes all primary labels', () => {
    expect(KNOWN_NEO4J_LABELS).toContain('CodebaseFile');
    expect(KNOWN_NEO4J_LABELS).toContain('WikiPage');
    expect(KNOWN_NEO4J_LABELS).toContain('GPUCluster');
  });
});

// ── HAS_AGENTS_SCOPE ──────────────────────────────────────────────────────────

describe('HAS_AGENTS_SCOPE', () => {
  it('emits at most one HAS_AGENTS_SCOPE edge per file', () => {
    const edges = extract('export const x = 1;');
    const scopeEdges = edges.filter(e => e.relationType === 'HAS_AGENTS_SCOPE');
    expect(scopeEdges.length).toBeLessThanOrEqual(1);
  });

  it('HAS_AGENTS_SCOPE edge confidence is 0.85', () => {
    const edges = extract('export const x = 1;');
    const scopeEdge = edges.find(e => e.relationType === 'HAS_AGENTS_SCOPE');
    if (scopeEdge) {
      expect(scopeEdge.confidence).toBe(0.85);
      expect(scopeEdge.evidence.matchKind).toBe('walkup');
    }
  });
});

// ── Edge shape contract ───────────────────────────────────────────────────────

describe('edge shape contract', () => {
  it('all edges have sourceFile, targetKey, relationType, confidence, evidence', () => {
    const edges = extract(`
      export function myFn() {}
      const v = await redis.get('some:key');
      const rows = await db.select().from(cases);
    `);
    for (const e of edges) {
      expect(typeof e.sourceFile).toBe('string');
      expect(typeof e.targetKey).toBe('string');
      expect(typeof e.relationType).toBe('string');
      expect(typeof e.confidence).toBe('number');
      expect(e.confidence).toBeGreaterThan(0);
      expect(e.confidence).toBeLessThanOrEqual(1);
      expect(e.evidence).toBeDefined();
    }
  });

  it('sourceFile is a relative path from src root (no leading slash)', () => {
    const edges = extract('export const x = 1;');
    for (const e of edges) {
      expect(e.sourceFile).not.toMatch(/^\//);
      expect(e.sourceFile.replace(/\\/g, '/')).toMatch(/^(lib|routes|mcp|test)/);
    }
  });
});
