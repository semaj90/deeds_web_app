import { describe, expect, it } from 'vitest';
import { buildQdrantRepresentationMutationPlanV1 } from './qdrant-representation-index-mutation-plan-v1.js';
import type { QdrantSchemaDriftV1 } from './qdrant-representation-index-plan-v1.js';

function drift(overrides: Partial<QdrantSchemaDriftV1> = {}): QdrantSchemaDriftV1 {
  return {
    status: 'MISSING',
    missingRequiredRepresentations: [],
    missingOptionalRepresentations: [],
    representationConfigDrift: [],
    missingRequiredPayloadIndexes: [],
    missingOptionalPayloadIndexes: [],
    payloadTypeDrift: [],
    extraPayloadIndexes: [],
    applyAllowed: false,
    ...overrides,
  };
}

describe('QdrantRepresentationMutationPlanV1', () => {
  it('proposes BM25 sparse schema separately from point population', () => {
    const plan = buildQdrantRepresentationMutationPlanV1(drift({
      missingRequiredRepresentations: ['bm25'],
    }));

    expect(plan.blockers).toEqual([]);
    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]).toMatchObject({
      kind: 'ADD_SPARSE_VECTOR_SCHEMA',
      path: '/collections/codebase_chunks_768/vectors/bm25',
      body: { sparse: { modifier: 'idf' } },
      pointPopulation: false,
      touchesExistingDenseSlots: false,
    });
    expect(plan.pointPopulationAllowed).toBe(false);
    expect(plan.applyAllowed).toBe(false);
    expect(plan.qdrantWritesAllowed).toBe(false);
  });

  it('does not propose miniCOIL or SPLADE while they remain challenger-only', () => {
    const plan = buildQdrantRepresentationMutationPlanV1(drift({
      missingOptionalRepresentations: ['minicoil', 'splade'],
    }));
    expect(plan.operations).toEqual([]);
    expect(plan.blockers).toEqual([]);
  });

  it('blocks instead of recreating a required dense physical slot', () => {
    const plan = buildQdrantRepresentationMutationPlanV1(drift({
      missingRequiredRepresentations: ['content'],
    }));
    expect(plan.operations).toEqual([]);
    expect(plan.blockers).toEqual(['REQUIRED_DENSE_REPRESENTATION_MISSING:content']);
    expect(plan.denseSlotsProtected).toEqual(['content', 'error', 'signature']);
  });

  it('blocks all operation planning when an existing vector config has drifted', () => {
    const plan = buildQdrantRepresentationMutationPlanV1(drift({
      status: 'CONFIG_DRIFT',
      representationConfigDrift: ['content'],
      missingRequiredRepresentations: ['bm25'],
    }));
    expect(plan.operations).toEqual([]);
    expect(plan.blockers).toEqual(['EXISTING_REPRESENTATION_CONFIG_DRIFT:content']);
  });

  it('proposes only missing approved payload indexes and never payload backfill', () => {
    const plan = buildQdrantRepresentationMutationPlanV1(drift({
      missingRequiredPayloadIndexes: ['canonical_id', 'packet_key'],
      missingOptionalPayloadIndexes: ['workspace_revision', 'source_revision', 'pagerank'],
    }));
    expect(plan.operations.map((operation) => operation.operationId)).toEqual([
      'create-payload-index:canonical_id',
      'create-payload-index:packet_key',
      'create-payload-index:source_revision',
      'create-payload-index:workspace_revision',
    ]);
    expect(plan.operations.every((operation) => operation.pointPopulation === false)).toBe(true);
    expect(plan.operations.every((operation) => operation.revisionAuthorityMutation === false)).toBe(true);
    expect(plan.revisionPayloadBackfillAllowed).toBe(false);
  });

  it('blocks on payload type drift instead of silently replacing an index', () => {
    const plan = buildQdrantRepresentationMutationPlanV1(drift({
      status: 'TYPE_DRIFT',
      payloadTypeDrift: ['workspace_revision'],
      missingRequiredRepresentations: ['bm25'],
    }));
    expect(plan.operations).toEqual([]);
    expect(plan.blockers).toEqual(['EXISTING_PAYLOAD_INDEX_TYPE_DRIFT:workspace_revision']);
  });

  it('produces a deterministic SHA256 mutation plan digest', () => {
    const input = drift({ missingRequiredRepresentations: ['bm25'] });
    const a = buildQdrantRepresentationMutationPlanV1(input);
    const b = buildQdrantRepresentationMutationPlanV1(input);
    expect(a.mutationPlanSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(a.mutationPlanSha256).toBe(b.mutationPlanSha256);
  });
});
