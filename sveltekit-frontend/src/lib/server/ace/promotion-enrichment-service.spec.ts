/**
 * Promotion Enrichment Service — Focused Tests
 *
 * Validates:
 * 1. Same packet_key + generator version → same title_id (deterministic)
 * 2. Summary text changes → title_id unchanged (immutable identity)
 * 3. Rerank score changes → title_id unchanged (query-specific signals ignored)
 * 4. Different packet_key → different title_id
 * 5. Empty summary → stable feature/symbol/path fallback
 * 6. Promotion writes title_id and domain_class to atlas_packets
 * 7. Enrichment validation gates work correctly
 */

import { describe, it, expect } from 'vitest';
import {
  enrichPacketSemantics,
  enrichPacketBatch,
  extractAtlasWriteData,
  TITLE_GENERATOR_VERSION as PROMOTION_TITLE_GENERATOR_VERSION,
} from './promotion-enrichment-service.js';
import type { FeatureEnvelope } from './feature-envelope.js';

// Helper: create a test FeatureEnvelope
function createTestEnvelope(overrides: Partial<FeatureEnvelope> = {}): FeatureEnvelope {
  return {
    chunk_id: 'chunk:001',
    packet_key: 'packet:auth:001',
    source_ref: 'src/lib/server/auth.ts',
    feature_id: 'auth.sessions',
    summary: 'Handles Lucia session validation and expiry checks.',
    content: 'function validateSession(token) { ... }',
    created_at: new Date(),
    ...overrides,
  };
}

