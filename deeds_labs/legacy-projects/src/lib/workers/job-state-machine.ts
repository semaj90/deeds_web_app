import LokiStore, { JobRecord } from './loki-store';

export type JobPayload = {
  id: string;
  type: string;
  data: any;
};

export class JobStateMachine {
  private store: LokiStore;
  private concurrency: number;
  private running: Set<string> = new Set();

  constructor(store: LokiStore, opts?: { concurrency?: number }) {
    this.store = store;
    this.concurrency = opts?.concurrency ?? 2;
  }

  async createJob(payload: JobPayload) {
    const record = await this.store.setJob({ id: payload.id, state: 'queued', payload });
    return record;
  }

  async startJob(id: string) {
    if (this.running.size >= this.concurrency) {
      // concurrency limit reached
      return null;
    }
    const job = await this.store.getJob(id);
    if (!job) return null;
    if (job.state === 'running') return job;
    this.running.add(id);
    const updated = await this.store.setJob({ id, state: 'running' });
    return updated;
  }

  async completeJob(id: string) {
    this.running.delete(id);
    const updated = await this.store.setJob({ id, state: 'succeeded' });
    return updated;
  }

  async failJob(id: string, error: Error, opts?: { retry?: boolean }) {
    this.running.delete(id);
    const job = await this.store.getJob(id);
    const retries = (job?.retries ?? 0) + (opts?.retry ? 1 : 0);
    const state: JobRecord['state'] = opts?.retry ? 'retrying' : 'failed';
    const updated = await this.store.setJob({
      id,
      state,
      lastError: String(error?.message ?? error),
      retries,
    });
    return updated;
  }

  async cancelJob(id: string) {
    this.running.delete(id);
    const updated = await this.store.setJob({ id, state: 'cancelled' });
    return updated;
  }

  onUpdate(cb: (rec: JobRecord) => void) {
    this.store.on('update', cb);
  }

  onRemove(cb: (id: string) => void) {
    this.store.on('remove', cb);
  }

  async getJob(id: string) {
    return this.store.getJob(id);
  }

  async list() {
    return this.store.listJobs();
  }
}

export default JobStateMachine;
