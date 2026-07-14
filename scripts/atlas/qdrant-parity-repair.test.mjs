#!/usr/bin/env node
/**
 * Unit tests for qdrant-parity-contract.mjs pure-logic functions.
 *
 * No live Postgres or Qdrant required — all infrastructure calls are
 * bypassed by importing the shared contract module directly.
 *
 * Run:
 *   node --test scripts/atlas/qdrant-parity-repair.test.mjs
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  COLLECTION_CONTRACTS,
  resolveSample,
  classifyParity,
  buildCanonicalPayload,
  generateRepairEvents,
  computeOverallStatus,
  outboxEventId,
} from './qdrant-parity-contract.mjs';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CONTRACT            = COLLECTION_CONTRACTS.codebase_chunks_384;
const COLLECTION          = 'codebase_chunks_384';
const LEGACY_COLLECTION   = 'codebase_chunks_768';
const LEGACY_CONTRACT     = COLLECTION_CONTRACTS.codebase_chunks_768;
const V2_COLLECTION       = 'codebase_chunks_384_v2';
const V2_CONTRACT         = COLLECTION_CONTRACTS.codebase_chunks_384_v2;

const makeVec = (dim) => new Array(dim).fill(0.1);

const basePgRow = {
  id:              'pg-001',
  packet_key:      'ace:packet:auth:001',
  source_ref:      'src/lib/server/auth.ts',
  qdrant_point_id: 'qdrant-001',
  feature_id:      'auth.sessions',
  domain_class:    'auth',
  summary:         'Validates Lucia sessions.',
  title_id:        'title:abc12345',
  tags:            ['auth', 'sessions'],
  aggregate_version: 7,
  classifier_version: '1.0.0',
  title_generator_version: '2.0.0',
  reranker_version: '3.0.0',
  updated_at:      new Date('2026-01-01T00:00:00Z'),
};

// basePoint satisfies the codebase_chunks_384 contract (requiredVectors: content_384, signature_384)
const basePoint = {
  id: 'qdrant-001',
  payload: {
    packet_key:        basePgRow.packet_key,
    source_ref:        basePgRow.source_ref,
    feature_id:        basePgRow.feature_id,
    domain_class:      basePgRow.domain_class,
    summary:           basePgRow.summary,
    title_id:          basePgRow.title_id,
    aggregate_version: 7,
    bm42_sparse:       { indices: [1, 2], values: [0.5, 0.3] },
  },
  vectors: {
    content_384:   makeVec(384),
    summary_384:   makeVec(384),
    signature_384: makeVec(384),
    latent64:      makeVec(64),
  },
};

// legacyPoint satisfies the codebase_chunks_768 contract (requiredVectors: content, signature)
const legacyPoint = {
  id: 'qdrant-001',
  payload: {
    packet_key:        basePgRow.packet_key,
    source_ref:        basePgRow.source_ref,
    feature_id:        basePgRow.feature_id,
    domain_class:      basePgRow.domain_class,
    summary:           basePgRow.summary,
    title_id:          basePgRow.title_id,
    aggregate_version: 7,
    bm42_sparse:       { indices: [1], values: [0.5] },
  },
  vectors: {
    content:   makeVec(768),
    summary:   makeVec(768),
    signature: makeVec(768),
    error:     makeVec(768),
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resolveSample', () => {
  it('returns default 50 when no arg, env, or npm_config present', () => {
    const result = resolveSample(['node', 'script.mjs'], {});
    assert.deepEqual(result, { value: 50, source: 'default' });
  });

  it('prefers --sample argument over env', () => {
    const result = resolveSample(
      ['node', 'script.mjs', '--sample', '20'],
      { ATLAS_QDRANT_PARITY_SAMPLE: '999' },
    );
    assert.deepEqual(result, { value: 20, source: 'argument' });
  });

  it('falls back to ATLAS_QDRANT_PARITY_SAMPLE env', () => {
    const result = resolveSample(['node', 'script.mjs'], { ATLAS_QDRANT_PARITY_SAMPLE: '75' });
    assert.deepEqual(result, { value: 75, source: 'environment' });
  });

  it('falls back to npm_config_sample', () => {
    const result = resolveSample(['node', 'script.mjs'], { npm_config_sample: '30' });
    assert.deepEqual(result, { value: 30, source: 'npm_config' });
  });
});

describe('classifyParity — ok state', () => {
  it('returns ok when point matches and all required vectors present', () => {
    const row = classifyParity(basePgRow, basePoint, CONTRACT);
    assert.equal(row.state, 'ok');
    assert.deepEqual(row.reasons, []);
    assert.equal(row.point_present, true);
    assert.equal(row.packet_key_matches, true);
    assert.equal(row.source_ref_matches, true);
    assert.equal(row.bm42_present, true);
    assert.equal(row.vector_presence.content_384, true);
    assert.equal(row.vector_presence.signature_384, true);
  });

  it('ok state has required_complete=true', () => {
    const row = classifyParity(basePgRow, basePoint, CONTRACT);
    assert.equal(row.required_complete, true);
  });

  it('ok state with all recommended vectors has optional_complete=true', () => {
    const row = classifyParity(basePgRow, basePoint, CONTRACT);
    // codebase_chunks_384 has recommendedVectors: ['summary_384']
    // basePoint has summary_384 present
    assert.equal(row.optional_complete, true);
    assert.deepEqual(row.missing_optional_components, []);
  });

  it('ok state with missing recommended vector still has required_complete=true but optional_complete=false', () => {
    const pointWithoutSummary = {
      ...basePoint,
      vectors: {
        content_384:   makeVec(384),
        signature_384: makeVec(384),
        latent64:      makeVec(64),
        // summary_384 absent — recommended, not required
      },
    };
    const row = classifyParity(basePgRow, pointWithoutSummary, CONTRACT);
    assert.equal(row.state, 'ok');            // missing recommended does NOT change state
    assert.equal(row.required_complete, true);
    assert.equal(row.optional_complete, false);
    assert.ok(row.missing_optional_components.includes('summary_384'));
    assert.deepEqual(row.reasons, []);        // reasons stays empty for optional gaps
  });
});

describe('classifyParity — missing_point', () => {
  it('returns missing_point when point is null', () => {
    const row = classifyParity(basePgRow, null, CONTRACT);
    assert.equal(row.state, 'missing_point');
    assert.equal(row.point_present, false);
    assert.ok(row.reasons.some(r => r.includes('absent')));
  });

  it('missing_point sets required_complete=false and optional_complete=false', () => {
    const row = classifyParity(basePgRow, null, CONTRACT);
    assert.equal(row.required_complete, false);
    assert.equal(row.optional_complete, false);
  });
});

describe('classifyParity — identity_contradiction', () => {
  it('flags wrong packet_key as identity_contradiction', () => {
    const point = {
      ...basePoint,
      payload: { ...basePoint.payload, packet_key: 'ace:packet:WRONG' },
    };
    const row = classifyParity(basePgRow, point, CONTRACT);
    assert.equal(row.state, 'identity_contradiction');
    assert.ok(row.packet_key_matches === false);
    assert.ok(row.reasons.some(r => r.includes('packet_key')));
  });

  it('flags wrong source_ref as identity_contradiction', () => {
    const point = {
      ...basePoint,
      payload: { ...basePoint.payload, source_ref: 'src/lib/WRONG.ts' },
    };
    const row = classifyParity(basePgRow, point, CONTRACT);
    assert.equal(row.state, 'identity_contradiction');
    assert.ok(row.source_ref_matches === false);
    assert.ok(row.reasons.some(r => r.includes('source_ref')));
  });

  it('flags both wrong packet_key and wrong source_ref, accumulates both reasons', () => {
    const point = {
      ...basePoint,
      payload: {
        ...basePoint.payload,
        packet_key: 'ace:packet:WRONG',
        source_ref: 'src/lib/WRONG.ts',
      },
    };
    const row = classifyParity(basePgRow, point, CONTRACT);
    assert.equal(row.state, 'identity_contradiction');
    assert.equal(row.reasons.length, 2);
  });
});

describe('classifyParity — projection_contradiction', () => {
  it('flags wrong vector dimension as projection_contradiction', () => {
    const point = {
      ...basePoint,
      vectors: {
        ...basePoint.vectors,
        content_384: makeVec(768),   // wrong dim — 768 instead of 384
      },
    };
    const row = classifyParity(basePgRow, point, CONTRACT);
    assert.equal(row.state, 'projection_contradiction');
    assert.ok(row.reasons.some(r => r.includes('content_384') && r.includes('768')));
  });
});

describe('classifyParity — incomplete_point', () => {
  it('returns incomplete_point when a required vector is absent', () => {
    const point = {
      ...basePoint,
      vectors: {
        // content_384 present, signature_384 absent
        content_384: makeVec(384),
        summary_384: makeVec(384),
        latent64:    makeVec(64),
      },
    };
    const row = classifyParity(basePgRow, point, CONTRACT);
    assert.equal(row.state, 'incomplete_point');
    assert.ok(row.reasons.some(r => r.includes('signature_384')));
    assert.equal(row.vector_presence.content_384, true);
    assert.equal(row.vector_presence.signature_384, false);
  });

  it('incomplete_point sets required_complete=false', () => {
    const point = {
      ...basePoint,
      vectors: { content_384: makeVec(384), latent64: makeVec(64) },
    };
    const row = classifyParity(basePgRow, point, CONTRACT);
    assert.equal(row.required_complete, false);
    assert.ok(row.missing_required_components.includes('signature_384'));
  });
});

describe('classifyParity — stale_point', () => {
  it('returns stale_point when payload field drifts from Postgres', () => {
    const point = {
      ...basePoint,
      payload: {
        ...basePoint.payload,
        feature_id: 'auth.OLD_FEATURE',   // drifted
      },
    };
    const row = classifyParity(basePgRow, point, CONTRACT);
    assert.equal(row.state, 'stale_point');
    assert.ok(row.reasons.some(r => r.includes('feature_id')));
  });

  it('accumulates stale reasons on an already-incomplete point (no guard)', () => {
    // incomplete (missing signature_384) AND stale (domain_class drifted)
    const point = {
      ...basePoint,
      payload: {
        ...basePoint.payload,
        domain_class: 'STALE_CLASS',
      },
      vectors: {
        content_384: makeVec(384),
        summary_384: makeVec(384),
        latent64:    makeVec(64),
        // signature_384 absent
      },
    };
    const row = classifyParity(basePgRow, point, CONTRACT);
    assert.equal(row.state, 'incomplete_point');   // state set first; staleness reasons still appended
    const hasStaleness = row.reasons.some(r => r.includes('domain_class'));
    const hasMissing   = row.reasons.some(r => r.includes('signature_384'));
    assert.ok(hasStaleness, 'stale domain_class reason should accumulate');
    assert.ok(hasMissing,   'missing vector reason should also be present');
  });
});

describe('generateRepairEvents', () => {
  it('missing_point → single full_projection event with correct shape', () => {
    const parityRow = classifyParity(basePgRow, null, CONTRACT);
    const events = generateRepairEvents(parityRow, basePgRow, COLLECTION);
    assert.equal(events.length, 1);
    const [ev] = events;
    assert.equal(ev.event_type, 'full_projection');
    assert.equal(ev.packet_key, basePgRow.packet_key);
    assert.equal(ev.collection, COLLECTION);
    assert.ok(Array.isArray(ev.missing_components));
    assert.ok(ev.missing_components.includes('point'));
    assert.ok(ev.missing_components.includes('content_384'));
  });

  it('full_projection event is never a payload_repair event', () => {
    const parityRow = classifyParity(basePgRow, null, CONTRACT);
    const events = generateRepairEvents(parityRow, basePgRow, COLLECTION);
    assert.ok(events.every(e => e.event_type !== 'payload_repair'));
  });

  it('incomplete_point (missing required content_384) → payload_repair + summary_vector_repair', () => {
    // Remove content_384 (required) so state is incomplete_point.
    // summary_384 is also absent so we expect the summary_vector_repair lane too.
    const point = {
      ...basePoint,
      vectors: {
        signature_384: makeVec(384),
        latent64:      makeVec(64),
        // content_384 absent (required → incomplete_point)
        // summary_384 absent → summary_vector_repair lane fires
      },
    };
    const parityRow = classifyParity(basePgRow, point, CONTRACT);
    assert.equal(parityRow.state, 'incomplete_point');
    const events = generateRepairEvents(parityRow, basePgRow, COLLECTION);
    const types = events.map(e => e.event_type);
    assert.ok(types.includes('payload_repair'));
    assert.ok(types.includes('summary_vector_repair'));
  });

  it('stale_point → single payload_repair event', () => {
    const point = {
      ...basePoint,
      payload: { ...basePoint.payload, feature_id: 'STALE' },
    };
    const parityRow = classifyParity(basePgRow, point, CONTRACT);
    const events = generateRepairEvents(parityRow, basePgRow, COLLECTION);
    assert.equal(events.length, 1);
    assert.equal(events[0].event_type, 'payload_repair');
    assert.ok(typeof events[0].payload === 'object');
  });

  it('identity_contradiction → single quarantine event', () => {
    const point = {
      ...basePoint,
      payload: { ...basePoint.payload, packet_key: 'ace:packet:WRONG' },
    };
    const parityRow = classifyParity(basePgRow, point, CONTRACT);
    const events = generateRepairEvents(parityRow, basePgRow, COLLECTION);
    assert.equal(events.length, 1);
    assert.equal(events[0].event_type, 'quarantine');
  });

  it('projection_contradiction → single quarantine event', () => {
    const point = {
      ...basePoint,
      vectors: { ...basePoint.vectors, content_384: makeVec(768) },
    };
    const parityRow = classifyParity(basePgRow, point, CONTRACT);
    const events = generateRepairEvents(parityRow, basePgRow, COLLECTION);
    assert.equal(events.length, 1);
    assert.equal(events[0].event_type, 'quarantine');
  });

  it('quarantine events are never payload_repair events', () => {
    // identity contradiction
    const identityPoint  = { ...basePoint, payload: { ...basePoint.payload, packet_key: 'WRONG' } };
    const identityRow    = classifyParity(basePgRow, identityPoint, CONTRACT);
    const idEvents       = generateRepairEvents(identityRow, basePgRow, COLLECTION);
    assert.ok(idEvents.every(e => e.event_type !== 'payload_repair'),
      'quarantine events must never be payload_repair');

    // projection contradiction
    const projPoint  = { ...basePoint, vectors: { ...basePoint.vectors, content_384: makeVec(768) } };
    const projRow    = classifyParity(basePgRow, projPoint, CONTRACT);
    const projEvents = generateRepairEvents(projRow, basePgRow, COLLECTION);
    assert.ok(projEvents.every(e => e.event_type !== 'payload_repair'),
      'projection quarantine events must never be payload_repair');
  });

  it('ok state → no events', () => {
    const parityRow = classifyParity(basePgRow, basePoint, CONTRACT);
    const events = generateRepairEvents(parityRow, basePgRow, COLLECTION);
    assert.equal(events.length, 0);
  });
});

describe('computeOverallStatus', () => {
  it('PASS when all counters are zero', () => {
    assert.equal(computeOverallStatus({ contradictions: 0, missing_points: 0, stale_points: 0, incomplete_points: 0 }), 'PASS');
  });

  it('WARN when missing_points > 0, no contradictions', () => {
    assert.equal(computeOverallStatus({ contradictions: 0, missing_points: 3, stale_points: 0, incomplete_points: 0 }), 'WARN');
  });

  it('WARN when stale_points > 0, no contradictions', () => {
    assert.equal(computeOverallStatus({ contradictions: 0, missing_points: 0, stale_points: 2, incomplete_points: 0 }), 'WARN');
  });

  it('WARN when incomplete_points > 0, no contradictions', () => {
    assert.equal(computeOverallStatus({ contradictions: 0, missing_points: 0, stale_points: 0, incomplete_points: 1 }), 'WARN');
  });

  it('FAIL (exit 1) when contradictions > 0, regardless of other counters', () => {
    assert.equal(computeOverallStatus({ contradictions: 1, missing_points: 0, stale_points: 0, incomplete_points: 0 }), 'FAIL');
    assert.equal(computeOverallStatus({ contradictions: 1, missing_points: 5, stale_points: 5, incomplete_points: 5 }), 'FAIL');
  });

  it('FAIL takes priority over WARN', () => {
    const status = computeOverallStatus({ contradictions: 2, missing_points: 3, stale_points: 0, incomplete_points: 0 });
    assert.equal(status, 'FAIL');
  });
});

describe('outboxEventId', () => {
  it('produces the same ID for the same packet_key + event_type on repeated calls', () => {
    const id1 = outboxEventId('ace:packet:auth:001', 'payload_repair');
    const id2 = outboxEventId('ace:packet:auth:001', 'payload_repair');
    assert.equal(id1, id2);
  });

  it('produces different IDs for different packet keys', () => {
    const id1 = outboxEventId('ace:packet:auth:001', 'payload_repair');
    const id2 = outboxEventId('ace:packet:auth:002', 'payload_repair');
    assert.notEqual(id1, id2);
  });

  it('produces different IDs for different event types', () => {
    const id1 = outboxEventId('ace:packet:auth:001', 'payload_repair');
    const id2 = outboxEventId('ace:packet:auth:001', 'summary_vector_repair');
    assert.notEqual(id1, id2);
  });

  it('is 16 hex characters long', () => {
    const id = outboxEventId('ace:packet:auth:001', 'payload_repair');
    assert.match(id, /^[0-9a-f]{16}$/);
  });
});

describe('legacy collection guard', () => {
  it('generateRepairEvents still returns quarantine for identity_contradiction on legacy', () => {
    const point = {
      ...legacyPoint,
      payload: { ...legacyPoint.payload, packet_key: 'ace:packet:WRONG' },
    };
    const parityRow = classifyParity(basePgRow, point, LEGACY_CONTRACT);
    const events = generateRepairEvents(parityRow, basePgRow, LEGACY_COLLECTION);
    assert.equal(events[0].event_type, 'quarantine');
  });

  it('generateRepairEvents still emits payload_repair for legacy stale (caller must suppress for legacy)', () => {
    const stalePoint = {
      ...legacyPoint,
      payload: { ...legacyPoint.payload, feature_id: 'STALE_FEATURE' },
    };
    const parityRow = classifyParity(basePgRow, stalePoint, LEGACY_CONTRACT);
    assert.equal(parityRow.state, 'stale_point');
    const events = generateRepairEvents(parityRow, basePgRow, LEGACY_COLLECTION);
    assert.ok(events.some(e => e.event_type === 'payload_repair'),
      'event generated — caller must skip application for legacy');
  });
});

describe('collection contracts — structural assertions', () => {
  it('codebase_chunks_384 requires content_384 and signature_384', () => {
    const required = COLLECTION_CONTRACTS.codebase_chunks_384.requiredVectors;
    assert.ok(required.includes('content_384'));
    assert.ok(required.includes('signature_384'));
  });

  it('codebase_chunks_384_v2 requires only content_384 (initial minimum)', () => {
    const required = COLLECTION_CONTRACTS.codebase_chunks_384_v2.requiredVectors;
    assert.deepEqual(required, ['content_384']);
  });

  it('codebase_chunks_384_v2 recommends summary_384 and signature_384 (not required)', () => {
    const rec = COLLECTION_CONTRACTS.codebase_chunks_384_v2.recommendedVectors;
    assert.ok(rec.includes('summary_384'));
    assert.ok(rec.includes('signature_384'));
    const required = COLLECTION_CONTRACTS.codebase_chunks_384_v2.requiredVectors;
    assert.ok(!required.includes('summary_384'));
    assert.ok(!required.includes('signature_384'));
  });

  it('codebase_chunks_384 is not legacy', () => {
    assert.equal(COLLECTION_CONTRACTS.codebase_chunks_384.legacy, false);
  });

  it('codebase_chunks_384_v2 is not legacy', () => {
    assert.equal(COLLECTION_CONTRACTS.codebase_chunks_384_v2.legacy, false);
  });

  it('codebase_chunks_768 is legacy', () => {
    assert.equal(COLLECTION_CONTRACTS.codebase_chunks_768.legacy, true);
  });

  it('all namedVectors dimensions are positive integers', () => {
    for (const [colName, contract] of Object.entries(COLLECTION_CONTRACTS)) {
      for (const [vecName, dim] of Object.entries(contract.namedVectors)) {
        assert.ok(Number.isInteger(dim) && dim > 0,
          `${colName}.${vecName} dimension must be a positive integer, got ${dim}`);
      }
    }
  });

  it('384-collection vectors are correct dimensions per contract', () => {
    const vecs = COLLECTION_CONTRACTS.codebase_chunks_384.namedVectors;
    assert.equal(vecs.content_384, 384);
    assert.equal(vecs.summary_384, 384);
    assert.equal(vecs.signature_384, 384);
    assert.equal(vecs.latent64, 64);
  });

  it('384-v2-collection vectors match 384-collection dimensions', () => {
    const v1 = COLLECTION_CONTRACTS.codebase_chunks_384.namedVectors;
    const v2 = COLLECTION_CONTRACTS.codebase_chunks_384_v2.namedVectors;
    for (const [name, dim] of Object.entries(v2)) {
      if (v1[name] !== undefined) {
        assert.equal(v2[name], v1[name],
          `${name} dimension must match between v1 and v2 contracts`);
      }
    }
  });

  it('768-collection vectors are correct dimensions per contract', () => {
    const vecs = COLLECTION_CONTRACTS.codebase_chunks_768.namedVectors;
    assert.equal(vecs.content, 768);
    assert.equal(vecs.summary, 768);
    assert.equal(vecs.signature, 768);
    assert.equal(vecs.error, 768);
  });

  it('each contract has a contractVersion string', () => {
    for (const [name, contract] of Object.entries(COLLECTION_CONTRACTS)) {
      assert.equal(typeof contract.contractVersion, 'string',
        `${name} must have a contractVersion string`);
      assert.ok(contract.contractVersion.length > 0);
    }
  });
});

describe('v2 contract — optional/required completeness split', () => {
  it('v2 ok state with only content_384 has required_complete=true, optional_complete=false', () => {
    const minimalPoint = {
      id: 'qdrant-001',
      payload: {
        packet_key:   basePgRow.packet_key,
        source_ref:   basePgRow.source_ref,
        feature_id:   basePgRow.feature_id,
        domain_class: basePgRow.domain_class,
        summary:      basePgRow.summary,
        title_id:     basePgRow.title_id,
      },
      vectors: {
        content_384: makeVec(384),
        // summary_384 absent (recommended, not required)
        // signature_384 absent (recommended, not required)
        // latent64 absent (routing, not required)
      },
    };
    const row = classifyParity(basePgRow, minimalPoint, V2_CONTRACT);
    assert.equal(row.state, 'ok');
    assert.equal(row.required_complete, true);
    assert.equal(row.optional_complete, false);
    assert.ok(row.missing_optional_components.includes('summary_384'));
    assert.ok(row.missing_optional_components.includes('signature_384'));
    assert.deepEqual(row.missing_required_components, []);
    assert.deepEqual(row.reasons, []);
  });

  it('v2 missing content_384 is incomplete_point (required)', () => {
    const emptyPoint = {
      id: 'qdrant-001',
      payload: { packet_key: basePgRow.packet_key, source_ref: basePgRow.source_ref },
      vectors: {
        summary_384:   makeVec(384),
        signature_384: makeVec(384),
      },
    };
    const row = classifyParity(basePgRow, emptyPoint, V2_CONTRACT);
    assert.equal(row.state, 'incomplete_point');
    assert.equal(row.required_complete, false);
    assert.ok(row.missing_required_components.includes('content_384'));
  });
});