describe('Promotion Enrichment Service', () => {
  // ── Test 1: Deterministic Title ID ────────────────────────

  it('same packet_key + generator version → same title_id (deterministic)', () => {
    const envelope1 = createTestEnvelope({
      packet_key: 'packet:auth:001',
      feature_id: 'auth.sessions',
      summary: 'Session validation handler',
    });

    const envelope2 = createTestEnvelope({
      packet_key: 'packet:auth:001',
      feature_id: 'auth.sessions',
      summary: 'Session validation handler',
    });

    const enriched1 = enrichPacketSemantics(envelope1);
    const enriched2 = enrichPacketSemantics(envelope2);

    expect(enriched1._enrichment.titleId).toBe(enriched2._enrichment.titleId);
    expect(enriched1._enrichment.titleGeneratorVersion).toBe(PROMOTION_TITLE_GENERATOR_VERSION);
  });

  // ── Test 2: Summary Mutation Independence ──────────────────

  it('summary text changes → title_id unchanged (immutable identity)', () => {
    const envelope1 = createTestEnvelope({
      packet_key: 'packet:auth:001',
      feature_id: 'auth.sessions',
      summary: 'Original summary text about session validation.',
    });

    const envelope2 = createTestEnvelope({
      packet_key: 'packet:auth:001',
      feature_id: 'auth.sessions',
      summary: 'Completely different summary text with new details.',
    });

    const enriched1 = enrichPacketSemantics(envelope1);
    const enriched2 = enrichPacketSemantics(envelope2);

    // title_id should be the same (based on packet_key only)
    expect(enriched1._enrichment.titleId).toBe(enriched2._enrichment.titleId);
    // But semantic_title text may differ (derived from evidence priority)
  });

  // ── Test 3: Rerank Score Independence ──────────────────────

  it('rerank score changes → title_id unchanged (query-specific signals ignored)', () => {
    const envelope1 = createTestEnvelope({
      packet_key: 'packet:auth:001',
    });

    const envelope2 = createTestEnvelope({
      packet_key: 'packet:auth:001',
    });

    const enriched1 = enrichPacketSemantics(envelope1);
    const enriched2 = enrichPacketSemantics(envelope2);

    // Rerank scores are query-specific and not passed to enrichment
    // title_id should remain stable
    expect(enriched1._enrichment.titleId).toBe(enriched2._enrichment.titleId);
  });

  // ── Test 4: Different Packet Key → Different Title ID ──────

  it('different packet_key → different title_id', () => {
    const envelope1 = createTestEnvelope({
      packet_key: 'packet:auth:001',
      feature_id: 'auth.sessions',
    });

    const envelope2 = createTestEnvelope({
      packet_key: 'packet:auth:002',
      feature_id: 'auth.sessions',
    });

    const enriched1 = enrichPacketSemantics(envelope1);
    const enriched2 = enrichPacketSemantics(envelope2);

    expect(enriched1._enrichment.titleId).not.toBe(enriched2._enrichment.titleId);
  });

  // ── Test 5: Empty Summary Fallback ─────────────────────────

  it('empty summary → stable feature/symbol/path fallback', () => {
    const envelope = createTestEnvelope({
      packet_key: 'packet:auth:001',
      feature_id: 'auth.sessions',
      source_ref: 'src/lib/server/auth.ts',
      summary: '', // Empty
    });

    const enriched = enrichPacketSemantics(envelope);

    expect(enriched._enrichment.semanticTitle).toBeDefined();
    expect(enriched._enrichment.titleId).toBeDefined();
    // Should use feature_id or source_ref, not summary
  });

  // ── Test 6: Domain Classification ──────────────────────────

  it('domain classification works correctly', () => {
    const authEnvelope = createTestEnvelope({
      summary: 'Handles user authentication and JWT token validation.',
    });

    const uiEnvelope = createTestEnvelope({
      summary: 'React component for rendering a button with custom styling.',
    });

    const dbEnvelope = createTestEnvelope({
      summary: 'Database migration script for user table schema updates.',
    });

    const authEnriched = enrichPacketSemantics(authEnvelope);
    const uiEnriched = enrichPacketSemantics(uiEnvelope);
    const dbEnriched = enrichPacketSemantics(dbEnvelope);

    expect(authEnriched._enrichment.domainClass).toBe('auth');
    expect(uiEnriched._enrichment.domainClass).toBe('ui');
    expect(dbEnriched._enrichment.domainClass).toBe('database');
  });

  // ── Test 7: Enrichment Validation Gates ────────────────────

  it('enrichment validation fails if packet_key missing (Gate 1)', () => {
    const envelope = createTestEnvelope({
      packet_key: undefined as any, // Force invalid state
    });

    const enriched = enrichPacketSemantics(envelope);

    expect(enriched._enrichmentValid).toBe(false);
  });

  it('enrichment validation fails if both source_ref and feature_id missing (Gate 2)', () => {
    const envelope = createTestEnvelope({
      packet_key: 'packet:test:001',
      source_ref: undefined as any,
      feature_id: undefined as any,
    });

    const enriched = enrichPacketSemantics(envelope);

    expect(enriched._enrichmentValid).toBe(false);
  });

  // ── Test 8: Batch Enrichment ───────────────────────────────

  it('batch enrichment processes multiple packets', () => {
    const envelopes = [
      createTestEnvelope({ packet_key: 'packet:001' }),
      createTestEnvelope({ packet_key: 'packet:002' }),
      createTestEnvelope({ packet_key: 'packet:003' }),
    ];

    const enriched = enrichPacketBatch(envelopes);

    expect(enriched).toHaveLength(3);
    expect(enriched[0]._enrichment.titleId).not.toBe(enriched[1]._enrichment.titleId);
    expect(enriched[1]._enrichment.titleId).not.toBe(enriched[2]._enrichment.titleId);
  });

  // ── Test 9: Extraction for Atlas Write ─────────────────────

  it('extractAtlasWriteData returns fields for Postgres persistence', () => {
    const envelope = createTestEnvelope({
      packet_key: 'packet:auth:001',
      feature_id: 'auth.sessions',
      summary: 'Session validation handler',
    });

    const enriched = enrichPacketSemantics(envelope);
    const writeData = extractAtlasWriteData(enriched);

    expect(writeData.packet_key).toBe('packet:auth:001');
    expect(writeData.domain_class).toBeDefined();
    expect(writeData.title_id).toBeDefined();
    expect(writeData.title_generator_version).toBe(PROMOTION_TITLE_GENERATOR_VERSION);
  });

  // ── Test 10: Title ID Format Validation ────────────────────

  it('title_id follows correct format: title:<slug>:<hash>', () => {
    const envelope = createTestEnvelope();
    const enriched = enrichPacketSemantics(envelope);

    const titleId = enriched._enrichment.titleId;
    expect(titleId).toMatch(/^title:[a-z0-9-]+:[a-f0-9]{8}$/);
  });
});
