import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const ensureInferencePath = path.join(repoRoot, 'scripts', 'tests', 'ensure-inference.mjs');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const source = readText(ensureInferencePath);

  assert(source.includes('--flash-attn'), 'ensure-inference launcher is missing --flash-attn');
  assert(source.includes("'on'"), 'ensure-inference launcher is missing flash-attn on');
  assert(source.includes("-ctk"), 'ensure-inference launcher is missing kv cache K flag');
  assert(source.includes("-ctv"), 'ensure-inference launcher is missing kv cache V flag');

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        check: 'flashattention-gate',
        launcher: path.relative(repoRoot, ensureInferencePath),
        flashAttention: 'on',
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('[ace-flashattention-gate-smoke] failed:', err);
  process.exit(1);
});
