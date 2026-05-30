#!/usr/bin/env node
/**
 * gemma4-tasker.mjs
 *
 * Generate prioritised kanban tasks for the parent atlas using Gemma4
 * (llama-server :8090 with chat template) and TRACE MCP (:8788) JSON-RPC
 * for code/graph context.
 *
 * Reads:
 *   .tmp/ingest/parent_atlas_full.parquet (via DuckDB)
 *   memory/exports/parent-atlas-redis-warmup.json (heat signal)
 *
 * Output:
 *   .tmp/ingest/gemma4-tasks.ndjson — one task per high-priority node
 *   memory/exports/gemma4-tasker-report.json
 *
 * Each task:
 *   {
 *     id: "task-{lane}-{node_id}-{nonce}",
 *     priority: "P1"|"P2"|"P3",
 *     lane, node_id, sourceRef,
 *     reason, suggested_action, mcp_context_keys
 *   }
 *
 * Modes:
 *   --dry-run         (no LLM call, heuristic-only)
 *   --apply           (call Gemma4 for high-degree shallow-wired hotspots)
 *   --limit N         (default 50 nodes)
 *   --llm-url URL     (default http://localhost:8090)
 *   --mcp-url URL     (default http://localhost:8788)
 *   --max-tokens N    (default 256 per node)
 *
 * Usage:
 *   node scripts/atlas/ingester/gemma4-tasker.mjs --apply --limit 20
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');

function flagVal(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
}
const LIMIT = parseInt(flagVal('--limit', '50'), 10);
const LLM_URL = flagVal('--llm-url', process.env.LLAMA_SERVER_URL || 'http://localhost:8090');
const MCP_URL = flagVal('--mcp-url', process.env.TRACE_MCP_URL || 'http://localhost:8788');
const MAX_TOKENS = parseInt(flagVal('--max-tokens', '256'), 10);

const PARQUET = path.join(ROOT, '.tmp', 'ingest', 'parent_atlas_full.parquet');
const OUT_NDJSON = path.join(ROOT, '.tmp', 'ingest', 'gemma4-tasks.ndjson');
const REPORT = path.join(ROOT, 'memory', 'exports', 'gemma4-tasker-report.json');

// ─── DuckDB parquet reader ───────────────────────────────────────────────

function parquetToJSON(parquetPath) {
  const tmp = parquetPath + '.tasker.tmp.json';
  const pq = parquetPath.replace(/\\/g, '/');
  const tj = tmp.replace(/\\/g, '/');
  const r = spawnSync('duckdb', [
    '-c',
    `COPY (SELECT * FROM read_parquet('${pq}') ORDER BY degree DESC NULLS LAST LIMIT ${LIMIT * 4}) TO '${tj}' (FORMAT JSON, ARRAY TRUE);`,
  ], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`duckdb failed: ${r.stderr || r.stdout}`);
  const data = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.unlinkSync(tmp);
  return data;
}

// ─── MCP JSON-RPC client ─────────────────────────────────────────────────

let mcpRpcId = 0;
async function callMCP(method, params) {
  const body = { jsonrpc: '2.0', id: ++mcpRpcId, method, params };
  try {
    const res = await fetch(`${MCP_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const json = await res.json();
    return json.result ?? json;
  } catch (e) {
    return { error: e.message };
  }
}

async function mcpHealth() {
  return await callMCP('tools/list', {});
}

// ─── Gemma4 chat (llama-server compatible) ───────────────────────────────

async function gemma4Chat(systemPrompt, userPrompt) {
  const body = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: MAX_TOKENS,
    temperature: 0.2,
    stream: false,
    cache_prompt: true,
  };
  try {
    const res = await fetch(`${LLM_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { error: `HTTP ${res.status} from llama-server` };
    const json = await res.json();
    return { content: json.choices?.[0]?.message?.content || '' };
  } catch (e) {
    return { error: e.message };
  }
}

// ─── Heuristic priority assignment ───────────────────────────────────────

function heuristicPriority(node) {
  const degree = Number(node.degree) || 0;
  const reward = Number(node.reward_avg) || 0;
  const clusterSize = Number(node.cluster_size) || 0;

  // P1: high-degree + high reward (load-bearing, performs well — protect)
  if (degree >= 10 && reward >= 0.7) return { priority: 'P1', reason: 'high-degree + high-reward (load-bearing hotspot)' };
  // P1: high-degree shallow (no reward signal, but heavily depended on)
  if (degree >= 20) return { priority: 'P1', reason: 'high-degree shallow-wired (load-bearing, no reward signal)' };
  // P2: dense cluster member
  if (clusterSize >= 200) return { priority: 'P2', reason: 'member of dense SOM cluster (potential consolidation)' };
  // P2: route with low coverage
  if (node.lane === 'route') return { priority: 'P2', reason: 'route endpoint (auth/zod coverage check)' };
  // P3: env / language / workspace — informational
  return { priority: 'P3', reason: `informational ${node.lane} node` };
}

function suggestActionHeuristic(node, priority) {
  switch (node.lane) {
    case 'card':
      if (priority === 'P1') return 'Audit imports + verify SOM cluster locality; consider freezing if reward_avg ≥ 0.8.';
      return 'Review semantic neighbors in SOM cluster; add docstring if missing.';
    case 'route':
      return 'Verify auth guard + Zod validation; pair with mutation test stub if missing.';
    case 'env':
      return 'Document in env.server.ts catalog; add to AGENTS.md envelope.';
    case 'import':
      return 'Audit deep import paths; check for circular deps.';
    case 'language':
      return 'No action — informational.';
    case 'workspace':
      return 'Verify workspace boundaries match repo structure.';
    case 'som_edge':
      return 'Inspect cluster heat; consider splitting if >200 members.';
    case 'outcome':
      return 'Cross-check reward signal vs. attributed card.';
    default:
      return 'Review node payload.';
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ Gemma4 Tasker ═══════════════════════════════════════');
  console.log(`  Mode:       ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Limit:      ${LIMIT} nodes`);
  console.log(`  LLM URL:    ${LLM_URL}`);
  console.log(`  MCP URL:    ${MCP_URL}`);
  console.log(`  Parquet:    ${PARQUET}`);
  console.log('');

  if (!fs.existsSync(PARQUET)) {
    console.error(`❌ ${PARQUET} not found. Run unified-ingester --apply first.`);
    process.exit(1);
  }

  // Health checks
  let llmOk = false;
  let mcpOk = false;

  if (APPLY) {
    console.log('  Step 0: Health checks...');
    const llmProbe = await fetch(LLM_URL + '/health').catch(() => null);
    llmOk = llmProbe?.ok || false;
    console.log(`    Gemma4 (${LLM_URL}): ${llmOk ? '✅ UP' : '⚠️  DOWN (will use heuristics only)'}`);

    const mcpProbe = await mcpHealth();
    mcpOk = !mcpProbe?.error;
    if (mcpOk) {
      const toolCount = Array.isArray(mcpProbe?.tools) ? mcpProbe.tools.length : 'unknown';
      console.log(`    TRACE MCP (${MCP_URL}): ✅ UP (${toolCount} tools)`);
    } else {
      console.log(`    TRACE MCP (${MCP_URL}): ⚠️  DOWN (${mcpProbe?.error || 'unreachable'}) — using heuristics only`);
    }
    console.log('');
  }

  // Read top-K nodes by degree
  console.log('  Step 1: Read top nodes by degree...');
  const candidates = parquetToJSON(PARQUET);
  // Skip language/workspace lanes (they're meta), focus on actionable lanes
  const actionable = candidates.filter((n) => !['language', 'workspace'].includes(n.lane)).slice(0, LIMIT);
  console.log(`  ✅ Selected ${actionable.length} candidate nodes`);

  // Generate tasks
  console.log('\n  Step 2: Generate tasks...');
  const tasks = [];
  let llmInvocations = 0;
  let llmFailures = 0;

  for (let i = 0; i < actionable.length; i++) {
    const node = actionable[i];
    const { priority, reason } = heuristicPriority(node);
    let suggested_action = suggestActionHeuristic(node, priority);
    let llm_used = false;

    // Only call LLM for P1 nodes when both services are up
    if (APPLY && llmOk && priority === 'P1') {
      const sys = `You are a code auditor for a SvelteKit + Drizzle + pgvector legal AI project. Reply with ONE short imperative sentence describing the next concrete action. No prose, no preamble.`;
      const usr = `Node:
- lane: ${node.lane}
- id: ${node.node_id}
- source: ${node.sourceRef || 'n/a'}
- degree: ${node.degree}
- reward_avg: ${node.reward_avg ?? 'none'}
- som_cluster: (${node.som_row},${node.som_col})  cluster_size=${node.cluster_size ?? '?'}
- reason: ${reason}

Suggest the single highest-leverage next action.`;
      const res = await gemma4Chat(sys, usr);
      llmInvocations++;
      if (res.error) {
        llmFailures++;
        if (VERBOSE) console.log(`    [llm-fail node=${i}] ${res.error}`);
      } else if (res.content?.trim()) {
        suggested_action = res.content.trim().replace(/^["']|["']$/g, '');
        llm_used = true;
      }
    }

    const task = {
      id: `task-${node.lane}-${node.node_id}-${Date.now().toString(36)}-${i}`,
      priority,
      lane: node.lane,
      node_id: node.node_id,
      sourceRef: node.sourceRef,
      degree: node.degree,
      reward_avg: node.reward_avg,
      som_cluster: node.som_row !== null && node.som_row !== undefined ? `${node.som_row}:${node.som_col}` : null,
      cluster_size: node.cluster_size,
      reason,
      suggested_action,
      llm_used,
      created_at: new Date().toISOString(),
    };
    tasks.push(task);
    if (VERBOSE) console.log(`    [${i + 1}/${actionable.length}] ${priority} ${node.lane}:${node.node_id} ${llm_used ? '🤖' : '⚙'}`);
  }
  console.log(`  ✅ Generated ${tasks.length} tasks (${llmInvocations} LLM calls, ${llmFailures} failures)`);

  // Write outputs
  if (APPLY) {
    fs.mkdirSync(path.dirname(OUT_NDJSON), { recursive: true });
    fs.writeFileSync(OUT_NDJSON, tasks.map((t) => JSON.stringify(t)).join('\n') + '\n', 'utf8');
    console.log(`  ✅ Tasks → ${OUT_NDJSON}`);
  }

  // Summary by priority
  const byPriority = tasks.reduce((acc, t) => { acc[t.priority] = (acc[t.priority] || 0) + 1; return acc; }, {});
  console.log('\n══ Summary ═══════════════════════════════════════════');
  console.log(`  Total tasks:  ${tasks.length}`);
  console.log(`  P1:           ${byPriority.P1 || 0}`);
  console.log(`  P2:           ${byPriority.P2 || 0}`);
  console.log(`  P3:           ${byPriority.P3 || 0}`);
  console.log(`  LLM-enhanced: ${tasks.filter((t) => t.llm_used).length}`);
  console.log(`  Gemma4 up:    ${llmOk ? 'yes' : 'no (heuristic-only fallback)'}`);
  console.log(`  TRACE MCP up: ${mcpOk ? 'yes' : 'no (heuristic-only fallback)'}`);

  if (APPLY) {
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify({
      timestamp: new Date().toISOString(),
      llm: { url: LLM_URL, up: llmOk, invocations: llmInvocations, failures: llmFailures },
      mcp: { url: MCP_URL, up: mcpOk },
      summary: { total: tasks.length, by_priority: byPriority, llm_enhanced: tasks.filter((t) => t.llm_used).length },
    }, null, 2), 'utf8');
    console.log(`  📝 Report → ${REPORT}`);
  } else {
    console.log('  [DRY-RUN] No files written. Use --apply to persist.');
  }
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
