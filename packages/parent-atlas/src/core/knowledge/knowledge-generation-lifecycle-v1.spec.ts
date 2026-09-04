import { describe, expect, it } from 'vitest';
import { buildKnowledgeGenerationRunV1 } from './knowledge-generation-run-v1.js';
import { advanceKnowledgeGenerationLifecycleV1, beginKnowledgeGenerationLifecycleV1 } from './knowledge-generation-lifecycle-v1.js';
import { sha256TextV1 } from './stable-json-v1.js';

const sourceSetChecksum = sha256TextV1('sources');
const evidence = (label: string) => [sha256TextV1(label)];
const page = (suffix: string) => ({ schema: 'atlas.knowledge-page-job.v1' as const, jobId: `job:${suffix}`, pageId: `page:${suffix}`, path: `docs/knowledge/${suffix}.md`, title: suffix, purpose: `Document ${suffix}`, sourceSetChecksum, relatedPageIds: [], instructions: ['ground claims'], status: 'PENDING' as const, completedBy: null });
function run() { return buildKnowledgeGenerationRunV1({ runId: 'run:1', mode: 'UPDATE', phase: 'PLANNING', startedAt: '2026-09-02T12:00:00.000Z', workspaceRevision: 'workspace:r1', sourceSnapshotRevision: 'snapshot:r1', sourceSetChecksum, dagRevision: 'dag:r1', plannerRevision: 'planner:r1', programRevision: 'program:r1', modelRevision: 'model:r1', pageJobs: [page('a'), page('b')] }); }

describe('KnowledgeGenerationLifecycleV1', () => {
  it('requires INSPECT before SUBMIT', () => {
    let state = beginKnowledgeGenerationLifecycleV1({ run: run(), evidenceChecksums: evidence('source') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'PLAN', evidenceChecksums: evidence('plan') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'NEXT_PAGE', evidenceChecksums: evidence('dag') });
    expect(() => advanceKnowledgeGenerationLifecycleV1({ state, operation: 'SUBMIT', evidenceChecksums: evidence('submit'), completedBy: 'worker:1', submitStatus: 'SKIPPED' })).toThrow('KNOWLEDGE_RUN_SUBMIT_INSPECT_REQUIRED');
  });

  it('does not accept a COMPLETE transition without a typed durable completion receipt', () => {
    let state = beginKnowledgeGenerationLifecycleV1({ run: run(), evidenceChecksums: evidence('source') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'PLAN', evidenceChecksums: evidence('plan') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'NEXT_PAGE', evidenceChecksums: evidence('dag') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'INSPECT', evidenceChecksums: evidence('inspect') });
    expect(() => advanceKnowledgeGenerationLifecycleV1({ state, operation: 'SUBMIT', evidenceChecksums: evidence('submit'), completedBy: 'worker:1' })).toThrow('KNOWLEDGE_RUN_SUBMIT_COMPLETION_RECEIPT_REQUIRED');
  });

  it('preserves explicit SKIPPED pages and resumes with the next pending page', () => {
    let state = beginKnowledgeGenerationLifecycleV1({ run: run(), evidenceChecksums: evidence('source') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'PLAN', evidenceChecksums: evidence('plan') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'NEXT_PAGE', evidenceChecksums: evidence('dag-a') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'INSPECT', evidenceChecksums: evidence('inspect-a') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'SUBMIT', evidenceChecksums: evidence('skip-a'), completedBy: 'validator:1', submitStatus: 'SKIPPED' });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'NEXT_PAGE', evidenceChecksums: evidence('dag-b') });
    expect(state.activeJobId).toBe('job:b');
  });

  it('cannot finish while any page remains pending', () => {
    let state = beginKnowledgeGenerationLifecycleV1({ run: run(), evidenceChecksums: evidence('source') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'PLAN', evidenceChecksums: evidence('plan') });
    expect(() => advanceKnowledgeGenerationLifecycleV1({ state, operation: 'FINISH', evidenceChecksums: evidence('final') })).toThrow('KNOWLEDGE_RUN_FINISH_INCOMPLETE_JOBS');
  });
});
