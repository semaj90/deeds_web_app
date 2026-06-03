#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modulePath = path
  .join(ROOT, 'sveltekit-frontend', 'src', 'lib', 'server', 'search', 'codebase-ann-backend.ts')
  .replace(/\\/g, '/');
const moduleUrl = pathToFileURL(modulePath).href;

function runWithEnv(extraEnv = {}) {
  const script = `
    import { getCodebaseAnnBackend } from ${JSON.stringify(moduleUrl)};
    console.log(getCodebaseAnnBackend());
  `;
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '-e', script],
    {
      cwd: ROOT,
      env: { ...process.env, ...extraEnv },
      encoding: 'utf8',
    }
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `exit ${result.status}`);
  }

  return String(result.stdout || '').trim();
}

function main() {
  const defaultBackend = runWithEnv({ CODEBASE_ANN_BACKEND: '' });
  assert.equal(defaultBackend, 'qdrant', 'default backend should remain qdrant');

  const turbovecBackend = runWithEnv({ CODEBASE_ANN_BACKEND: 'turbovec' });
  assert.equal(turbovecBackend, 'turbovec', 'env override should select turbovec');

  console.log('TurboVec ANN backend smoke passed.');
  console.log(`default=${defaultBackend} override=${turbovecBackend}`);
}

main();
