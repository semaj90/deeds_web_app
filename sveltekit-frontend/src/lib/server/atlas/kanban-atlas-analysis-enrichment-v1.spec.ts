import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { MiniforgeNlpSidecarClient } from '$lib/server/nlp/miniforge-nlp-sidecar.js';
import { analyzeKanbanTaskForAtlasV1 } from './kanban-atlas-analysis-enrichment-v1.js';

const task = {
  taskId: 'openspec:demo#0123456789abcdef',
  featureId: 'openspec:demo',
  sourceRef: 'openspec/changes/demo/tasks.md#L3',
  text: 'Classify this task for review.',
};
const sourceBinding = {
  status: 'SOURCE_REFERENCE_CURRENT' as const,
  sourceFileRef: 'openspec/changes/demo/tasks.md',
  sourceLine: 3,
  sourceRevision: `sha256:${'b'.repeat(64)}`,
  taskTextSha256: `sha256:${createHash('sha256').update(task.text).digest('hex')}`,
};

function response(overrides: Record<string, unknown> = {}) {
  const sourceRevision = `sha256:${createHash('sha256').update(task.text).digest('hex')}`;
  return {
    document_id: task.taskId,
    provider_revision: 'nlp-sidecar-fixture-v1',
    entities: [{ text: 'task', label: 'OBJECT' }],
    relationships: [],
    concepts: ['taskboard'],
    chunks: [],
    features: [],
    metadata: {},
    capabilities: { spacy: true, langextract: true, tree_sitter: true, ast_grep: true, torch: false, classification_helper: true },
    classification_proposal: {
      schema: 'atlas.nlp-classification-proposal.v1',
      sourceRef: task.sourceRef,
      sourceRevision,
      domain: 'software',
      ontologyLabels: ['software'],
      producerRevision: 'rules-v1',
      canonicalAuthority: false,
      writesPerformed: false,
    },
    ...overrides,
  } as never;
}

function clientWith(result: unknown): MiniforgeNlpSidecarClient {
  return { analyze: vi.fn(async () => result) } as unknown as MiniforgeNlpSidecarClient;
}

