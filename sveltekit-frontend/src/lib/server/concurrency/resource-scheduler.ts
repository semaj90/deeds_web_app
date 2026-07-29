/**
 * Resource-aware scheduler contract for Atlas / ACE background work.
 *
 * This is intentionally not a global round-robin scheduler.
 * Each resource class gets its own bounded queue, admission policy, and
 * independent worker pool.
 */

export type SchedulerStage =
  | 'cpu_parse_queue'
  | 'llm_extract_queue'
  | 'embedding_queue'
  | 'rerank_queue'
  | 'gpu_training_queue'
  | 'projection_queue';

export interface SchedulerJob {
  job_id: string;
  run_id: string;
  corpus_revision: string;
  content_hash: string;
  stage: SchedulerStage;
  priority: number;
  estimated_tokens: number;
  estimated_memory_mb: number;
  required_model?: string;
  model_revision?: string;
  attempt: number;
  idempotency_key: string;
  checkpoint?: string;
  created_at: string;
}

export interface SchedulerStagePolicy {
  maxConcurrent: number;
  maxQueued: number;
  maxQueuedTokens?: number;
  maxQueuedMemoryMb?: number;
}

export interface SchedulerAdmissionContext {
  availableDiskMb?: number;
  availableGpuMb?: number;
  activeGpuJobs?: number;
  activeCpuJobs?: number;
}

export interface SchedulerAdmissionResult {
  accepted: boolean;
  reason: string;
}

export interface SchedulerSnapshot {
  queued: number;
  active: number;
  completed: number;
  failed: number;
  blocked: number;
}

export interface ResourceSchedulerConfig {
  policies?: Partial<Record<SchedulerStage, Partial<SchedulerStagePolicy>>>;
  minDiskMb?: number;
}

interface StoredJob {
  job: SchedulerJob;
  enqueuedAt: string;
}

interface BlockedJob {
  job: SchedulerJob;
  reason: string;
}

const DEFAULT_POLICIES: Record<SchedulerStage, SchedulerStagePolicy> = {
  cpu_parse_queue: { maxConcurrent: 6, maxQueued: 1024 },
  llm_extract_queue: { maxConcurrent: 2, maxQueued: 256, maxQueuedTokens: 2_000_000 },
  embedding_queue: { maxConcurrent: 2, maxQueued: 512, maxQueuedTokens: 1_000_000 },
  rerank_queue: { maxConcurrent: 2, maxQueued: 256, maxQueuedTokens: 1_000_000 },
  gpu_training_queue: { maxConcurrent: 1, maxQueued: 32, maxQueuedTokens: 4_000_000 },
  projection_queue: { maxConcurrent: 2, maxQueued: 512, maxQueuedTokens: 2_000_000 },
};

const STAGE_ORDER: SchedulerStage[] = [
  'cpu_parse_queue',
  'llm_extract_queue',
  'embedding_queue',
  'rerank_queue',
  'projection_queue',
  'gpu_training_queue',
];

function mergePolicy(stage: SchedulerStage, cfg?: ResourceSchedulerConfig): SchedulerStagePolicy {
  return {
    ...DEFAULT_POLICIES[stage],
    ...(cfg?.policies?.[stage] ?? {}),
  };
}

export class ResourceAwareScheduler {
  private pending = new Map<SchedulerStage, StoredJob[]>();
  private active = new Map<string, SchedulerJob>();
  private completed = new Map<string, SchedulerJob>();
  private failed = new Map<string, SchedulerJob>();
  private blocked = new Map<string, BlockedJob>();
  private byIdempotency = new Set<string>();

  constructor(private readonly config: ResourceSchedulerConfig = {}) {
    for (const stage of STAGE_ORDER) {
      this.pending.set(stage, []);
    }
  }

  getPolicy(stage: SchedulerStage): SchedulerStagePolicy {
    return mergePolicy(stage, this.config);
  }

