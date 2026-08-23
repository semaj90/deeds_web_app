import { describe, expect, it } from 'vitest';
import { qualifyNlpFeatureV1, qualifyNlpFeaturesV1 } from './nlp-observation-lineage-v1.js';

const feature = {
  kind: 'ast_function',
  name: 'rankCandidates',
  description: 'Function rankCandidates()',
  source: 'ast-grep' as const,
  byteStart: 100,
  byteEnd: 240,
  ruleId: 'ast-grep:function-declaration',
};

const context = {
  sourceRef: 'sveltekit-frontend/src/lib/server/atlas/rank.ts',
  workspaceRevision: 'workspace:abc',
  sourceRevision: 'source:def',
  providerRevision: 'ast-grep:0.44.0',
  producerRevision: 'atlas:nlp-lineage:v1',
};

describe('nlp-observation-lineage-v1', () => {
  it('preserves legacy features without inventing lineage', () => {
    expect(qualifyNlpFeatureV1(feature)).toEqual({
      ...feature,
      lineageQualified: false,
    });
  });

  it('adds deterministic revision-qualified evidence keys', () => {
    const first = qualifyNlpFeatureV1(feature, context);
    const second = qualifyNlpFeatureV1(feature, context);

    expect(first.lineageQualified).toBe(true);
    expect(first.evidenceKey).toMatch(/^nlp:[a-f0-9]{64}$/);
    expect(first.evidenceKey).toBe(second.evidenceKey);
    expect(first.sourceRevision).toBe(context.sourceRevision);
    expect(first.workspaceRevision).toBe(context.workspaceRevision);
  });

  it('changes the evidence key when source revision changes', () => {
    const first = qualifyNlpFeatureV1(feature, context);
    const second = qualifyNlpFeatureV1(feature, {
      ...context,
      sourceRevision: 'source:changed',
    });

    expect(first.evidenceKey).not.toBe(second.evidenceKey);
  });

  it('rejects incomplete lineage context rather than fabricating it', () => {
    expect(() => qualifyNlpFeatureV1(feature, {
      ...context,
      producerRevision: '',
    })).toThrow('NLP_OBSERVATION_CONTEXT_REQUIRED:producerRevision');
  });

  it('normalizes batches without changing order', () => {
    const rows = qualifyNlpFeaturesV1([
      feature,
      { ...feature, name: 'second', byteStart: 300, byteEnd: 380 },
    ], context);

    expect(rows.map((row) => row.name)).toEqual(['rankCandidates', 'second']);
    expect(rows.every((row) => row.lineageQualified)).toBe(true);
  });
});
