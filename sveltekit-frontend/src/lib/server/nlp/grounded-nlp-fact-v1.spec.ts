import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { groundNlpFeatureV1 } from './nlp-observation-lineage-v1.js';

const sourceBytes = Buffer.from('const x = 1;', 'utf8');
const sha256 = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const input = {
  feature: {
    kind: 'identifier',
    name: 'x',
    description: 'observed identifier',
    source: 'langextract' as const,
    byteStart: 6,
    byteEnd: 11,
    rawText: 'x = 1',
  },
  context: {
    sourceRef: 'openspec/changes/example/tasks.md',
    sourceRevision: sha256(sourceBytes),
    workspaceRevision: 'workspace:fixture-v1',
    providerRevision: 'langextract:fixture-v1',
    producerRevision: 'atlas:nlp-extractor:fixture-v1',
  },
  sourceBytes,
  taskRef: 'openspec/changes/example/tasks.md#L5',
  canonicalTaskRef: 'openspec-task:example/EX-01',
  taskRevision: sha256(Buffer.from('task block', 'utf8')),
  evidenceCardChecksum: sha256(Buffer.from('evidence card', 'utf8')),
};

describe('groundNlpFeatureV1', () => {
  it('emits deterministic exact-byte grounded facts without authority', () => {
    const first = groundNlpFeatureV1(input);
    const second = groundNlpFeatureV1(input);
    expect(first).toEqual(second);
    expect(first.evidenceSpan).toEqual({ byteStart: 6, byteEnd: 11, textSha256: sha256(Buffer.from('x = 1', 'utf8')).slice(7) });
    expect(first.sourceRevision).toBe(input.context.sourceRevision);
    expect(first.taskRevision).toBe(input.taskRevision);
    expect(first.canonicalAuthority).toBe(false);
    expect(first.ontologyPromotionAllowed).toBe(false);
  });

  it('rejects fabricated spans and mismatched source bytes', () => {
    expect(() => groundNlpFeatureV1({ ...input, feature: { ...input.feature, rawText: 'fabricated' } }))
      .toThrow('GROUNDED_NLP_SPAN_TEXT_MISMATCH');
    expect(() => groundNlpFeatureV1({ ...input, sourceBytes: Buffer.from('changed source') }))
      .toThrow('GROUNDED_NLP_SOURCE_REVISION_MISMATCH');
  });
});
