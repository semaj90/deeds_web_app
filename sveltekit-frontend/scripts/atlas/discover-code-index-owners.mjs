#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT, alignCwdToRepoRoot } from '../_repo-root.mjs';

const inventoryFile = path.resolve(REPO_ROOT, 'tmp', 'atlas', 'runtime-owner-inventory.jsonl');
const outputFile = path.resolve(REPO_ROOT, 'tmp', 'atlas', 'owner-candidates.jsonl');

async function main() {
  alignCwdToRepoRoot();
  await mkdir(path.dirname(outputFile), { recursive: true });

  const content = await readFile(inventoryFile, 'utf8');
  await writeFile(outputFile, content, 'utf8');
  console.log(JSON.stringify({
    output_file: outputFile,
    source_file: inventoryFile,
    working_directory: REPO_ROOT,
  }, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('ENOENT')) {
    console.error(`Missing inventory file: ${inventoryFile}`);
    console.error('Run build-runtime-owner-inventory.mjs first.');
    process.exitCode = 1;
    return;
  }

  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
