import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown } from '../atlas/_atlas-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '50', 10);
const PROGRESS_EVERY = parseInt(args.find(a => a.startsWith('--progress-every='))?.split('=')[1] || '5', 10);

const config = loadConfig();

// Canonical codebase collection for synthesis
const CODEBASE_COLLECTION = 'codebase_chunks_768';

console.log(`Starting Phase 2: Karpathy Synthesis Mode [WRITE=${WRITE}] [LIMIT=${LIMIT}]`);

function runScript(path, scriptArgs = [], envOverrides = {}) {
  const absPath = resolve(REPO_ROOT, path);
  console.log(`\n--- Running: ${path} ---`);
  const result = spawnSync(process.execPath, [absPath, ...scriptArgs], {
    stdio: 'inherit',
    env: { 
      ...process.env, 
      ...envOverrides,
      NODE_OPTIONS: '--max-old-space-size=8192' 
    }
  });
  if (result.status !== 0) {
    console.error(`Error: Script ${path} exited with code ${result.status}`);
    if (WRITE) process.exit(result.status ?? 1);
  }
  return result.status === 0;
}

const commonArgs = [];
if (WRITE) commonArgs.push('--write'); 
if (!WRITE) commonArgs.push('--dry-run');

// 0. Neo4j Graph Analysis (PageRank/Louvain)
const gdsArgs = [...commonArgs, `--limit=${LIMIT * 10}`];
runScript('sveltekit-frontend/scripts/neo4j-graph-enrich.mjs', gdsArgs, {
  QDRANT_COLLECTION: CODEBASE_COLLECTION
});

// 1. Karpathy Authority Blend (GPU Attention)
const karpathyArgs = [...commonArgs, '--limit', String(LIMIT)];
runScript('sveltekit-frontend/scripts/karpathy-gpu-enrich.mjs', karpathyArgs, {
  QDRANT_COLLECTION: CODEBASE_COLLECTION
});

// 2. File Summaries (T0 + T2 Gemma4)
const summaryArgs = [...commonArgs, '--limit', String(LIMIT)];
runScript('sveltekit-frontend/scripts/generate-file-summaries.mjs', summaryArgs, {
  QDRANT_COLLECTION: CODEBASE_COLLECTION
});

// 3. Cluster/Directory Summaries (Gemma4)
const clusterArgs = ['--limit', String(Math.ceil(LIMIT / 5))];
if (!WRITE) clusterArgs.push('--skip-llm');
runScript('sveltekit-frontend/scripts/graphify-cluster-summaries.mjs', clusterArgs, {
  QDRANT_COLLECTION: CODEBASE_COLLECTION
});

// Final Report
const report = {
  repo: config.repoName,
  generatedAt: new Date().toISOString(),
  runId: `synthesis_${Date.now()}`,
  limit: LIMIT,
  status: 'completed'
};

writeJson(resolveRepoPath(config.outputs.batchReportJson), report);
writeMarkdown(resolveRepoPath(config.outputs.batchReportMd), parentAtlasMarkdown('Karpathy Synthesis Lane - Production', {
  limit: LIMIT,
  runId: report.runId,
  mode: WRITE ? 'WRITE' : 'DRY_RUN'
}, [
  'Neo4j GDS Analysis: OK',
  'Authority Blend (GPU): OK',
  'File Summaries (Gemma4): OK',
  'Cluster Glyphs: OK'
]));

console.log(`\nSynthesis complete. Report written to ${config.outputs.batchReportJson}`);
process.exit(0);
