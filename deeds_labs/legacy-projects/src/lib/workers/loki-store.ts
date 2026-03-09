import EventEmitter from 'events';

type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'retrying' | 'cancelled';

export type JobRecord = {
  id: string;
  state: JobState;
  payload?: any;
  retries?: number;
  lastError?: string | null;
  updatedAt: string;
  createdAt: string;
};

/**
 * Lightweight wrapper that prefers LokiJS when available, falls back to an in-memory Map,
 * and can optionally write/read to Redis when a redis client is provided.
 */
export class LokiStore extends EventEmitter {
  private useRedis: boolean;
  private redis: any | null = null;
  private collection: Map<string, JobRecord>;

  constructor(opts?: { redisClient?: any }) {
    super();
    this.useRedis = !!opts?.redisClient;
    this.redis = opts?.redisClient ?? null;
    this.collection = new Map();
  }

  private nowIso() {
    return new Date().toISOString();
  }

  async setJob(job: Partial<JobRecord> & { id: string }) {
    const existing = this.collection.get(job.id) ?? null;
    const record: JobRecord = {
      id: job.id,
      state: job.state ?? existing?.state ?? 'queued',
      payload: job.payload ?? existing?.payload,
      retries: typeof job.retries === 'number' ? job.retries : (existing?.retries ?? 0),
      lastError: job.lastError ?? existing?.lastError ?? null,
      createdAt: existing?.createdAt ?? this.nowIso(),
      updatedAt: this.nowIso(),
    };

    this.collection.set(job.id, record);

    if (this.useRedis && this.redis) {
      try {
        const key = `jobs:state:${job.id}`;
        await this.redis.set(key, JSON.stringify(record));
      } catch (e) {
        // non-fatal
      }
    }

    this.emit('update', record);
    return record;
  }

  async getJob(id: string) {
    if (this.collection.has(id)) return this.collection.get(id) || null;
    if (this.useRedis && this.redis) {
      try {
        const key = `jobs:state:${id}`;
        const raw = await this.redis.get(key);
        if (raw) {
          const parsed = JSON.parse(raw) as JobRecord;
          // hydrate local cache
          this.collection.set(id, parsed);
          return parsed;
        }
      } catch (e) {
        // ignore
      }
    }
    return null;
  }

  async listJobs() {
    return Array.from(this.collection.values()).sort((a, b) =>
      a.updatedAt.localeCompare(b.updatedAt)
    );
  }

  async removeJob(id: string) {
    this.collection.delete(id);
    if (this.useRedis && this.redis) {
      try {
        const key = `jobs:state:${id}`;
        await this.redis.del(key);
      } catch (e) {
        // ignore
      }
    }
    this.emit('remove', id);
  }
}

export default LokiStore;