describe('Kanban Parent Atlas analysis enrichment', () => {
  it('binds a 8095 rules proposal to exact analyzed text and keeps NB/LR unadmitted', async () => {
    const result = await analyzeKanbanTaskForAtlasV1({ ...task, sourceBinding, client: clientWith(response()) });

    expect(result.status).toBe('PROPOSED');
    expect(result.sourceRevision).toBe(`sha256:${createHash('sha256').update(task.text).digest('hex')}`);
    expect(result.sourceRevisionScope).toBe('WORKBOARD_TASK_FILE_AND_LINE');
    expect(result.sourceRefStatus).toBe('SOURCE_REFERENCE_CURRENT');
    expect(result.sourceFileRevision).toBe(sourceBinding.sourceRevision);
    expect(result.taskTextSha256).toBe(sourceBinding.taskTextSha256);
    expect(result.domainProposal.label).toBe('software');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.learnedClassifiers).toEqual({
      naiveBayes: 'NOT_ADMITTED',
      logisticRegression: 'NOT_ADMITTED',
      reason: 'NO_CURRENT_ADMITTED_TRAINING_RECEIPT',
      candidate: {
        status: 'UNAVAILABLE',
        backend: null,
        modelRevision: null,
        sourceRef: null,
        sourceRevision: null,
        naiveBayesLabel: null,
        naiveBayesScore: null,
        logisticRegressionLabel: null,
        logisticRegressionScore: null,
      },
    });
  });

  it('carries source-matched Naive Bayes and Logistic Regression outputs as shadow-only metadata', async () => {
    const sourceRevision = `sha256:${createHash('sha256').update(task.text).digest('hex')}`;
    const raw = response({
      pass_results: [{
        family: 'classify',
        backend: 'sklearn-lr',
        sourceRef: task.sourceRef,
        sourceRevision,
        status: 'succeeded',
        artifacts: {
          model_revision: 'domain-classifier-v3',
          naive_bayes_label: 'software',
          logistic_regression_label: 'parent-atlas',
        },
        features: {
          naive_bayes_domain_probability: 0.72,
          logistic_regression_domain_probability: 0.81,
        },
      }],
    });
    const result = await analyzeKanbanTaskForAtlasV1({ ...task, sourceBinding, client: clientWith(raw) });

    expect(result.learnedClassifiers).toMatchObject({
      naiveBayes: 'NOT_ADMITTED',
      logisticRegression: 'NOT_ADMITTED',
      candidate: {
        status: 'SHADOW_ONLY',
        backend: 'sklearn-lr',
        modelRevision: 'domain-classifier-v3',
        sourceRef: task.sourceRef,
        sourceRevision,
        naiveBayesLabel: 'software',
        naiveBayesScore: 0.72,
        logisticRegressionLabel: 'parent-atlas',
        logisticRegressionScore: 0.81,
      },
    });
    expect(result.canonicalAuthority).toBe(false);
  });

  it('drops learned classifier outputs when their source binding does not match', async () => {
    const raw = response({
      pass_results: [{
        family: 'classify',
        backend: 'sklearn-lr',
        sourceRef: task.sourceRef,
        sourceRevision: `sha256:${'a'.repeat(64)}`,
        status: 'succeeded',
        artifacts: { model_revision: 'domain-classifier-v3', logistic_regression_label: 'software' },
        features: { logistic_regression_domain_probability: 0.99 },
      }],
    });
    const result = await analyzeKanbanTaskForAtlasV1({ ...task, sourceBinding, client: clientWith(raw) });

    expect(result.learnedClassifiers.candidate.status).toBe('INVALID');
    expect(result.learnedClassifiers.candidate.logisticRegressionLabel).toBeNull();
  });

  it('rejects classifier proposal metadata with mismatched source revision', async () => {
    const raw = response() as Record<string, unknown>;
    raw.classification_proposal = { ...(raw.classification_proposal as object), sourceRevision: `sha256:${'f'.repeat(64)}` };
    const result = await analyzeKanbanTaskForAtlasV1({ ...task, sourceBinding, client: clientWith(raw) });

    expect(result.status).toBe('UNVERIFIED');
    expect(result.domainProposal.label).toBeNull();
  });

  it('keeps sidecar failures explicit and blocks oversized or empty input', async () => {
    const unavailable = await analyzeKanbanTaskForAtlasV1({ ...task, sourceBinding, client: clientWith(Promise.reject(new Error('offline'))) });
    const oversizedText = 'x'.repeat(8_001);
    const oversizedBinding = { ...sourceBinding, taskTextSha256: `sha256:${createHash('sha256').update(oversizedText).digest('hex')}` };
    const oversized = await analyzeKanbanTaskForAtlasV1({ ...task, text: oversizedText, sourceBinding: oversizedBinding, client: clientWith(response()) });
    const emptyText = '   ';
    const emptyBinding = { ...sourceBinding, taskTextSha256: `sha256:${createHash('sha256').update(emptyText).digest('hex')}` };
    const empty = await analyzeKanbanTaskForAtlasV1({ ...task, text: emptyText, sourceBinding: emptyBinding, client: clientWith(response()) });

    expect(unavailable.domainProposal.reason).toBe('NLP_SIDECAR_UNAVAILABLE_OR_INVALID_RESPONSE');
    expect(oversized.status).toBe('BLOCKED');
    expect(empty.status).toBe('BLOCKED');
  });

  it('rejects a missing or mismatched source binding before calling the sidecar', async () => {
    const client = clientWith(response());
    await expect(analyzeKanbanTaskForAtlasV1({ ...task, sourceBinding: { ...sourceBinding, sourceLine: 4 }, client }))
      .rejects.toThrow('KANBAN_TASK_SOURCE_BINDING_NOT_VERIFIED');
    expect(client.analyze).not.toHaveBeenCalled();
  });
});
