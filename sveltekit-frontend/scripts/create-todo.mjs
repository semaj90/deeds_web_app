#!/usr/bin/env node

import { readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const GRAPH_PATH = resolve(ROOT, 'docs/graph/codebase-graph.json');
const ATLAS_PATH = resolve(ROOT, 'docs/atlas-index/codebase-atlas.min.json');
const ATLAS_MD_PATH = resolve(ROOT, 'memory/atlas/codebase-atlas.latest.md');
const OUTPUT_PATH = resolve(ROOT, 'next_steps/active/codebase-todo-recommendations.md');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const STDOUT = args.includes('--stdout');

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function fmt(n) {
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '0';
}

function renderTodo(graph, atlas, atlasMdSize) {
  const tick = '`';
  const fileCount = graph?.files?.length ?? 0;
  const dirCount = graph?.directories?.length ?? 0;
  const clusterCount = graph?.clusters?.length ?? 0;
  const atlasCount = atlas?.files?.length ?? atlas?.stats?.files ?? 0;

  return [
    '# Codebase Index Loop TODO',
    '',
    '## Goal',
    'Finish the canonical graphRAG indexing loop once, then reuse it everywhere: graph ingest, Redis centroids, SOM autoencoding, LLMS.md atlas refresh, and Karpathy GPU ranking.',
    '',
    '## Current Artifacts',
    `- Graph: ${tick}docs/graph/codebase-graph.json${tick} (${fmt(fileCount)} files, ${fmt(dirCount)} dirs, ${fmt(clusterCount)} clusters)`,
    `- Atlas: ${tick}docs/atlas-index/codebase-atlas.min.json${tick} (${fmt(atlasCount)} files indexed)`,
    `- LLMS atlas: ${tick}memory/atlas/codebase-atlas.latest.md${tick} (${fmt(atlasMdSize)} bytes)`,
    '',
    '## Canonical Loop',
    `1. ${tick}npm run graphify:daily${tick} refreshes the graph ingestion surface.`,
    `2. ${tick}npm run atlas:build${tick} rebuilds the LLM atlas from the fresh graph.`,
    `3. ${tick}npm run graphify:som${tick} updates SOM/topology projections.`,
    `4. ${tick}npm run ae:train:js${tick} retrains the autoencoder loop.`,
    `5. ${tick}npm run ae:centroids${tick} refreshes Redis centroids.`,
    `6. ${tick}npm run ae:backfill${tick} pushes the new embeddings back into Qdrant.`,
    `7. ${tick}npm run llms:write && npm run llms:index${tick} refreshes the LLMS.md atlas.`,
    `8. ${tick}npm run karpathy:gpu:insights${tick} rebuilds Karpathy scores on top of the atlas.`,
    '',
    '## No Duplicate Paths',
    `${tick}graphify:daily${tick} is the shared ingest entrypoint.`,
    `${tick}karpathy:gpu:insights${tick} now rebuilds Atlas first.`,
    `${tick}create:todo${tick} is the single TODO generator; ${tick}skill:codebase-todo:*${tick} aliases to it.`,
    '',
    '## Next Step',
    'Run the canonical loop, then regenerate this TODO so the task list stays aligned with the latest atlas.',
    '',
  ].join('\n');
}

async function main() {
  if (!existsSync(GRAPH_PATH)) {
    throw new Error(`Missing graph index: ${GRAPH_PATH}. Run npm run graphify:daily first.`);
  }

  const graph = await readJsonIfExists(GRAPH_PATH);
  const atlas = await readJsonIfExists(ATLAS_PATH);
  const atlasMdSize = existsSync(ATLAS_MD_PATH) ? (await stat(ATLAS_MD_PATH)).size : 0;

  const markdown = renderTodo(graph, atlas, atlasMdSize);

  if (STDOUT) {
    process.stdout.write(markdown);
    return;
  }

  if (!DRY_RUN) {
    await writeFile(OUTPUT_PATH, markdown, 'utf8');
  }

  console.log(`${DRY_RUN ? '[dry-run] ' : ''}TODO ${STDOUT ? 'printed' : 'ready at'}: ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(`[create-todo] ${err.message}`);
  process.exit(1);
});
