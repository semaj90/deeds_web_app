#!/usr/bin/env node
/**
 * gemma4-error-fixer.mjs
 *
 * Consume gemma4-tasks.ndjson, call Gemma4 + TRACE MCP for context,
 * and emit fix proposals (NOT applied — operator reviews and applies).
 *
 * Reads:
 *   .tmp/ingest/gemma4-tasks.ndjson
 *
 * Output:
 *   .tmp/ingest/gemma4-fixes.ndjson — one proposal per P1/P2 task
 *   memory/exports/gemma4-error-fixer-report.json
 *
 * Each fix proposal:
 *   {
 *     id: "fix-{task_id}",
 *     task_id, lane, node_id, sourceRef,
 *     diagnosis, proposed_change, confidence,
 *     mcp_context (snippet), applied: false
 *   }
 *
 * Safety:
 *   - Never writes to source files (operator applies via review)
 *   - --dry-run skips LLM calls
 *   - Each proposal is human-readable, not a unified diff
 *
 * Usage:
 *   node scripts/atlas/ingester/gemma4-error-fixer.mjs --apply
 *   node scripts/atlas/ingester/gemma4-error-fixer.mjs --apply --priorities P1
 *   node scripts/atlas/ingester/gemma4-error-fixer.mjs --apply --limit 10
 */

import fs from 'node:fs';
import path from 'node:path';
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
const LIMIT = parseInt(flagVal('--limit', '20'), 10);
const LLM_URL = flagVal('--llm-url', process.env.LLAMA_SERVER_URL || 'http://localhost:8090');
const MCP_URL = flagVal('--mcp-url', process.env.TRACE_MCP_URL || 'http://localhost:8788');
const MAX_TOKENS = parseInt(flagVal('--max-tokens', '384'), 10);
const PRIORITIES = (flagVal('--priorities', 'P1,P2') || 'P1,P2').split(',');

const TASKS_PATH = path.join(ROOT, '.tmp', 'ingest', 'gemma4-tasks.ndjson');
const OUT_NDJSON = path.join(ROOT, '.tmp', 'ingest', 'gemma4-fixes.ndjson');
const REPORT = path.join(ROOT, 'memory', 'exports', 'gemma4-error-fixer-report.json');

// ─── MCP JSON-RPC ────────────────────────────────────────────────────────

let mcpRpcId = 0;
async function callMCP(method, params) {
  try {
    const res = await fetch(`${MCP_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++mcpRpcId, method, params }),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const json = await res.json();
    return json.result ?? json;
  } catch (e) {
    return { error: e.message };
  }
}

async function mcpFetchCodeContext(sourceRef) {
  if (!sourceRef) return null;
  // Try a generic search tool if available, fall back to nothing
  const r = await callMCP('tools/call', { name: 'kag_search', arguments: { query: sourceRef, k: 3 } });
  if (r?.error) return null;
  return r;
}

// ─── Gemma4 ──────────────────────────────────────────────────────────────

async function gemma4Chat(systemPrompt, userPrompt) {
  try {
    const res = await fetch(`${LLM_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
        stream: false,
        cache_prompt: true,
      }),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const json = await res.json();
    return { content: json.choices?.[0]?.message?.content || '' };
  } catch (e) {
    return { error: e.message };
  }
}

// ─── Heuristic diagnosis (when LLM down) ─────────────────────────────────

