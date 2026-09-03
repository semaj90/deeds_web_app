import { describe, expect, it } from 'vitest';
import { buildKnowledgeGenerationRunV1 } from './knowledge-generation-run-v1.js';
import { advanceKnowledgeGenerationLifecycleV1, beginKnowledgeGenerationLifecycleV1, knowledgeGenerationLifecycleV1Schema } from './knowledge-generation-lifecycle-v1.js';
import { sha256TextV1 } from './stable-json-v1.js';

const sourceSetChecksum = sha256TextV1('sources');
const evidence = (label: string) => [sha256TextV1(label)];
const page = (suffix: string) => ({
  schema: 'atlas.knowledge-page-job.v1' as const,
  jobId: `job:${suffix}`,
  pageId: `page:${suffix}`,
  path: `docs/knowledge/${suffix}.md`,
  title: suffix,
  purpose: `Document ${suffix}`,
  sourceSetChecksum,
  relatedPageIds: [],
  instructions: ['ground claims'],
  status: 'PENDING' as const,
  completedBy: null,
});

function run() {
  return buildKnowledgeGenerationRunV1({
    runId: 'run:1',
    mode: 'UPDATE',
    phase: 'PLANNING',
    startedAt: '2026-09-02T12:00:00.000Z',
    workspaceRevision: 'workspace:r1',
    sourceSnapshotRevision: 'snapshot:r1',
    sourceSetChecksum,
    dagRevision: 'dag:r1',
    plannerRevision: 'planner:r1',
    programRevision: 'program:r1',
    modelRevision: 'model:r1',
    pageJobs: [page('a'), page('b')],
  });
}

describe('KnowledgeGenerationLifecycleV1', () => {
  it('resumes from persisted page status and selects only the remaining pending job', () => {
    let state = beginKnowledgeGenerationLifecycleV1({ run: run(), evidenceChecksums: evidence('source-snapshot') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'PLAN', evidenceChecksums: evidence('page-plan') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'NEXT_PAGE', evidenceChecksums: evidence('page-a-dag') });
    expect(state.activeJobId).toBe('job:a');
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'INSPECT', evidenceChecksums: evidence('inspect-a') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'SUBMIT', evidenceChecksums: evidence('durable-a'), completedBy: 'worker:1' });

    const restored = knowledgeGenerationLifecycleV1Schema.parse(JSON.parse(JSON.stringify(state)));
    const next = advanceKnowledgeGenerationLifecycleV1({ state: restored, operation: 'NEXT_PAGE', evidenceChecksums: evidence('page-b-dag') });
    expect(next.activeJobId).toBe('job:b');
    expect(next.run.pageJobs.find((job) => job.jobId === 'job:a')?.status).toBe('COMPLETE');
  });

  it('cannot finish merely because an agent/process reached its final turn', () => {
    let state = beginKnowledgeGenerationLifecycleV1({ run: run(), evidenceChecksums: evidence('source-snapshot') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'PLAN', evidenceChecksums: evidence('page-plan') });
    expect(() => advanceKnowledgeGenerationLifecycleV1({ state, operation: 'FINISH', evidenceChecksums: evidence('final') })).toThrow('KNOWLEDGE_RUN_FINISH_INCOMPLETE_JOBS');
  });

  it('finishes only after every page is explicitly COMPLETE or SKIPPED', () => {
    let state = beginKnowledgeGenerationLifecycleV1({ run: run(), evidenceChecksums: evidence('source-snapshot') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'PLAN', evidenceChecksums: evidence('page-plan') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'NEXT_PAGE', evidenceChecksums: evidence('page-a-dag') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'SUBMIT', evidenceChecksums: evidence('durable-a'), completedBy: 'worker:1' });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'NEXT_PAGE', evidenceChecksums: evidence('page-b-dag') });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'SUBMIT', evidenceChecksums: evidence('skip-b'), submitStatus: 'SKIPPED', completedBy: 'validator:1' });
    state = advanceKnowledgeGenerationLifecycleV1({ state, operation: 'FINISH', evidenceChecksums: evidence('final-manifest') });
    expect(state.stage).toBe('FINISHED');
    expect(state.run.pageJobs.map((job) => job.status)).toEqual(['COMPLETE', 'SKIPPED']);
    expect(state.operationReceipts.at(-1)?.operation).toBe('FINISH');
  });
});
