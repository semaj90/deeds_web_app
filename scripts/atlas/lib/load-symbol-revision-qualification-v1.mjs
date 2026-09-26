/**
 * Loader shim so plain-`node` symbol writers use the ONE qualification owner
 * (sveltekit-frontend/src/lib/server/atlas/identity/symbol-revision-qualification-v1.ts) without a JS twin.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const frontendRequire = createRequire(path.join(repoRoot, 'sveltekit-frontend', 'package.json'));
let cached;

export async function loadSymbolRevisionQualificationV1() {
  if (cached) return cached;
  const { register } = await import(pathToFileURL(frontendRequire.resolve('tsx/esm/api')).href);
  register();
  cached = await import(pathToFileURL(path.join(repoRoot, 'sveltekit-frontend/src/lib/server/atlas/identity/symbol-revision-qualification-v1.ts')).href);
  return cached;
}
