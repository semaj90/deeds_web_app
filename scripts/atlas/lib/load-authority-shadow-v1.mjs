/**
 * Loader shim so plain-`node` .mjs readers can use the ONE shadow-selection owner
 * (sveltekit-frontend/src/lib/server/atlas/admission/graphify-authority-shadow-read-v1.ts) without a JS twin.
 * Uses tsx's import hook only when the TypeScript source has to be loaded.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const frontendRequire = createRequire(path.join(repoRoot, 'sveltekit-frontend', 'package.json'));
let cached;

export async function loadAuthorityShadowModuleV1() {
  if (cached) return cached;
  const { register } = await import(pathToFileURL(frontendRequire.resolve('tsx/esm/api')).href);
  register();
  cached = await import(pathToFileURL(path.join(repoRoot, 'sveltekit-frontend/src/lib/server/atlas/admission/graphify-authority-shadow-read-v1.ts')).href);
  return cached;
}
