#!/usr/bin/env node
import { resourceHeadroom } from './lib/resource-headroom.mjs';

const result = resourceHeadroom(process.cwd(), process.env);
console.log(JSON.stringify({
  schema: 'atlas.resource-headroom-preflight.v1',
  status: result.ok ? 'RESOURCE_HEADROOM_OK' : 'REFUSED_INSUFFICIENT_RESOURCE_HEADROOM',
  freeDiskGiB: result.freeDiskBytes === null ? null : Number((result.freeDiskBytes / 1024 ** 3).toFixed(2)),
  minimumFreeDiskGiB: Number((result.minimumFreeDiskBytes / 1024 ** 3).toFixed(2)),
  freeMemoryGiB: Number((result.freeMemoryBytes / 1024 ** 3).toFixed(2)),
  minimumFreeMemoryGiB: Number((result.minimumFreeMemoryBytes / 1024 ** 3).toFixed(2)),
  writesPerformed: false,
}, null, 2));
if (!result.ok) process.exit(2);
