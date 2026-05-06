// @vitest-environment node
/**
 * Indexer worker-pool task integration tests.
 *
 * Exercises the four new compute-worker tasks (chunk / hash / metadata / qdrant_payload)
 * through the actual worker pool, verifying that each task:
 *   1. Runs off-thread without blocking (resolves as a Promise)
 *   2. Returns the expected shape
 *   3. Handles edge-case inputs gracefully
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ── Lazy import helpers (G26 pattern) ─────────────────────────────────────────

let getComputePool: () => import('../src/lib/server/workers/compute-pool.js').ComputePool;

beforeAll(async () => {
  const mod = await import('../src/lib/server/workers/compute-pool.js');
  getComputePool = mod.getComputePool;
});

afterAll(async () => {
  // Give workers a moment to drain, then the pool disposes lazily
  await new Promise((r) => setTimeout(r, 200));
});

// ── Sample fixtures ────────────────────────────────────────────────────────────

const SMALL_TS = `
import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';

export async function GET({ params }) {
  const result = await db.select().from(cases).where(eq(cases.id, params.id));
  if (!result[0]) return new Response(null, { status: 404 });
  return Response.json(result[0]);
}
`.trim();

const LARGE_TEXT = Array.from({ length: 200 }, (_, i) =>
  `// line ${i + 1}: const value${i} = computeExpensiveResult(${i});`
).join('\n');

// ── hash task ─────────────────────────────────────────────────────────────────

describe('hash task', () => {
  it('returns a 64-char hex SHA-256 digest', async () => {
    const pool = getComputePool();
    const result = await pool.run<{ hash: string }>('hash', { text: 'hello world' });
    expect(result).toMatchObject({ hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it('is deterministic for the same input', async () => {
    const pool = getComputePool();
    const [a, b] = await Promise.all([
      pool.run<{ hash: string }>('hash', { text: 'deterministic' }),
      pool.run<{ hash: string }>('hash', { text: 'deterministic' }),
    ]);
    expect(a.hash).toBe(b.hash);
  });

  it('produces different hashes for different inputs', async () => {
    const pool = getComputePool();
    const [a, b] = await Promise.all([
      pool.run<{ hash: string }>('hash', { text: 'aaa' }),
      pool.run<{ hash: string }>('hash', { text: 'bbb' }),
    ]);
    expect(a.hash).not.toBe(b.hash);
  });

  it('handles empty string', async () => {
    const pool = getComputePool();
    const result = await pool.run<{ hash: string }>('hash', { text: '' });
    expect(result.hash).toHaveLength(64);
  });
});

// ── chunk task ────────────────────────────────────────────────────────────────

describe('chunk task', () => {
  it('splits large text into multiple overlapping windows', async () => {
    const pool = getComputePool();
    const chunks = await pool.run<Array<{ text: string; startLine: number; endLine: number; chunkIndex: number }>>(
      'chunk', { text: LARGE_TEXT, filePath: 'test/large.py', maxLines: 80, overlap: 10 }
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].startLine).toBe(0);
    // Each chunk has text
    for (const c of chunks) {
      expect(c.text.length).toBeGreaterThan(0);
      expect(c.endLine).toBeGreaterThanOrEqual(c.startLine);
    }
    // Chunks are sequential (no gaps)
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].chunkIndex).toBe(i);
    }
  });

  it('returns single chunk for small text', async () => {
    const pool = getComputePool();
    const chunks = await pool.run<Array<{ text: string }>>(
      'chunk', { text: 'tiny file\nonly two lines', filePath: 'test/tiny.py' }
    );
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toContain('tiny file');
  });

  it('returns empty array for blank input', async () => {
    const pool = getComputePool();
    const chunks = await pool.run<Array<unknown>>('chunk', { text: '   \n   \n', filePath: 'blank.py' });
    expect(chunks).toEqual([]);
  });
});

// ── metadata task ─────────────────────────────────────────────────────────────

describe('metadata task', () => {
  it('extracts imports from TypeScript source', async () => {
    const pool = getComputePool();
    const meta = await pool.run<{
      imports: string[]; exports: string[]; lineCount: number; language: string; hasDefaultExport: boolean; hasTypes: boolean
    }>('metadata', { text: SMALL_TS, filePath: 'src/routes/api/test/+server.ts' });

    expect(meta.language).toBe('typescript');
    expect(meta.imports).toContain('$lib/server/db/client');
    expect(meta.imports).toContain('$lib/server/db/schema-postgres.js');
    expect(meta.imports).toContain('drizzle-orm');
    expect(meta.lineCount).toBeGreaterThan(0);
  });

  it('identifies exported function names', async () => {
    const pool = getComputePool();
    const meta = await pool.run<{ exports: string[] }>(
      'metadata', { text: SMALL_TS, filePath: 'test.ts' }
    );
    expect(meta.exports).toContain('GET');
  });

  it('detects default export', async () => {
    const pool = getComputePool();
    const meta = await pool.run<{ hasDefaultExport: boolean }>(
      'metadata', { text: 'export default function handler() {}', filePath: 'handler.ts' }
    );
    expect(meta.hasDefaultExport).toBe(true);
  });

  it('classifies Python files correctly', async () => {
    const pool = getComputePool();
    const meta = await pool.run<{ language: string }>(
      'metadata', { text: 'import os\ndef main(): pass', filePath: 'script.py' }
    );
    expect(meta.language).toBe('python');
  });

  it('handles empty text gracefully', async () => {
    const pool = getComputePool();
    const meta = await pool.run<{ imports: string[]; exports: string[] }>(
      'metadata', { text: '', filePath: 'empty.ts' }
    );
    expect(meta.imports).toEqual([]);
    expect(meta.exports).toEqual([]);
  });
});

// ── qdrant_payload task ───────────────────────────────────────────────────────

describe('qdrant_payload task', () => {
  it('builds a normalized Qdrant payload with all required fields', async () => {
    const pool = getComputePool();
    const chunk = { text: SMALL_TS, startLine: 0, endLine: 9, chunkIndex: 0, filePath: '/project/src/routes/api/test/+server.ts' };
    const metadata = { imports: ['$lib/server/db/client'], exports: ['GET'], lineCount: 10, sizeBytes: 200, language: 'typescript', hasDefaultExport: false, hasTypes: false };

    const payload = await pool.run<Record<string, unknown>>('qdrant_payload', {
      chunk, metadata, contentHash: 'abc123',
    });

    expect(payload.path).toBe('/project/src/routes/api/test/+server.ts');
    expect(payload.content).toBe(SMALL_TS);
    expect(payload.content_hash).toBe('abc123');
    expect(payload.chunk_index).toBe(0);
    expect(payload.start_line).toBe(0);
    expect(payload.end_line).toBe(9);
    expect(payload.language).toBe('typescript');
    expect(payload.imports).toContain('$lib/server/db/client');
    expect(payload.exports).toContain('GET');
    // Topology fields start null — caller fills in after embedding
    expect(payload.som_cluster).toBeNull();
    expect(payload.topo_class).toBeNull();
    expect(payload.manifold4_x).toBeNull();
  });

  it('computes content hash when contentHash is not provided', async () => {
    const pool = getComputePool();
    const chunk = { text: 'hello', startLine: 0, endLine: 0, chunkIndex: 0, filePath: '/x/y.ts' };
    const metadata = { imports: [], exports: [], lineCount: 1, sizeBytes: 5, language: 'typescript', hasDefaultExport: false, hasTypes: false };

    const payload = await pool.run<Record<string, unknown>>('qdrant_payload', { chunk, metadata, contentHash: undefined });
    expect(typeof payload.content_hash).toBe('string');
    expect((payload.content_hash as string).length).toBe(64);
  });

  it('normalizes Windows paths to forward slashes in relative_path', async () => {
    const pool = getComputePool();
    const chunk = { text: 'x', startLine: 0, endLine: 0, chunkIndex: 0, filePath: 'C:\\project\\src\\lib\\server\\cache.ts' };
    const metadata = { imports: [], exports: [], lineCount: 1, sizeBytes: 1, language: 'typescript', hasDefaultExport: false, hasTypes: false };

    const payload = await pool.run<Record<string, unknown>>('qdrant_payload', { chunk, metadata, contentHash: 'x' });
    expect((payload.relative_path as string)).not.toContain('\\');
  });
});

// ── concurrency / routing ─────────────────────────────────────────────────────

describe('worker pool concurrency', () => {
  it('handles 20 parallel hash tasks without error', async () => {
    const pool = getComputePool();
    const texts = Array.from({ length: 20 }, (_, i) => `payload-${i}-${'x'.repeat(100)}`);
    const results = await Promise.all(
      texts.map((text, i) =>
        pool.run<{ hash: string }>('hash', { text }, { routingKey: `parallel:${i % 4}` })
      )
    );
    expect(results).toHaveLength(20);
    for (const r of results) {
      expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
    }
    // All hashes unique (no collisions on distinct inputs)
    const unique = new Set(results.map((r) => r.hash));
    expect(unique.size).toBe(20);
  });

  it('sticky routing key lands on same worker (smoke test)', async () => {
    const pool = getComputePool();
    // Same routingKey → same worker thread (FNV-1a hash). We can't observe which
    // worker was used directly, but we can verify results are consistent.
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        pool.run<{ hash: string }>('hash', { text: 'sticky' }, { routingKey: 'repo:deeds/cluster:7' })
      )
    );
    const hashes = results.map((r) => r.hash);
    expect(new Set(hashes).size).toBe(1); // all identical
  });
});
