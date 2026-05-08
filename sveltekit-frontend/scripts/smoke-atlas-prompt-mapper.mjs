#!/usr/bin/env node
/**
 * smoke-atlas-prompt-mapper.mjs
 *
 * End-to-end smoke for src/lib/server/atlas/{types,atlas-loader,prompt-mapper}.
 * Loads the atlas from Redis, ranks files, prints a sample prompt block.
 *
 * Run via tsx so the .ts modules resolve under the SvelteKit path alias:
 *   node scripts/smoke-atlas-prompt-mapper.mjs
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');

// Use tsx so the $lib alias resolves via tsconfig paths.
const inline = `
  import { buildPromptCards, cardsToPromptBlock } from '$lib/server/atlas/prompt-mapper.ts';
  import { loadAtlas, loadAtlasSummary } from '$lib/server/atlas/atlas-loader.ts';

  const summary = await loadAtlasSummary();
  console.log('summary:', summary);

  const { atlas, source } = await loadAtlas();
  console.log('source:', source, 'files:', atlas.files.length, 'clusters:', atlas.stats.clusters);

  // Top-5 over the whole atlas
  const topAll = await buildPromptCards({ topN: 5 });
  console.log('\\n── Top-5 (all axes) ──');
  console.log(cardsToPromptBlock(topAll, 'Top-5 atlas cards'));

  // Top-3 inside a single topo_class
  const topApi = await buildPromptCards({ topN: 3, filter: { topoClass: 'api-route' } });
  console.log('── Top-3 in api-route ──');
  console.log(cardsToPromptBlock(topApi, 'api-route candidates'));
`;

const result = spawnSync(
  'npx',
  ['tsx', '--tsconfig', resolve(ROOT, 'tsconfig.json'), '-e', inline],
  { cwd: ROOT, stdio: 'inherit' },
);
process.exit(result.status ?? 0);