function heuristicDiagnosis(task) {
  switch (task.lane) {
    case 'card':
      return {
        diagnosis: `High-degree card (${task.degree} edges). Likely a shared utility or facade. Verify import surface.`,
        proposed_change: 'Audit consumers: rg "from.*' + (task.sourceRef || task.node_id).replace(/[/\\]/g, '/') + '" src/ --type ts',
        confidence: 0.6,
      };
    case 'route':
      return {
        diagnosis: `Route endpoint. Coverage gates: G18 (auth guard) + G19 (Zod validation) + G26 (test pattern).`,
        proposed_change: 'Run audit gates G18/G19/G26 against this route. Add missing guard/validation/test stub.',
        confidence: 0.7,
      };
    case 'env':
      return {
        diagnosis: `Env variable used ${task.degree}× across codebase but undocumented.`,
        proposed_change: `Add ${task.node_id} to env.server.ts catalog with type + default + description.`,
        confidence: 0.8,
      };
    case 'som_edge':
      return {
        diagnosis: `Dense SOM cluster (${task.cluster_size} members). Possible feature consolidation candidate.`,
        proposed_change: 'Inspect top-K members for shared concerns; consider extracting common interface.',
        confidence: 0.5,
      };
    case 'import':
      return {
        diagnosis: `Heavily imported module (${task.degree} uses). Surface API audit recommended.`,
        proposed_change: 'Audit barrel exports for backward-compat shims; check for unused exports.',
        confidence: 0.6,
      };
    default:
      return {
        diagnosis: `Generic ${task.lane} node, degree=${task.degree}.`,
        proposed_change: task.suggested_action || 'Review node payload.',
        confidence: 0.4,
      };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ Gemma4 Error-Fixer ══════════════════════════════════');
  console.log(`  Mode:       ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Limit:      ${LIMIT} fixes`);
  console.log(`  Priorities: ${PRIORITIES.join(',')}`);
  console.log(`  LLM URL:    ${LLM_URL}`);
  console.log(`  MCP URL:    ${MCP_URL}`);
  console.log('');

  if (!fs.existsSync(TASKS_PATH)) {
    console.error(`❌ ${TASKS_PATH} not found. Run gemma4-tasker.mjs --apply first.`);
    process.exit(1);
  }

  // Read tasks
  const tasks = fs.readFileSync(TASKS_PATH, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const filtered = tasks.filter((t) => PRIORITIES.includes(t.priority)).slice(0, LIMIT);
  console.log(`  Step 1: Loaded ${tasks.length} tasks, ${filtered.length} match priorities`);

  // Health checks
  let llmOk = false;
  let mcpOk = false;
  if (APPLY) {
    const llmProbe = await fetch(LLM_URL + '/health').catch(() => null);
    llmOk = llmProbe?.ok || false;
    const mcpProbe = await callMCP('tools/list', {});
    mcpOk = !mcpProbe?.error;
    console.log(`  Step 2: Health checks — Gemma4: ${llmOk ? '✅' : '⚠️'}  MCP: ${mcpOk ? '✅' : '⚠️'}\n`);
  }

  // Generate fix proposals
  const fixes = [];
  let llmInvocations = 0;
  let mcpInvocations = 0;

  console.log('  Step 3: Generate fix proposals...');
  for (let i = 0; i < filtered.length; i++) {
    const task = filtered[i];
    let diagnosis, proposed_change, confidence;
    let mcp_context = null;

    // Default to heuristic
    ({ diagnosis, proposed_change, confidence } = heuristicDiagnosis(task));

    if (APPLY && mcpOk && task.sourceRef) {
      const ctx = await mcpFetchCodeContext(task.sourceRef);
      if (ctx) {
        mcp_context = ctx;
        mcpInvocations++;
      }
    }

    if (APPLY && llmOk) {
      const sys = `You are a senior code auditor. Reply in this exact JSON format:
{"diagnosis":"<one sentence>","proposed_change":"<one imperative sentence>","confidence":<0.0-1.0>}
No prose outside the JSON.`;
      const usr = `Audit this node and propose a fix.

Task:
- priority: ${task.priority}
- lane: ${task.lane}
- id: ${task.node_id}
- source: ${task.sourceRef || 'n/a'}
- degree: ${task.degree}
- reward_avg: ${task.reward_avg ?? 'none'}
- som_cluster: ${task.som_cluster ?? 'none'}
- reason: ${task.reason}
- prior suggestion: ${task.suggested_action}

${mcp_context ? `MCP context: ${JSON.stringify(mcp_context).slice(0, 500)}` : 'No MCP context.'}`;
      const res = await gemma4Chat(sys, usr);
      llmInvocations++;
      if (!res.error && res.content) {
        // Try to parse JSON from response
        const m = res.content.match(/\{[\s\S]*\}/);
        if (m) {
          try {
            const parsed = JSON.parse(m[0]);
            if (parsed.diagnosis) diagnosis = parsed.diagnosis;
            if (parsed.proposed_change) proposed_change = parsed.proposed_change;
            if (typeof parsed.confidence === 'number') confidence = parsed.confidence;
          } catch {
            // Keep heuristic
          }
        }
      }
    }

    fixes.push({
      id: `fix-${task.id}`,
      task_id: task.id,
      priority: task.priority,
      lane: task.lane,
      node_id: task.node_id,
      sourceRef: task.sourceRef,
      diagnosis,
      proposed_change,
      confidence,
      mcp_context: mcp_context ? '(captured)' : null,
      llm_used: APPLY && llmOk,
      mcp_used: !!mcp_context,
      applied: false,
      created_at: new Date().toISOString(),
    });

    if (VERBOSE) console.log(`    [${i + 1}/${filtered.length}] ${task.priority} ${task.lane}:${task.node_id} conf=${confidence}`);
  }

  // Write
  if (APPLY) {
    fs.mkdirSync(path.dirname(OUT_NDJSON), { recursive: true });
    fs.writeFileSync(OUT_NDJSON, fixes.map((f) => JSON.stringify(f)).join('\n') + '\n', 'utf8');
    console.log(`  ✅ Fixes → ${OUT_NDJSON}`);
  }

  // Summary
  const byPriority = fixes.reduce((acc, f) => { acc[f.priority] = (acc[f.priority] || 0) + 1; return acc; }, {});
  const avgConf = fixes.length ? fixes.reduce((s, f) => s + (f.confidence || 0), 0) / fixes.length : 0;
  console.log('\n══ Summary ═══════════════════════════════════════════');
  console.log(`  Total fixes:    ${fixes.length}`);
  console.log(`  P1:             ${byPriority.P1 || 0}`);
  console.log(`  P2:             ${byPriority.P2 || 0}`);
  console.log(`  Avg confidence: ${avgConf.toFixed(2)}`);
  console.log(`  LLM calls:      ${llmInvocations}`);
  console.log(`  MCP calls:      ${mcpInvocations}`);
  console.log(`  Applied:        0 (operator review required)`);

  if (APPLY) {
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify({
      timestamp: new Date().toISOString(),
      input_tasks: tasks.length,
      filtered_tasks: filtered.length,
      fixes_emitted: fixes.length,
      avg_confidence: avgConf,
      llm: { url: LLM_URL, up: llmOk, invocations: llmInvocations },
      mcp: { url: MCP_URL, up: mcpOk, invocations: mcpInvocations },
      by_priority: byPriority,
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
