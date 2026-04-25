/**
 * Phase 89: Cluster Worker (Worker Thread)
 * - Runs in separate thread (non-blocking)
 * - Calls Python CUDA clustering script
 * - Returns results to main server
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { parentPort } from 'worker_threads';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_PATH = process.env.PHASE72_PYTHON || 'python';

parentPort.postMessage({ type: 'ready' });

parentPort.on('message', async (msg) => {
  if (msg.type === 'cluster') {
    const { jobId, errorIds, options } = msg;

    try {
      const result = await runCudaClustering(errorIds, options);
      parentPort.postMessage({
        type: 'result',
        jobId,
        clusters: result.clusters,
        summary: result.summary,
      });
    } catch (err) {
      parentPort.postMessage({
        type: 'error',
        jobId,
        error: err.message,
      });
    }
  }
});

/**
 * Run CUDA clustering via Python subprocess
 */
function runCudaClustering(errorIds, options) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'phase89-gpu-streaming-cluster.py');

    const args = [
      scriptPath,
      '--batch-size',
      options.batchSize || '5000',
      '--error-ids',
      errorIds.join(','),
    ];

    const proc = spawn(PYTHON_PATH, args, {
      cwd: __dirname,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python script failed: ${stderr}`));
      }

      // Parse output (expecting JSON on last line)
      const lines = stdout.trim().split('\n');
      const lastLine = lines[lines.length - 1];

      try {
        const result = JSON.parse(lastLine);
        resolve(result);
      } catch (err) {
        reject(new Error(`Failed to parse Python output: ${lastLine}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}
