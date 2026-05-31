const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');

class WorkerPool {
  constructor(workerPath, size) {
    this.workerPath = workerPath;
    this.size = size || Math.max(1, os.cpus().length - 1);
    this.idle = [];
    this.busy = new Map();
    for (let i = 0; i < this.size; i++) this.idle.push(this._spawn());
    this.nextId = 1;
  }

  _spawn() {
    const w = new Worker(this.workerPath);
    w.on('error', (err) => console.error('worker error', err));
    return w;
  }

  exec(files) {
    return new Promise((resolve, reject) => {
      const worker = this.idle.pop() || this._spawn();
      const id = this.nextId++;
      const onmsg = (m) => {
        if (m.id !== id) return;
        worker.off('message', onmsg);
        this.idle.push(worker);
        resolve(m.result);
      };
      worker.on('message', onmsg);
      // Support two payload styles:
      // - exec(arrayOfFilePaths) -> posts { id, files: [...] }
      // - exec({ type: 'parse', contents: [...] }) -> posts { id, type: 'parse', contents: [...] }
      if (Array.isArray(files)) {
        worker.postMessage({ id, files });
      } else if (files && typeof files === 'object') {
        const payload = Object.assign({}, files, { id });
        worker.postMessage(payload);
      } else {
        worker.postMessage({ id, files });
      }
    });
  }

  destroy() {
    for (const w of this.idle) w.terminate();
    for (const w of this.busy.values()) w.terminate();
    this.idle = [];
    this.busy.clear();
  }
}

module.exports = WorkerPool;
