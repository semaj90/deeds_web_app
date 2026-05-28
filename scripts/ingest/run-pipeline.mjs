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

const args = process.argv.slice(2);
const query = args.filter(a => !a.startsWith('--') && !/^\d+$/.test(a)).join(' ') || 'ACE context retrieval';
const budget = args.includes('--budget') ? args[args.indexOf('--budget') + 1] : '6000';
const ttl    = args.includes('--ttl')    ? args[args.indexOf('--ttl')    + 1] : '86400';
const dryRun = args.includes('--dry-run') ? ['--dry-run'] : [];

function main() {
  // 1. split
  run('node', [path.join(SCRIPTS, 'split-cards.mjs')]);
  // 2. embed
  run('node', [path.join(SCRIPTS, 'embed-cards.mjs')]);
  // 3. store metadata
  run('node', [path.join(SCRIPTS, 'store-postgres.mjs')]);
  // 4. store vectors
  run('node', [path.join(SCRIPTS, 'store-qdrant.mjs')]);
  // 5. rank cards (Phase 11D scoring)
  run('node', [path.join(SCRIPTS, 'rank-cards.mjs'), query, ...dryRun]);
  // 6. rerank cards (Phase 10B TurboVec blend)
  run('node', [path.join(SCRIPTS, 'rerank-cards.mjs'), ...dryRun]);
  // 7. label features (sourceRef → domain → featureLabel → ownerArea)
  run('node', [path.join(SCRIPTS, 'label-features.mjs'), ...dryRun]);
  // 8. compress + token-budget selection
  run('node', [path.join(SCRIPTS, 'compress-cards.mjs'), '--budget', budget, ...dryRun]);
  // 9. cache ACE packet in Redis (Valkey)
  run('node', [path.join(SCRIPTS, 'cache-ace-packet.mjs'), '--ttl', ttl, ...dryRun]);
  console.log('Pipeline complete.');
}

main();
