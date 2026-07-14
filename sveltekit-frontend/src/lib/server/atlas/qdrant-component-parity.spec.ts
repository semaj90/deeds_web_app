// @vitest-environment node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const parityCore = await import(
  pathToFileURL(
    path.resolve(
      process.cwd(),
      '..',
      'scripts',
      'atlas',
      'qdrant-parity-repair-core.mjs',
    ),
  ).href,
);

const {
  COLLECTION_CONTRACTS,
  applyPayloadRepair,
  classifyParity,
  computeOverallStatus,
  generateRepairEvents,
  resolveCollectionConfiguration,
  resolveSampleConfiguration,
  validateVectorContract,
} = parityCore;

function makeCanonicalCollectionInfo() {
  return {
    result: {
      points_count: 1,
      config: {
        params: {
          vectors: {
            content_384: { size: 384, distance: 'Cosine' },
            summary_384: { size: 384, distance: 'Cosine' },
            signature_384: { size: 384, distance: 'Cosine' },
            latent64: { size: 64, distance: 'Cosine' },
          },
          sparse_vectors: {
            bm42_sparse: { index: true },
          },
        },
      },
      payload_schema: {
        fields: {
          packet_key: {},
          source_ref: {},
          qdrant_point_id: {},
          aggregate_version: {},
        },
      },
    },
  };
}

function makeCanonicalPoint(overrides = {}) {
  return {
    id: 'point-1',
    payload: {
      packet_id: 'packet-1',
      packet_key: 'packet:1',
      source_ref: 'src/app.ts',
      qdrant_point_id: 'point-1',
      feature_id: 'feature-1',
      qdrant_payload_version: 'v1',
      bm42_sparse: { indices: [1], values: [1] },
      ...overrides.payload,
    },
    vector: {
      content_384: new Array(384).fill(0),
      summary_384: new Array(384).fill(0),
      signature_384: new Array(384).fill(0),
      latent64: new Array(64).fill(0),
    },
    sparse_vectors: {
      bm42_sparse: {
        indices: [1],
        values: [1],
      },
    },
    ...overrides.point,
  };
}

describe('qdrant component parity logic', () => {
  it('resolves sample configuration in precedence order', () => {
    const cli = resolveSampleConfiguration(['node', 'x', '--sample', '12'], {});
    expect(cli.requested).toBe(12);
    expect(cli.source).toBe('cli');

    const env = resolveSampleConfiguration(['node', 'x'], { ATLAS_QDRANT_PARITY_SAMPLE: '18' });
    expect(env.requested).toBe(18);
    expect(env.source).toBe('environment');

    const npm = resolveSampleConfiguration(['node', 'x'], { npm_config_sample: '21' });
    expect(npm.requested).toBe(21);
    expect(npm.source).toBe('npm_config');
  });

  it('resolves explicit canonical and legacy collection contracts', () => {
    const canonical = resolveCollectionConfiguration(['node', 'x', '--collection=codebase_chunks_384'], {});
    expect(canonical.requested).toBe('codebase_chunks_384');
    expect(canonical.contract).toEqual(COLLECTION_CONTRACTS.codebase_chunks_384);

    const legacy = resolveCollectionConfiguration(['node', 'x', '--collection', 'codebase_chunks_768'], {});
    expect(legacy.requested).toBe('codebase_chunks_768');
    expect(legacy.contract).toEqual(COLLECTION_CONTRACTS.codebase_chunks_768);
  });

  it('validates canonical vector contracts', () => {
    const validation = validateVectorContract(makeCanonicalCollectionInfo(), COLLECTION_CONTRACTS.codebase_chunks_384);
    expect(validation.status).toBe('PASS');
    expect(validation.collection_exists).toBe(true);
    expect(validation.legacy_collection).toBe(false);
  });

  it('fails vector contract validation on wrong dimensions', () => {
    const info = makeCanonicalCollectionInfo();
    info.result.config.params.vectors.summary_384.size = 768;
    const validation = validateVectorContract(info, COLLECTION_CONTRACTS.codebase_chunks_384);
    expect(validation.status).toBe('FAIL');
    expect(validation.issues.some((issue) => issue.startsWith('dimension_mismatch:summary_384'))).toBe(true);
  });

  it('classifies row parity states without touching stores', () => {
    const row = {
      packet_id: 'packet-1',
      packet_key: 'packet:1',
      source_ref: 'src/app.ts',
      qdrant_point_id: 'point-1',
      metadata: { qdrant_payload_version: 'v1' },
    };
    const point = makeCanonicalPoint();

    expect(classifyParity({ row, point: null, contract: COLLECTION_CONTRACTS.codebase_chunks_384 }).state).toBe('missing_point');
    expect(classifyParity({
      row,
      point: makeCanonicalPoint({ payload: { packet_key: 'packet:other' } }),
      contract: COLLECTION_CONTRACTS.codebase_chunks_384,
    }).state).toBe('identity_contradiction');
    expect(classifyParity({
      row,
      point: makeCanonicalPoint({ payload: { qdrant_point_id: 'wrong-point' } }),
      contract: COLLECTION_CONTRACTS.codebase_chunks_384,
    }).state).toBe('identity_contradiction');
    expect(classifyParity({
      row,
      point: makeCanonicalPoint({ point: { vector: { summary_384: new Array(768).fill(0) } } }),
      contract: COLLECTION_CONTRACTS.codebase_chunks_384,
    }).state).toBe('projection_contradiction');
    expect(classifyParity({ row, point, contract: COLLECTION_CONTRACTS.codebase_chunks_384 }).state).toBe('ok');
  });

  it('computes overall status from contradiction and coverage debt', () => {
    expect(computeOverallStatus({ contradictions: [{ reason: 'x' }] })).toBe('FAIL');
    expect(computeOverallStatus({ missingPoints: [{ reason: 'x' }] })).toBe('WARN');
    expect(computeOverallStatus({ stalePoints: [{ reason: 'x' }] })).toBe('WARN');
    expect(computeOverallStatus({ incompletePoints: [{ reason: 'x' }] })).toBe('WARN');
    expect(computeOverallStatus({})).toBe('PASS');
  });

  it('generates bounded repair events and rejects quarantine payload application', () => {
    const classifiedRows = [
      { state: 'missing_point', packet_id: 'p1', packet_key: 'packet:1', qdrant_point_id: 'q1', reasons: ['missing_point'] },
      { state: 'stale_point', packet_id: 'p2', packet_key: 'packet:2', qdrant_point_id: 'q2', reasons: ['aggregate_version_mismatch'] },
      {
        state: 'incomplete_point',
        packet_id: 'p3',
        packet_key: 'packet:3',
        qdrant_point_id: 'q3',
        completeness: {
          required_complete: true,
          optional_complete: false,
          missing_required_vectors: [],
          missing_optional_vectors: ['summary_384'],
        },
        reasons: ['missing optional vector "summary_384"'],
      },
      { state: 'identity_contradiction', packet_id: 'p4', packet_key: 'packet:4', qdrant_point_id: 'q4', reasons: ['packet_key_mismatch'] },
    ];
    const events = generateRepairEvents({ collection: 'codebase_chunks_384', classifiedRows });
    expect(events.map((event) => event.kind)).toEqual([
      'full_projection',
      'payload_repair',
      'summary_vector_repair',
      'quarantine',
    ]);
    expect(() => applyPayloadRepair({ kind: 'quarantine' })).toThrow(/quarantine/i);
    expect(() => applyPayloadRepair({ kind: 'full_projection' })).toThrow(/full_projection/i);
  });
});
