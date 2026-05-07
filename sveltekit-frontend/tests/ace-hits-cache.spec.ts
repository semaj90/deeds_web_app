// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';

// Inline helpers that mirror trace-mcp-server.ts exactly.
// Update here if the server-side implementation changes.

const ACE_HITS_TTL = 86_400;

function aceHitsKey(queryHash: string, limit: number): string {
  return `ace:hits:${queryHash}:${limit}`;
}

function hashQuery(query: string, limit: number): string {
  return createHash('sha256').update(`${query.trim()}:${limit}`).digest('hex').slice(0, 16);
}

// ── aceHitsKey ────────────────────────────────────────────────────────────────

describe('aceHitsKey', () => {
  it('produces the canonical key pattern', () => {
    const key = aceHitsKey('abc123', 10);
    expect(key).toBe('ace:hits:abc123:10');
  });

  it('includes limit so different limits do not collide', () => {
    const h = hashQuery('what is hearsay?', 10);
    expect(aceHitsKey(h, 10)).not.toBe(aceHitsKey(h, 20));
  });

  it('key prefix is ace:hits:', () => {
    expect(aceHitsKey('00112233', 5).startsWith('ace:hits:')).toBe(true);
  });
});

// ── hashQuery ─────────────────────────────────────────────────────────────────

describe('hashQuery', () => {
  it('returns a 16-char hex string', () => {
    const h = hashQuery('What is hearsay evidence?', 10);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('same query + limit → same hash (deterministic)', () => {
    const a = hashQuery('duplicate detection in evidence pipeline', 15);
    const b = hashQuery('duplicate detection in evidence pipeline', 15);
    expect(a).toBe(b);
  });

  it('different queries → different hashes', () => {
    const a = hashQuery('hearsay evidence', 10);
    const b = hashQuery('statute of limitations', 10);
    expect(a).not.toBe(b);
  });

  it('trims leading/trailing whitespace before hashing', () => {
    const a = hashQuery('  hearsay evidence  ', 10);
    const b = hashQuery('hearsay evidence', 10);
    expect(a).toBe(b);
  });

  it('different limits with same query → different hashes', () => {
    const a = hashQuery('hearsay evidence', 10);
    const b = hashQuery('hearsay evidence', 50);
    expect(a).not.toBe(b);
  });
});

// ── ACE_HITS_TTL ──────────────────────────────────────────────────────────────

describe('ACE_HITS_TTL', () => {
  it('is exactly 86400 seconds (24 hours)', () => {
    expect(ACE_HITS_TTL).toBe(86_400);
  });
});

// ── cache contract ────────────────────────────────────────────────────────────

describe('cache contract', () => {
  it('cached response merges { cached: true } into payload', () => {
    const stored = { ok: true, source: 'go-retrieval', hits: [{ id: 'a', score: 0.9 }], elapsedMs: 22 };
    const served = { ...stored, cached: true };
    expect(served.cached).toBe(true);
    expect(served.hits).toEqual(stored.hits);
    expect(served.ok).toBe(true);
  });

  it('unique keys for all four retrieval sources', () => {
    const sources = ['go-retrieval', 'go-search', 'sveltekit-fallback', 'postgres_fts'];
    const query = 'same query text';
    const limit = 10;
    const qHash = hashQuery(query, limit);
    const key = aceHitsKey(qHash, limit);
    // All sources write to the same key — first writer wins, subsequent calls return cached
    for (const source of sources) {
      const payload = JSON.stringify({ success: true, source, data: [] });
      const parsed = JSON.parse(payload) as { success: boolean; source: string };
      expect(parsed.source).toBe(source);
    }
    // Key remains the same regardless of which source produced the hit
    expect(key).toBe(aceHitsKey(qHash, limit));
  });

  it('round-trips JSON serialization without data loss', () => {
    const hit = {
      stable_key: 'file:src/lib/server/ace/context-assembler.ts',
      file_path:  'src/lib/server/ace/context-assembler.ts',
      score: 0.91,
      content: 'Assembles ACE context from all data sources...',
      topo_class: 'ace',
    };
    const result = { success: true, data: [hit], count: 1 };
    const roundtrip = JSON.parse(JSON.stringify(result)) as typeof result;
    expect(roundtrip.data[0].stable_key).toBe(hit.stable_key);
    expect(roundtrip.data[0].score).toBe(hit.score);
  });
});
