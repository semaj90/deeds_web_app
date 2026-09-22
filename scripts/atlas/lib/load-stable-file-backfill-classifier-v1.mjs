/**
 * Loader shim so plain-`node` .mjs scripts can use the pure S01-08J backfill classifier
 * (sveltekit-frontend/src/lib/server/atlas/identity/stable-file-backfill-classifier-v1.ts)
 * without a JS twin. Same pattern as load-authority-shadow-v1.mjs.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const frontendRequire = createRequire(path.join(repoRoot, 'sveltekit-frontend', 'package.json'));
let cached;

export async function loadStableFileBackfillClassifierModuleV1() {
  if (cached) return cached;
  const { register } = await import(pathToFileURL(frontendRequire.resolve('tsx/esm/api')).href);
  register();
  cached = await import(pathToFileURL(path.join(repoRoot, 'sveltekit-frontend/src/lib/server/atlas/identity/stable-file-backfill-classifier-v1.ts')).href);
  return cached;
}
