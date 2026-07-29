import { describe, expect, it } from 'vitest';
import {
  ResourceAwareScheduler,
  defaultResourceScheduler,
  type SchedulerJob,
  type SchedulerStage
} from './resource-scheduler.js';

function makeJob(overrides: Partial<SchedulerJob> & Pick<SchedulerJob, 'job_id' | 'stage'>): SchedulerJob {
  return {
    run_id: 'run-1',
    corpus_revision: 'rev-1',
    content_hash: 'hash-1',
    priority: 5,
    estimated_tokens: 100,
    estimated_memory_mb: 64,
    attempt: 0,
    idempotency_key: `${overrides.stage}:${overrides.job_id}`,
    created_at: '2026-07-29T00:00:00.000Z',
    ...overrides
  };
}

describe('ResourceAwareScheduler', () => {
  it('keeps stages isolated instead of round-robining across unlike lanes', () => {
    const scheduler = new ResourceAwareScheduler();
    const parseJob = makeJob({ job_id: 'cpu-1', stage: 'cpu_parse_queue' });
    const embedJob = makeJob({ job_id: 'embed-1', stage: 'embedding_queue' });

    expect(scheduler.enqueue(parseJob).accepted).toBe(true);
    expect(scheduler.enqueue(embedJob).accepted).toBe(true);

    const claimed = scheduler.claimNext('cpu_parse_queue');
    expect(claimed?.job_id).toBe('cpu-1');
    expect(scheduler.claimNext('cpu_parse_queue')).toBeNull();
    expect(scheduler.claimNext('embedding_queue')?.job_id).toBe('embed-1');
  });

  it('enforces bounded admission per stage and idempotency', () => {
    const scheduler = new ResourceAwareScheduler({
      policies: {
        embedding_queue: {
          maxConcurrent: 1,
          maxQueued: 1,
          maxQueuedTokens: 100,
          maxQueuedMemoryMb: 100
        }
      }
    });

    const first = makeJob({ job_id: 'embed-a', stage: 'embedding_queue', idempotency_key: 'same-key' });
    const duplicate = makeJob({ job_id: 'embed-b', stage: 'embedding_queue', idempotency_key: 'same-key' });
    const oversized = makeJob({
      job_id: 'embed-c',
      stage: 'embedding_queue',
      idempotency_key: 'other-key',
      estimated_tokens: 101
    });

    expect(scheduler.enqueue(first).accepted).toBe(true);
    expect(scheduler.enqueue(duplicate).accepted).toBe(false);
    expect(scheduler.enqueue(oversized).accepted).toBe(false);
  });

  it('tracks completion, failure, and blocking by stage', () => {
    const scheduler = new ResourceAwareScheduler();
    const job = makeJob({ job_id: 'gpu-1', stage: 'gpu_training_queue' });

    expect(scheduler.enqueue(job).accepted).toBe(true);
    expect(scheduler.claimNext('gpu_training_queue')?.job_id).toBe('gpu-1');
    expect(scheduler.complete('gpu-1')).toBe(true);

    const failedJob = makeJob({ job_id: 'proj-1', stage: 'projection_queue' });
    expect(scheduler.enqueue(failedJob).accepted).toBe(true);
    expect(scheduler.claimNext('projection_queue')?.job_id).toBe('proj-1');
    expect(scheduler.fail('proj-1')).toBe(true);

    const blockedJob = makeJob({ job_id: 'rerank-1', stage: 'rerank_queue' });
    scheduler.block(blockedJob, 'disk_budget_exceeded');

    const snapshot = scheduler.snapshot();
    expect(snapshot.completed).toBe(1);
    expect(snapshot.failed).toBe(1);
    expect(snapshot.blocked).toBe(1);
  });

  it('exposes the stage order explicitly', () => {
    expect(defaultResourceScheduler.getStageOrder()).toEqual([
      'cpu_parse_queue',
      'llm_extract_queue',
      'embedding_queue',
      'rerank_queue',
      'projection_queue',
      'gpu_training_queue'
    ] satisfies SchedulerStage[]);
  });
});
