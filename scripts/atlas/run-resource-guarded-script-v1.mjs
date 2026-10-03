#!/usr/bin/env node
/**
 * Resource gate for bounded Atlas scripts.
 *
 * Usage:
 *   node scripts/atlas/run-resource-guarded-script-v1.mjs scripts/atlas/audit-...mjs [args]
 *
 * The child is never started when the configured disk/memory floor is not met.
 * This is a process boundary, so a shell separator cannot accidentally continue
 * after a refused preflight.
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { assertResourceHeadroom } from './lib/resource-headroom.mjs';

const [, , target, ...args] = process.argv;
if (!target || target.startsWith('-')) {
  console.error('USAGE: run-resource-guarded-script-v1.mjs <script> [args...]');
  process.exit(64);
}

try {
  const result = assertResourceHeadroom(process.cwd(), process.env);
  console.log(JSON.stringify({
    schema: 'atlas.resource-guarded-script.v1',
    status: 'RESOURCE_HEADROOM_OK',
    target,
    freeDiskGiB: result.freeDiskBytes === null ? null : Number((result.freeDiskBytes / 1024 ** 3).toFixed(2)),
    freeMemoryGiB: Number((result.freeMemoryBytes / 1024 ** 3).toFixed(2)),
    minimumFreeDiskGiB: Number((result.minimumFreeDiskBytes / 1024 ** 3).toFixed(2)),
    minimumFreeMemoryGiB: Number((result.minimumFreeMemoryBytes / 1024 ** 3).toFixed(2)),
    writesPerformed: false,
  }));
} catch (error) {
  const details = error?.details ?? {};
  console.error(JSON.stringify({
    schema: 'atlas.resource-guarded-script.v1',
    status: 'REFUSED_INSUFFICIENT_RESOURCE_HEADROOM',
    target,
    freeDiskGiB: details.freeDiskBytes == null ? null : Number((details.freeDiskBytes / 1024 ** 3).toFixed(2)),
    freeMemoryGiB: details.freeMemoryBytes == null ? null : Number((details.freeMemoryBytes / 1024 ** 3).toFixed(2)),
    minimumFreeDiskGiB: details.minimumFreeDiskBytes == null ? null : Number((details.minimumFreeDiskBytes / 1024 ** 3).toFixed(2)),
    minimumFreeMemoryGiB: details.minimumFreeMemoryBytes == null ? null : Number((details.minimumFreeMemoryBytes / 1024 ** 3).toFixed(2)),
    writesPerformed: false,
  }));
  process.exit(2);
}

const child = spawnSync(process.execPath, [target, ...args], { stdio: 'inherit', shell: false });
if (child.error) {
  console.error(child.error.message);
  process.exit(1);
}
process.exit(child.status ?? 1);
