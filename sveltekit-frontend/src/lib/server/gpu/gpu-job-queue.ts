/**
 * src/lib/server/gpu/gpu-job-queue.ts
 *
 * Safe concurrency mutex and async queue guard for workstation GPU operations.
 * Protects the RTX 3060 Ti 8GB from overlapping high-stress operations.
 */

// Dual-mode private env import to support both SvelteKit server and standalone Node.js smoke tests
let dynamicEnv: Record<string, string> = {};
try {
  // @ts-ignore
  const imported = await import('$env/dynamic/private');
  dynamicEnv = imported.env || {};
} catch (err) {
  // CLI / standalone dry-run fallback
}

const getEnvBool = (key: string, fallback: boolean): boolean => {
  const val = dynamicEnv[key] || process.env[key];
  if (val === undefined) return fallback;
  return val.toLowerCase() === 'true';
};

const getEnvInt = (key: string, fallback: number): number => {
  const val = dynamicEnv[key] || process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
};

// Defaults: Strict serialization (max concurrency = 1), 2m job timeout, 30s queue wait timeout
const GPU_ALLOW_CONCURRENT_JOBS = getEnvBool('GPU_ALLOW_CONCURRENT_JOBS', false);
const GPU_JOB_TIMEOUT_MS = getEnvInt('GPU_JOB_TIMEOUT_MS', 120000);
const GPU_QUEUE_TIMEOUT_MS = getEnvInt('GPU_QUEUE_TIMEOUT_MS', 30000);
const GPU_FALLBACK_CPU = getEnvBool('GPU_FALLBACK_CPU', true);

export interface GpuJobOptions {
  jobTimeoutMs?: number;
  queueTimeoutMs?: number;
  bypassQueue?: boolean;
}

export interface GpuQueueState {
  activeJobsCount: number;
  waitingJobsCount: number;
  concurrencyLimit: number;
  totalJobsProcessed: number;
  totalTimeoutsEnforced: number;
  totalFallbacksTriggered: number;
}

class GpuJobQueue {
  private activeJobs = 0;
  private queue: Array<{
    jobName: string;
    resolve: (val: any) => void;
    reject: (err: Error) => void;
    enqueuedAt: number;
    queueTimeoutMs: number;
  }> = [];

  private totalProcessed = 0;
  private totalTimeouts = 0;
  private totalFallbacks = 0;

  private get maxConcurrency(): number {
    return GPU_ALLOW_CONCURRENT_JOBS ? 4 : 1; // 1 = Strict workstation mutex serialization
  }

  /**
   * Enqueues a task and returns a promise resolving when the lock is acquired.
   */
  private async acquireLock(jobName: string, options?: GpuJobOptions): Promise<void> {
    if (options?.bypassQueue || this.maxConcurrency > this.activeJobs) {
      this.activeJobs++;
      return;
    }

    const queueTimeoutMs = options?.queueTimeoutMs ?? GPU_QUEUE_TIMEOUT_MS;

    return new Promise<void>((resolve, reject) => {
      const enqueuedAt = Date.now();
      const queueTimeout = setTimeout(() => {
        const idx = this.queue.findIndex(item => item.resolve === resolve);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          this.totalTimeouts++;
          reject(new Error(`GPU Queue Timeout: Job "${jobName}" timed out waiting in queue for ${queueTimeoutMs}ms.`));
        }
      }, queueTimeoutMs);

      this.queue.push({
        jobName,
        resolve: () => {
          clearTimeout(queueTimeout);
          resolve();
        },
        reject: (err) => {
          clearTimeout(queueTimeout);
          reject(err);
        },
        enqueuedAt,
        queueTimeoutMs
      });
    });
  }

  private releaseLock(): void {
    this.activeJobs--;
    if (this.queue.length > 0 && this.activeJobs < this.maxConcurrency) {
      this.activeJobs++;
      const next = this.queue.shift();
      if (next) {
        next.resolve(null);
      }
    }
  }

  /**
   * Run a native GPU function with execution timeout and strict queue serialization.
   */
  public async run<T>(
    jobName: string,
    fn: () => Promise<T>,
    options?: GpuJobOptions
  ): Promise<T> {
    await this.acquireLock(jobName, options);

    const jobTimeoutMs = options?.jobTimeoutMs ?? GPU_JOB_TIMEOUT_MS;
    let jobTimeout: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      jobTimeout = setTimeout(() => {
        this.totalTimeouts++;
        reject(new Error(`GPU Job Timeout: Job "${jobName}" exceeded execution limit of ${jobTimeoutMs}ms.`));
      }, jobTimeoutMs);
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      this.totalProcessed++;
      return result;
    } catch (err) {
      throw err;
    } finally {
      clearTimeout(jobTimeout!);
      this.releaseLock();
    }
  }

  /**
   * Wrapper with built-in in-situ CPU fallback on VRAM congestion or device failures.
   */
  public async withFallback<T>(
    jobName: string,
    gpuFn: () => Promise<T>,
    cpuFn: () => Promise<T>,
    options?: GpuJobOptions
  ): Promise<T> {
    if (!GPU_FALLBACK_CPU) {
      return this.run(jobName, gpuFn, options);
    }

    try {
      return await this.run(jobName, gpuFn, options);
    } catch (err: any) {
      this.totalFallbacks++;
      console.warn(`⚠️ GPU Job "${jobName}" failed or timed out. Triggering CPU Fallback... Reason: ${err.message}`);
      return await cpuFn();
    }
  }

  public getState(): GpuQueueState {
    return {
      activeJobsCount: this.activeJobs,
      waitingJobsCount: this.queue.length,
      concurrencyLimit: this.maxConcurrency,
      totalJobsProcessed: this.totalProcessed,
      totalTimeoutsEnforced: this.totalTimeouts,
      totalFallbacksTriggered: this.totalFallbacks
    };
  }
}

const queueInstance = new GpuJobQueue();

export const runGpuJob = <T>(
  jobName: string,
  fn: () => Promise<T>,
  options?: GpuJobOptions
): Promise<T> => {
  return queueInstance.run(jobName, fn, options);
};

export const withCpuFallback = <T>(
  jobName: string,
  gpuFn: () => Promise<T>,
  cpuFn: () => Promise<T>,
  options?: GpuJobOptions
): Promise<T> => {
  return queueInstance.withFallback(jobName, gpuFn, cpuFn, options);
};

export const getGpuQueueState = (): GpuQueueState => {
  return queueInstance.getState();
};
