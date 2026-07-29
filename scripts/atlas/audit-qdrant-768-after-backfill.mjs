#!/usr/bin/env node
export * from './audit-qdrant-768-after-backfill.mts';

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { main } from './audit-qdrant-768-after-backfill.mts';

const executedDirectly = (() => {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return import.meta.url === pathToFileURL(path.resolve(argv1)).href;
})();

if (executedDirectly) {
  main().catch((error) => {
    console.error('[phase109-audit] fatal:', error instanceof Error ? error.message : String(error));
    process.exitCode = 7;
  });
}
