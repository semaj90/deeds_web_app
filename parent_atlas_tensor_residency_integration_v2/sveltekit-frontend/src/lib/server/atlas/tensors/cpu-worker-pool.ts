import { Worker } from 'node:worker_threads';
import { CPU_WORKER_MAX, createSharedCounters, type CpuFeatureResult, type CpuFeatureTask } from './shared-worker-protocol';

export class CpuFeatureWorkerPool {
  readonly counters = createSharedCounters();
  private readonly workers: Worker[] = [];
  private next = 0;

  constructor(workerModule: URL, size = CPU_WORKER_MAX) {
    const bounded = Math.max(1, Math.min(CPU_WORKER_MAX, size));
    for (let i = 0; i < bounded; i += 1) this.workers.push(new Worker(workerModule, { workerData: { counters: this.counters.buffer } }));
  }

  run(task: CpuFeatureTask): Promise<CpuFeatureResult> {
    const worker = this.workers[this.next++ % this.workers.length];
    Atomics.add(this.counters, 0, 1);
    Atomics.add(this.counters, 2, 1);
    return new Promise((resolve, reject) => {
      const onMessage = (result: CpuFeatureResult) => {
        if (result.taskId !== task.taskId) return;
        worker.off('message', onMessage);
        Atomics.add(this.counters, 1, 1);
        Atomics.sub(this.counters, 2, 1);
        if (!result.ok) Atomics.add(this.counters, 3, 1);
        resolve(result);
      };
      worker.on('message', onMessage);
      worker.postMessage(task);
      worker.once('error', reject);
    });
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}
