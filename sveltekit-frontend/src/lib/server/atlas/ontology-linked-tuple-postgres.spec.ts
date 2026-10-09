import { describe, expect, it, vi } from 'vitest';
import type { OntologyLinkedTupleV1 } from './contracts/ontology-linked-tuple-v1.js';

const queryMock = vi.fn().mockResolvedValue({ rows: [] });
vi.mock('$lib/server/db/client.js', () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }));

function tuple(overrides: Partial<OntologyLinkedTupleV1> = {}): OntologyLinkedTupleV1 {
  return {
    tupleId: 'tuple:pg-test-1',
    schemaVersion: 'ontology-linked-tuple.v1',
    packetKey: 'packet:pg-test-1',
    sourceRef: 'taxonomy:node-1',
    surfaceText: 'authentication',
    label: 'authentication',
    labelKind: 'ontology',
    labelSource: 'semantic_tagger',
    ontologyIds: ['ontology:auth'],
    conceptIds: ['concept:auth'],
    participants: [],
    evidenceRefs: [],
    confidence: 0.85,
    evidenceState: 'ACTIVE_VERIFIED',
    lifecycle: 'OBSERVED',
    provenance: {
      sourceTables: ['taxonomy_nodes'],
      labelerVersion: null,
      taggerVersion: null,
      ontologyVersion: null,
      nlpVersion: null,
    },
    ...overrides,
  } as OntologyLinkedTupleV1;
}

describe('KAG-01/02: persistOntologyLinkedTuples', () => {
  it('upserts a single tuple with the correct column mapping and JSON encoding', async () => {
    queryMock.mockClear();
    const { persistOntologyLinkedTuples } = await import('./ontology-linked-tuple-postgres.js');
    const result = await persistOntologyLinkedTuples([tuple()], 'test-producer:v1');

    expect(result).toEqual({ attempted: 1, written: 1, errors: [] });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (tuple_id) DO UPDATE');
    expect(params[0]).toBe('tuple:pg-test-1');
    expect(params[13]).toEqual(['ontology:auth']); // ontology_ids
    expect(JSON.parse(params[22])).toEqual({ // provenance
      sourceTables: ['taxonomy_nodes'],
      labelerVersion: null,
      taggerVersion: null,
      ontologyVersion: null,
      nlpVersion: null,
    });
  });

  it('passes grounded lineage and span checksum through the existing JSONB columns', async () => {
    queryMock.mockClear();
    const { persistOntologyLinkedTuples } = await import('./ontology-linked-tuple-postgres.js');
    const grounded = tuple({
      evidenceSpan: { sourceRef: 'src/fixture.ts', start: 6, end: 11 },
      provenance: {
        sourceTables: [],
        labelerVersion: null,
        taggerVersion: null,
        ontologyVersion: 'ontology:fixture-v1',
        nlpVersion: 'extractor:fixture-v1',
        sourceRevision: `sha256:${'a'.repeat(64)}`,
        workspaceRevision: `sha256:${'b'.repeat(64)}`,
        taskRevision: `sha256:${'c'.repeat(64)}`,
        evidenceCardChecksum: `sha256:${'d'.repeat(64)}`,
        evidenceSpanChecksum: `sha256:${'e'.repeat(64)}`,
        inputDigest: 'grounded-nlp:fixture-fact',
      },
    });

    const result = await persistOntologyLinkedTuples([grounded], 'test-producer:v1');

    expect(result).toEqual({ attempted: 1, written: 1, errors: [] });
    const params = queryMock.mock.calls[0][1];
    expect(JSON.parse(params[18])).toEqual({ sourceRef: 'src/fixture.ts', start: 6, end: 11 });
    expect(JSON.parse(params[22])).toMatchObject({
      sourceRevision: grounded.provenance.sourceRevision,
      workspaceRevision: grounded.provenance.workspaceRevision,
      taskRevision: grounded.provenance.taskRevision,
      evidenceCardChecksum: grounded.provenance.evidenceCardChecksum,
      evidenceSpanChecksum: grounded.provenance.evidenceSpanChecksum,
      inputDigest: 'grounded-nlp:fixture-fact',
    });
  });

  it('is a no-op for an empty tuple array (never issues a query)', async () => {
    queryMock.mockClear();
    const { persistOntologyLinkedTuples } = await import('./ontology-linked-tuple-postgres.js');
    const result = await persistOntologyLinkedTuples([], 'test-producer:v1');

    expect(result).toEqual({ attempted: 0, written: 0, errors: [] });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('captures a per-row error instead of throwing and losing the whole batch', async () => {
    queryMock.mockClear();
    queryMock.mockRejectedValueOnce(new Error('duplicate key value'));
    const { persistOntologyLinkedTuples } = await import('./ontology-linked-tuple-postgres.js');
    const result = await persistOntologyLinkedTuples([tuple()], 'test-producer:v1');

    expect(result.attempted).toBe(1);
    expect(result.written).toBe(0);
    expect(result.errors).toEqual([{ tupleId: 'tuple:pg-test-1', message: 'duplicate key value' }]);
  });

  it('handles a null packetKey (optional on the contract) without crashing', async () => {
    queryMock.mockClear();
    const { persistOntologyLinkedTuples } = await import('./ontology-linked-tuple-postgres.js');
    const result = await persistOntologyLinkedTuples([tuple({ packetKey: undefined })], 'test-producer:v1');

    expect(result.written).toBe(1);
    const params = queryMock.mock.calls[0][1];
    expect(params[2]).toBeNull(); // packet_key
  });
});
