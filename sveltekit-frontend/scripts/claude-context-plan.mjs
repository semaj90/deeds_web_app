#!/usr/bin/env node
/**
 * claude-context-plan.mjs — Pre-patch context harvester for Claude Code
 *
 * Runs rg/find/awk searches across the repo and optionally queries TRACE MCP
 * graph tools, then writes a structured context plan to scratch/claude/.
 *
 * Usage:
 *   node scripts/claude-context-plan.mjs [--query "..."] [--no-graph] [--quiet]
 *
 * Output:
 *   scratch/claude/context-plan.json   — machine-readable plan
 *   scratch/claude/context-plan.md     — human/Claude-readable summary
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args     = process.argv.slice(2);
const noGraph  = args.includes('--no-graph');
const quiet    = args.includes('--quiet');
const queryArg = (() => {
  const i = args.indexOf('--query');
  return i >= 0 ? args[i + 1] : null;
})();

const ROOT = process.cwd();

// ── Shell helper ──────────────────────────────────────────────────────────────

function sh(cmd, cwd) {
  const r = spawnSync(cmd, {
    shell: true,
    encoding: 'utf8',
    cwd: cwd ?? ROOT,
    timeout: 15_000,
  });
  return (r.stdout ?? '').trim();
}

// ── Searches ──────────────────────────────────────────────────────────────────

if (!quiet) process.stdout.write('Harvesting context...');

const searches = {
  ai_graph: sh('rg "runGemma4Agent|trace.kag_search|tool_calls|ALLOWED_TOOLS|forestClusterRank|nearestCluster" src/lib/server/ai src/mcp -n 2>/dev/null | head -40', path.join(ROOT, 'sveltekit-frontend')),
  graph:    sh('rg "topology.search_near|graph.expand|pagerank|manifold4|som_cluster|neo4j_gpuCluster" src scripts -n 2>/dev/null | head -40', path.join(ROOT, 'sveltekit-frontend')),
  gpu:      sh('rg "batchCosineSimilarity|clusterEmbeddings|graphSimilarity|trainSOM|kmeansWithCentroids|forestClusterRank" src scripts -n 2>/dev/null | head -40', path.join(ROOT, 'sveltekit-frontend')),
  ace:      sh('rg "fetchCodebaseContext|fetchACPKnowledge|ACEContext|Stage A|Stage 2|clusterFilter|topoFilter|combinedFilter" src/lib/server/ace -n 2>/dev/null | head -40', path.join(ROOT, 'sveltekit-frontend')),
  wiki:     sh('rg "wiki:note|CouchDB|Obsidian|karpathy|WikiNote" src scripts -n 2>/dev/null | head -40', path.join(ROOT, 'sveltekit-frontend')),
  todos:    sh('rg "TODO|FIXME|HACK" src/lib/server src/routes scripts -n 2>/dev/null | head -40', path.join(ROOT, 'sveltekit-frontend')),
  routes:   sh('find src/routes -name "+server.ts" 2>/dev/null | sort | head -40', path.join(ROOT, 'sveltekit-frontend')),
  tests:    sh('find tests -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | sort | head -40', path.join(ROOT, 'sveltekit-frontend')),
  server_dirs: sh('find src/lib/server -maxdepth 2 -type d 2>/dev/null | sort | head -30', path.join(ROOT, 'sveltekit-frontend')),
};

if (queryArg) {
  searches.custom_query = sh(`rg "${queryArg.replace(/"/g, '\\"')}" src tests scripts -n 2>/dev/null | head -60`, path.join(ROOT, 'sveltekit-frontend'));
}

if (!quiet) process.stdout.write(' done.\n');

// ── Optional: TRACE MCP graph search ─────────────────────────────────────────

const graphContext = {};
if (!noGraph) {
  const query = queryArg ?? 'GPU indexer pipeline cluster forest prefilter ACE';
  try {
    const body = {
      jsonrpc: '2.0', method: 'tools/call', id: 1,
      params: { name: 'trace.kag_search', arguments: { query, limit: 6 } },
    };
    const res = await fetch('http://127.0.0.1:8788/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6_000),
    });
    if (res.ok) {
      const data = await res.json();
      graphContext.kagSearch = data.result ?? data.error ?? 'no result';
    }
  } catch (e) {
    graphContext.kagSearch = `unavailable: ${e.message}`;
  }
}

// ── Service quick-check ───────────────────────────────────────────────────────

async function quickCheck(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return r.status < 500 ? 'ok' : `HTTP ${r.status}`;
  } catch { return 'down'; }
}

const runtime = {
  sveltekit:  await quickCheck('http://127.0.0.1:5173/api/health').catch(() => quickCheck('http://127.0.0.1:5173/')),
  mcp:        await quickCheck('http://127.0.0.1:8788/health'),
  topology:   await quickCheck('http://127.0.0.1:8101/health'),
  turboQuant: await quickCheck('http://127.0.0.1:8090/health'),
};

// ── Recommended next actions (static priorities) ──────────────────────────────

const recommendedNextActions = [
  {
    priority: 'P1',
    task: 'Populate PageRank scores',
    commands: ['npx tsx scripts/run-pagerank.ts', 'npm run smoke:trace'],
  },
  {
    priority: 'P2',
    task: 'Warm forest cluster embeddings',
    commands: ['node scripts/warm-forest-clusters.mjs'],
  },
  {
    priority: 'P3',
    task: 'Validate forest prefilter (ACE Stage 2)',
    commands: ['npm run smoke:agentic-tools', 'npm run smoke:graphify'],
  },
  {
    priority: 'P4',
    task: 'Run full type check after context-assembler edits',
    commands: ['npx svelte-check --threshold error', 'npx tsgo --noEmit'],
  },
];

// ── Write outputs ─────────────────────────────────────────────────────────────

const scratchDir = path.join(ROOT, 'sveltekit-frontend', 'scratch', 'claude');
fs.mkdirSync(scratchDir, { recursive: true });

const plan = {
  generatedAt: new Date().toISOString(),
  runtime,
  graphContext,
  searches,
  recommendedNextActions,
};

fs.writeFileSync(path.join(scratchDir, 'context-plan.json'), JSON.stringify(plan, null, 2));

const md = [
  `# Claude Context Plan\n\nGenerated: ${plan.generatedAt}\n`,
  `## Runtime\n\n${Object.entries(runtime).map(([k, v]) => `- **${k}**: ${v}`).join('\n')}\n`,
  `## Graph Context (TRACE MCP)\n\n${graphContext.kagSearch ? '```\n' + JSON.stringify(graphContext.kagSearch, null, 2).slice(0, 2000) + '\n```' : '_MCP unavailable_'}\n`,
  ...Object.entries(searches).map(([k, v]) =>
    `## ${k}\n\n\`\`\`\n${(v || '_no results_').slice(0, 3000)}\n\`\`\``
  ),
  `## Recommended Next Actions\n\n${recommendedNextActions.map(a =>
    `**${a.priority}** — ${a.task}\n${a.commands.map(c => '  ```bash\n  ' + c + '\n  ```').join('\n')}`
  ).join('\n\n')}`,
].join('\n\n');

fs.writeFileSync(path.join(scratchDir, 'context-plan.md'), md);

if (!quiet) {
  console.log(`\nContext plan written:`);
  console.log(`  scratch/claude/context-plan.json`);
  console.log(`  scratch/claude/context-plan.md\n`);
  console.log(`Runtime: ${Object.entries(runtime).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  if (recommendedNextActions.length) {
    console.log(`\nTop action: [${recommendedNextActions[0].priority}] ${recommendedNextActions[0].task}`);
    console.log(`  Run: ${recommendedNextActions[0].commands[0]}`);
  }
}
