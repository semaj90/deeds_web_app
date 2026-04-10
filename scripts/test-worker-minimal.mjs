import { parentPort, workerData } from 'worker_threads';
console.log('[TestWorker] Hello from worker! Data:', workerData);
parentPort.postMessage({ status: 'alive', pid: process.pid });