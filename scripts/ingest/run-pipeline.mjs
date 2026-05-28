#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'path';

const ROOT = process.cwd();
const SCRIPTS = path.join(ROOT, 'scripts', 'ingest');

function run(cmd, args) {
  console.log('> ', cmd, args.join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
}

function main() {
  // 1. split
  run('node', [path.join(SCRIPTS, 'split-cards.mjs')]);
  // 2. embed
  run('node', [path.join(SCRIPTS, 'embed-cards.mjs')]);
  // 3. store metadata
  run('node', [path.join(SCRIPTS, 'store-postgres.mjs')]);
  // 4. store vectors
  run('node', [path.join(SCRIPTS, 'store-qdrant.mjs')]);
  // 5. build ace packet
  run('node', [path.join(SCRIPTS, 'build-ace-packet.mjs')]);
  console.log('Pipeline complete.');
}

main();