  admit(job: SchedulerJob, context: SchedulerAdmissionContext = {}): SchedulerAdmissionResult {
    const policy = this.getPolicy(job.stage);
    const queue = this.pending.get(job.stage) ?? [];

    if (this.byIdempotency.has(job.idempotency_key)) {
      return { accepted: false, reason: 'duplicate_idempotency_key' };
    }

    if (queue.length >= policy.maxQueued) {
      return { accepted: false, reason: 'queue_capacity_exceeded' };
    }

    if (policy.maxQueuedTokens !== undefined) {
      const queuedTokens = queue.reduce((sum, entry) => sum + entry.job.estimated_tokens, 0);
      if (queuedTokens + job.estimated_tokens > policy.maxQueuedTokens) {
        return { accepted: false, reason: 'token_budget_exceeded' };
      }
    }

    if (policy.maxQueuedMemoryMb !== undefined) {
      const queuedMemory = queue.reduce((sum, entry) => sum + entry.job.estimated_memory_mb, 0);
      if (queuedMemory + job.estimated_memory_mb > policy.maxQueuedMemoryMb) {
        return { accepted: false, reason: 'memory_budget_exceeded' };
      }
    }

    if (this.config.minDiskMb !== undefined && context.availableDiskMb !== undefined) {
      if (context.availableDiskMb < this.config.minDiskMb) {
        return { accepted: false, reason: 'disk_budget_exceeded' };
      }
    }

    if (job.stage === 'gpu_training_queue' || job.stage === 'embedding_queue' || job.stage === 'rerank_queue') {
      if (context.availableGpuMb !== undefined && context.availableGpuMb < job.estimated_memory_mb) {
        return { accepted: false, reason: 'gpu_memory_exceeded' };
      }
    }

    return { accepted: true, reason: 'accepted' };
  }

  enqueue(job: SchedulerJob, context: SchedulerAdmissionContext = {}): SchedulerAdmissionResult {
    const admission = this.admit(job, context);
    if (!admission.accepted) return admission;

    this.pending.get(job.stage)?.push({ job, enqueuedAt: new Date().toISOString() });
    this.byIdempotency.add(job.idempotency_key);
    return admission;
  }

  claimNext(stage: SchedulerStage): SchedulerJob | null {
    const policy = this.getPolicy(stage);
    if (this.countActive(stage) >= policy.maxConcurrent) {
      return null;
    }

    const queue = this.pending.get(stage);
    if (!queue || queue.length === 0) return null;

    queue.sort((a, b) => {
      if (b.job.priority !== a.job.priority) return b.job.priority - a.job.priority;
      if (a.job.estimated_tokens !== b.job.estimated_tokens) return a.job.estimated_tokens - b.job.estimated_tokens;
      return a.enqueuedAt.localeCompare(b.enqueuedAt);
    });

    const next = queue.shift();
    if (!next) return null;

    this.active.set(next.job.job_id, next.job);
    return next.job;
  }

  complete(jobId: string): boolean {
    const job = this.active.get(jobId);
    if (!job) return false;
    this.active.delete(jobId);
    this.completed.set(jobId, job);
    return true;
  }

  fail(jobId: string): boolean {
    const job = this.active.get(jobId);
    if (!job) return false;
    this.active.delete(jobId);
    this.failed.set(jobId, job);
    return true;
  }

  block(job: SchedulerJob, reason: string): void {
    this.blocked.set(job.job_id, { job, reason });
  }

  snapshot(stage?: SchedulerStage): SchedulerSnapshot {
    if (stage) {
      return {
        queued: this.pending.get(stage)?.length ?? 0,
        active: this.countActive(stage),
        completed: this.countJobs(stage, this.completed),
        failed: this.countJobs(stage, this.failed),
        blocked: this.countBlocked(stage, this.blocked),
      };
    }

    return {
      queued: Array.from(this.pending.values()).reduce((sum, items) => sum + items.length, 0),
      active: this.active.size,
      completed: this.completed.size,
      failed: this.failed.size,
      blocked: this.blocked.size,
    };
  }

  getReadyStages(): SchedulerStage[] {
    return STAGE_ORDER.filter((stage) => this.countActive(stage) < this.getPolicy(stage).maxConcurrent);
  }

  getStageOrder(): SchedulerStage[] {
    return [...STAGE_ORDER];
  }

  private countActive(stage: SchedulerStage): number {
    return Array.from(this.active.values()).filter((job) => job.stage === stage).length;
  }

  private countJobs(stage: SchedulerStage, store: Map<string, SchedulerJob>): number {
    let count = 0;
    for (const job of store.values()) {
      if (job.stage === stage) count++;
    }
    return count;
  }

  private countBlocked(stage: SchedulerStage, store: Map<string, BlockedJob>): number {
    let count = 0;
    for (const entry of store.values()) {
      if (entry.job.stage === stage) count++;
    }
    return count;
  }
}

export const defaultResourceScheduler = new ResourceAwareScheduler();
