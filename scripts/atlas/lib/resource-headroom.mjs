import os from 'node:os';
import fs from 'node:fs';

export function resourceHeadroom(root = process.cwd(), env = process.env) {
  let freeDiskBytes = null;
  try {
    const stats = fs.statfsSync(root);
    freeDiskBytes = Number(stats.bavail) * Number(stats.bsize);
  } catch {}
  const freeMemoryBytes = os.freemem();
  const minimumFreeDiskBytes = Number(env.ATLAS_MIN_FREE_DISK_BYTES ?? 8 * 1024 ** 3);
  const minimumFreeMemoryBytes = Number(env.ATLAS_MIN_FREE_MEMORY_BYTES ?? 4 * 1024 ** 3);
  return {
    freeDiskBytes,
    freeMemoryBytes,
    minimumFreeDiskBytes,
    minimumFreeMemoryBytes,
    diskOk: freeDiskBytes === null || freeDiskBytes >= minimumFreeDiskBytes,
    memoryOk: freeMemoryBytes >= minimumFreeMemoryBytes,
    ok: (freeDiskBytes === null || freeDiskBytes >= minimumFreeDiskBytes) && freeMemoryBytes >= minimumFreeMemoryBytes,
  };
}

export function assertResourceHeadroom(root = process.cwd(), env = process.env) {
  const result = resourceHeadroom(root, env);
  if (!result.ok) {
    const error = new Error('REFUSED_INSUFFICIENT_RESOURCE_HEADROOM');
    error.details = result;
    throw error;
  }
  return result;
}
