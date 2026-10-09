import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { projectGroundedNlpFactToOntologyTupleV1 } from './ontology-linked-tuple-v1.js';
import { groundNlpFeatureV1 } from '../../nlp/nlp-observation-lineage-v1.js';

const sourceBytes = Buffer.from('const x = 1;', 'utf8');
const digest = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const fact = groundNlpFeatureV1({
  feature: {
    kind: 'identifier',
    name: 'x',
    description: 'observed identifier',
    source: 'langextract',
    byteStart: 6,
    byteEnd: 11,
    rawText: 'x = 1',
    confidence: 0.8,
  },
  context: {
    sourceRef: 'openspec/changes/example/tasks.md',
    sourceRevision: digest(sourceBytes),
    workspaceRevision: 'workspace:fixture-v1',
    providerRevision: 'langextract:fixture-v1',
    producerRevision: 'atlas:nlp-extractor:fixture-v1',
  },
  sourceBytes,
  taskRef: 'openspec/changes/example/tasks.md#L5',
  canonicalTaskRef: 'openspec-task:example/EX-01',
  taskRevision: digest(Buffer.from('task block', 'utf8')),
  evidenceCardChecksum: digest(Buffer.from('evidence card', 'utf8')),
});

describe('projectGroundedNlpFactToOntologyTupleV1', () => {
  it('maps grounded fact lineage into the existing tuple contract as gated evidence', () => {
    const projection = projectGroundedNlpFactToOntologyTupleV1({
      fact,
      ontologyIds: ['ontology:code'],
      conceptIds: ['concept:identifier'],
      labelKind: 'tag',
      ontologyRevision: 'ontology:fixture-v1',
    });
    expect(projection.schema).toBe('atlas.grounded-nlp-ontology-projection.v1');
    expect(projection.tuple.evidenceState).toBe('GATED');
    expect(projection.tuple.provenance.sourceRevision).toBe(fact.sourceRevision);
    expect(projection.tuple.provenance.workspaceRevision).toBe(fact.workspaceRevision);
    expect(projection.tuple.provenance.taskRevision).toBe(fact.taskRevision);
    expect(projection.tuple.provenance.evidenceCardChecksum).toBe(fact.evidenceCardChecksum);
    expect(projection.tuple.provenance.evidenceSpanChecksum).toBe(`sha256:${fact.evidenceSpan.textSha256}`);
    const persistedProvenance = JSON.parse(JSON.stringify(projection.tuple.provenance)) as typeof projection.tuple.provenance;
    expect(persistedProvenance).toMatchObject({
      sourceRevision: fact.sourceRevision,
      workspaceRevision: fact.workspaceRevision,
      taskRevision: fact.taskRevision,
      evidenceCardChecksum: fact.evidenceCardChecksum,
      evidenceSpanChecksum: `sha256:${fact.evidenceSpan.textSha256}`,
    });
    expect(projection.tuple.provenance.producerRevision).toBe('atlas.grounded-nlp-ontology-projection:v1');
    expect(projection.tuple.evidenceSpan).toEqual({ sourceRef: fact.sourceRef, start: 6, end: 11 });
    expect(projection.tuple.evidenceRefs).toContain(fact.canonicalTaskRef);
    expect(projection.canonicalAuthority).toBe(false);
    expect(projection.writesPerformed).toBe(false);
  });

  it('rejects facts without a measured confidence instead of substituting zero', () => {
    expect(() => projectGroundedNlpFactToOntologyTupleV1({
      fact: { ...fact, confidence: null },
      ontologyIds: [],
      conceptIds: [],
      labelKind: 'tag',
      ontologyRevision: 'ontology:fixture-v1',
    })).toThrow('GROUNDED_NLP_TUPLE_PROJECTION_INPUT_MISSING');
  });
});
