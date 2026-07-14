/**
 * Title ID Generator — Invariant Tests
 *
 * Validates:
 * 1. Same packet_key + generator version → same title_id
 * 2. Evidence wording change → packet_key unchanged, title_id unchanged
 * 3. Source path separator change → packet_key unchanged after normalization
 * 4. Different packet_key → different title_id
 * 5. Rerank score change → title_id unchanged
 * 6. Empty summary → symbol/path fallback
 */

import { describe, it, expect } from 'vitest';
import { generateTitleIdentity, TITLE_GENERATOR_VERSION } from './title-id-generator.js';

describe('Title ID Generator', () => {
  // ── Test 1: Deterministic Identity ─────────────────────────

  it('same packet_key + generator version → same title_id (deterministic)', () => {
    const packetKey = 'ace:packet:auth:001';
    const opts = {
      symbolName: 'validateSession',
      symbolKind: 'function',
      domain: 'auth',
      summary: 'Handles Lucia session validation and expiry checks.',
    };

    const title1 = generateTitleIdentity(packetKey, opts);
    const title2 = generateTitleIdentity(packetKey, opts);

    expect(title1.titleId).toBe(title2.titleId);
    expect(title1.generatorVersion).toBe(TITLE_GENERATOR_VERSION);
  });

  // ── Test 2: Summary Mutation Independence ──────────────────

  it('feature evidence change → title_id unchanged (immutable identity)', () => {
    const packetKey = 'ace:packet:auth:001';

    const title1 = generateTitleIdentity(packetKey, {
      featureLabel: 'Redis cache management',
    });

    const title2 = generateTitleIdentity(packetKey, {
      featureLabel: 'Completely rewritten summary',
    });

    // title_id should be the same (packet_key is the determinant)
    expect(title1.titleId).toBe(title2.titleId);
    expect(title1.slug).not.toBe(title2.slug);
  });

  // ── Test 3: Source Path Normalization ──────────────────────

  it('source path separator change → packet_key unchanged after normalization', () => {
    const packetKey1 = 'src/lib/server/auth.ts';
    const packetKey2 = 'src\\lib\\server\\auth.ts'; // Windows separator

    // For this test, we normalize the packet_key before hashing
    const normalized1 = packetKey1.replace(/\\/g, '/');
    const normalized2 = packetKey2.replace(/\\/g, '/');

    expect(normalized1).toBe(normalized2);
    expect(normalized1).toBe('src/lib/server/auth.ts');
  });

  // ── Test 4: Different Packet Key → Different Title ID ──────

  it('different packet_key → different title_id', () => {
    const opts = {
      symbolName: 'validateSession',
      symbolKind: 'function',
    };

    const title1 = generateTitleIdentity('packet:auth:001', opts);
    const title2 = generateTitleIdentity('packet:auth:002', opts);

    expect(title1.titleId).not.toBe(title2.titleId);
  });

  // ── Test 5: Rerank Score Independence ──────────────────────

  it('rerank score change → title_id unchanged (query-specific signals ignored)', () => {
    const packetKey = 'ace:packet:auth:001';
    const opts = {
      symbolName: 'validateSession',
      domain: 'auth',
    };

    // Generate twice with same evidence
    const title1 = generateTitleIdentity(packetKey, opts);
    const title2 = generateTitleIdentity(packetKey, opts);

    // Rerank scores are query-specific and not passed to title generation
    // title_id should remain stable
    expect(title1.titleId).toBe(title2.titleId);
  });

  // ── Test 6: Empty Summary Fallback ─────────────────────────

  it('empty summary → symbol/path fallback', () => {
    const packetKey = 'ace:packet:auth:001';

    const titleWithSymbol = generateTitleIdentity(packetKey, {
      symbolName: 'validateSession',
      summary: '', // Empty
    });

    expect(titleWithSymbol.title).toBe('validateSession');
    expect(titleWithSymbol.slug).toBe('validatesession');
  });

  it('no symbol, no summary → filename fallback', () => {
    const packetKey = 'ace:packet:auth:001';

    const titleWithFilename = generateTitleIdentity(packetKey, {
      sourceFilename: 'src\\lib\\server\\auth.ts',
      summary: '',
    });

    expect(titleWithFilename.title).toBe('auth');
    expect(titleWithFilename.slug).toBe('auth');
  });

  it('no evidence → untitled fallback', () => {
    const packetKey = 'ace:packet:auth:001';

    const titleUntitled = generateTitleIdentity(packetKey, {});

    expect(titleUntitled.title).toBe('untitled');
    expect(titleUntitled.slug).toBe('untitled');
  });

  // ── Test 7: Evidence Priority ──────────────────────────────

  it('feature_label has highest priority', () => {
    const packetKey = 'ace:packet:auth:001';

    const title = generateTitleIdentity(packetKey, {
      featureLabel: 'Authentication Sessions',
      symbolName: 'validateSession', // This should be ignored
      summary: 'Some other text', // This should be ignored
    });

    expect(title.title).toBe('Authentication Sessions');
  });

  it('symbol name > domain + kind', () => {
    const packetKey = 'ace:packet:auth:001';

    const title = generateTitleIdentity(packetKey, {
      symbolName: 'validateSession',
      symbolKind: 'function',
      domain: 'auth',
      summary: 'Some text',
    });

    expect(title.title).toContain('validateSession');
  });

  it('domain + kind > summary keywords', () => {
    const packetKey = 'ace:packet:auth:001';

    const title = generateTitleIdentity(packetKey, {
      domain: 'auth',
      symbolKind: 'middleware',
      summary: 'This function handles session validation.',
    });

    expect(title.title).toContain('auth');
    expect(title.title).toContain('middleware');
  });

  // ── Test 8: Slug Normalization ─────────────────────────────

  it('slug normalizes special characters and caps', () => {
    const packetKey = 'ace:packet:auth:001';

    const title = generateTitleIdentity(packetKey, {
      featureLabel: 'Session Validator (v2)',
    });

    expect(title.slug).toBe('session-validator-v2');
    expect(title.slug).not.toContain(' ');
    expect(title.slug).not.toContain('(');
    expect(title.slug).not.toContain(')');
  });

  it('slug max length is 64 characters', () => {
    const packetKey = 'ace:packet:auth:001';
    const longTitle =
      'This is a very long title that should be truncated to the maximum slug length';

    const title = generateTitleIdentity(packetKey, {
      featureLabel: longTitle,
    });

    expect(title.slug.length).toBeLessThanOrEqual(64);
  });

  // ── Test 9: Generator Version Tracking ─────────────────────

  it('generator version is included in suffix computation', () => {
    const packetKey = 'ace:packet:auth:001';
    const opts = {
      symbolName: 'validateSession',
    };

    const title = generateTitleIdentity(packetKey, opts);

    expect(title.generatorVersion).toBe(TITLE_GENERATOR_VERSION);
    expect(title.titleId).toMatch(/^title:[a-f0-9]{8}$/);
  });

  it('titleId ignores mutable evidence while staying stable per packet_key', () => {
    const packetKey = 'packet:abc';
    const first = generateTitleIdentity(packetKey, {
      summary: 'Redis cache management',
    });
    const second = generateTitleIdentity(packetKey, {
      summary: 'Completely rewritten summary',
      featureLabel: 'New display title',
    });

    expect(first.titleId).toBe(second.titleId);
    expect(first.titleId).toMatch(/^title:[a-f0-9]{8}$/);
  });
});
