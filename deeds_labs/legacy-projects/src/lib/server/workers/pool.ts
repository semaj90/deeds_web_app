import { Worker } from 'worker_threads';
import os from 'os';
import path from 'path';

const MAX_WORKERS = Math.min(8, Math.max(1, os.cpus().length || 1));

export class ThreadPool {
  private queue: Array<{ data: any; resolve: (v: unknown) => void; reject: (e: unknown) => void }> =
    [];
  private active = 0;
  public maxWorkers: number;

  constructor(
    private scriptPath: string,
    maxWorkers = MAX_WORKERS
  ) {
    this.maxWorkers = Math.max(1, Math.min(maxWorkers, MAX_WORKERS));
  }

  runTask<T = unknown>(data: any): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(<any>(<any>{ data, resolve, reject }));
      this.tryRun();
    });
  }

  private tryRun() {
    while (this.active < this.maxWorkers && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.active++;
      const worker = new Worker(this.scriptPath, { workerData: item.data });
      worker.once('message', (msg) => {
        this.active--;
        item.resolve(msg);
        this.tryRun();
      });
      worker.once('error', (err) => {
        this.active--;
        item.reject(err);
        this.tryRun();
      });
      // ensure worker exit doesn't leak
      worker.once('exit', () => {
        // noop for now
      });
    }
  }
}
