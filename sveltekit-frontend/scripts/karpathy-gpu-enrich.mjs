#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const implPath = resolve(__dirname, '../../scripts/atlas/karpathy-gpu-enrich.mjs');

if (!existsSync(implPath)) {
  const err = new Error(`KARPATHY_IMPL_MISSING: expected implementation at ${implPath}`);
  err.code = 'KARPATHY_IMPL_MISSING';
  throw err;
}

await import(pathToFileURL(implPath).href);
