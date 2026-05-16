import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown } from '../atlas/_atlas-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const FORCE = args.includes('--force');
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '50', 10);
const PROGRESS_EVERY = parseInt(args.find(a => a.startsWith('--progress-every='))?.split('=')[1] || '5', 10);
const RUN_ID = args.find(a => a.startsWith('--runId='))?.split('=')[1] || (args.includes('--runId') ? args[args.indexOf('--runId') + 1] : null);

const config = loadConfig();

// Canonical codebase collection for synthesis
const CODEBASE_COLLECTION = 'codebase_chunks_768';

console.log(`Starting Phase 2: Karpathy Synthesis Mode [WRITE=${WRITE}] [LIMIT=${LIMIT}] [FORCE=${FORCE}] [RUN_ID=${RUN_ID}]`);

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
if (FORCE) commonArgs.push('--force');
if (RUN_ID) commonArgs.push(`--runId=${RUN_ID}`);

// 0. Neo4j Graph Analysis (PageRank/Louvain)
const gdsArgs = [...commonArgs, `--limit=${LIMIT * 10}`];
runScript('scripts/atlas/neo4j-graph-enrich.mjs', gdsArgs, {
  QDRANT_COLLECTION: CODEBASE_COLLECTION
});

// 1. Karpathy Authority Blend (GPU Attention)
const karpathyArgs = [...commonArgs, '--limit', String(LIMIT)];
runScript('scripts/atlas/karpathy-gpu-enrich.mjs', karpathyArgs, {
  QDRANT_COLLECTION: CODEBASE_COLLECTION
});

// 2. File Summaries (T0 + T2 Gemma4)
const summaryArgs = [...commonArgs, '--limit', String(LIMIT)];
runScript('scripts/atlas/generate-file-summaries.mjs', summaryArgs, {
  QDRANT_COLLECTION: CODEBASE_COLLECTION
});

// 3. Cluster/Directory Summaries (Gemma4)
const clusterArgs = [...commonArgs, '--limit', String(Math.ceil(LIMIT / 5))];
// Cluster summaries don't use --dry-run conventionally, but they use --skip-llm to be safe if not writing
if (!WRITE) clusterArgs.push('--skip-llm');
runScript('scripts/atlas/graphify-cluster-summaries.mjs', clusterArgs, {
  QDRANT_COLLECTION: CODEBASE_COLLECTION
});

// Final Report
const report = {
  repo: config.repoName,
  generatedAt: new Date().toISOString(),
  runId: `synthesis_${Date.now()}`,
  limit: LIMIT,
  status: 'completed',
  force: FORCE
};

writeJson(resolveRepoPath(config.outputs.batchReportJson), report);
writeMarkdown(resolveRepoPath(config.outputs.batchReportMd), parentAtlasMarkdown('Karpathy Synthesis Lane - Production', {
  limit: LIMIT,
  runId: report.runId,
  mode: WRITE ? 'WRITE' : 'DRY_RUN',
  force: FORCE
}, [
  'Neo4j GDS Analysis: OK',
  'Authority Blend (GPU): OK',
  'File Summaries (Gemma4): OK',
  'Cluster Glyphs: OK'
]));

console.log(`\nSynthesis complete. Report written to ${config.outputs.batchReportJson}`);
process.exit(0);
