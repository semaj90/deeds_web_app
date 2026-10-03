import { parentPort } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Bounded worker for SYMBOL-REGISTRY-REPAIR: hashes one file's exact current
// bytes per message. Never writes anything; read-only by construction.
parentPort.on('message', async ({ index, filePath }) => {
  try {
    const buf = await readFile(filePath);
    const hash = createHash('sha256').update(buf).digest('hex');
    parentPort.postMessage({ index, hash });
  } catch (error) {
    parentPort.postMessage({ index, error: error.message });
  }
});
