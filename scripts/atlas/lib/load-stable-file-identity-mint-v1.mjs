/**
 * Loader shim so plain-`node` .mjs scripts can use the ONE canonical stable-file/repository
 * identity minter (sveltekit-frontend/src/lib/server/atlas/identity/stable-file-identity-mint-v1.ts)
 * without a JS twin. Same pattern as load-authority-shadow-v1.mjs.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const frontendRequire = createRequire(path.join(repoRoot, 'sveltekit-frontend', 'package.json'));
let cached;

export async function loadStableFileIdentityMintModuleV1() {
  if (cached) return cached;
  const { register } = await import(pathToFileURL(frontendRequire.resolve('tsx/esm/api')).href);
  register();
  cached = await import(pathToFileURL(path.join(repoRoot, 'sveltekit-frontend/src/lib/server/atlas/identity/stable-file-identity-mint-v1.ts')).href);
  return cached;
}
