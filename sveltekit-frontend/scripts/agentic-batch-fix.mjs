#!/usr/bin/env node
/**
 * Agentic Batch Fix — parallel concurrent error analysis CLI
 *
 * Reads docs/graph/codebase-graph.json hotspots, fans out to /api/ai/agent/batch
 * (SSE), and writes per-task fix plans into next_steps/active/{date}/batch-fix-{ts}/.
 *
 * Usage:
 *   node scripts/agentic-batch-fix.mjs [topN] [--concurrency=N] [--dry-run] [--bypass-cache]
 *
 *   topN              How many hotspot directories to fan out (default 5, max 30)
 *   --concurrency=N   Override server-side BATCH_FIX_CONCURRENCY (default 3, max 8)
 *   --dry-run         List tasks without dispatching to the agent
 *   --bypass-cache    Force fresh inference (no L1/L2 cache hits)
 *
 * Requires:
 *   - Dev server on :5173 (npm run dev)
 *   - codebase-graph.json (run `npm run index:codebase:fast` first)
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync }                  from 'node:fs';
import path                            from 'node:path';

const DEV_SERVER = process.env.DEV_SERVER ?? 'http://127.0.0.1:5173';
const GRAPH_PATH = path.resolve('docs/graph/codebase-graph.json');

// ── argv parsing ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const topN = (() => {
  const v = args.find((a) => /^\d+$/.test(a));
  return v ? Math.min(Math.max(parseInt(v, 10), 1), 30) : 5;
})();
const concurrency = (() => {
  const v = args.find((a) => a.startsWith('--concurrency='));
  return v ? Math.min(Math.max(parseInt(v.split('=')[1], 10), 1), 8) : undefined;
})();
const dryRun       = args.includes('--dry-run');
const bypassCache  = args.includes('--bypass-cache');

// ── Pre-flight checks ────────────────────────────────────────────────────────

if (!existsSync(GRAPH_PATH)) {
  console.error(`❌ ${GRAPH_PATH} not found. Run \`npm run index:codebase:fast\` first.`);
  process.exit(2);
}

const ts        = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const day       = ts.split('_')[0];
const outDir    = path.resolve(`next_steps/active/${day}/batch-fix-${ts}`);

console.log(`📊 Loading hotspots from ${GRAPH_PATH}`);
console.log(`🔧 topN=${topN} concurrency=${concurrency ?? 'server-default'} dryRun=${dryRun} bypassCache=${bypassCache}`);
console.log(`📂 Output → ${outDir}`);

// ── Fan-out ───────────────────────────────────────────────────────────────────

if (dryRun) {
  // Dry-run: just compute hotspots locally and list them — never hit the API
  const graph = JSON.parse(await readFile(GRAPH_PATH, 'utf-8'));
  const all   = graph.directories ?? graph.dirs ?? [];
  const dirs  = all
    .filter((d) => d.score < 60 || d.todos > 2 || (d.apis > 0 && (d.auth ?? 0) < d.apis))
    .sort((a, b) => a.score - b.score || b.todos - a.todos)
    .slice(0, topN);
  console.log(`\n📋 Top ${dirs.length} hotspots (dry-run, no API call):\n`);
  for (const d of dirs) {
    const authGap = (d.apis ?? 0) - (d.auth ?? 0);
    const reasons = [];
    if (d.score < 60)  reasons.push(`score=${d.score}`);
    if (d.todos > 2)   reasons.push(`todos=${d.todos}`);
    if (authGap > 0)   reasons.push(`auth-gap=${authGap}/${d.apis}`);
    console.log(`  • ${d.dir.padEnd(50)} ${reasons.join(' ')}`);
  }
  process.exit(0);
}

// ── Live: stream from /api/ai/agent/batch (SSE) ──────────────────────────────

await mkdir(outDir, { recursive: true });

const body = JSON.stringify({ mode: 'hotspots', topN, concurrency, bypassCache });
console.log(`\n🚀 POST ${DEV_SERVER}/api/ai/agent/batch`);

const res = await fetch(`${DEV_SERVER}/api/ai/agent/batch`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
  body,
});

if (!res.ok || !res.body) {
  const text = await res.text().catch(() => '');
  console.error(`❌ Batch endpoint returned ${res.status}: ${text.slice(0, 400)}`);
  process.exit(3);
}

// Parse SSE stream incrementally
const reader  = res.body.getReader();
const decoder = new TextDecoder();
let   buffer  = '';

let totalTasks = 0;
let completedCount = 0;
let failedCount    = 0;
const indexLines = [];

async function handleEvent(event, data) {
  if (event === 'started') {
    totalTasks = data.totalTasks;
    console.log(`▶️  Started — ${totalTasks} tasks, concurrency=${data.concurrency}`);
    for (const dir of data.dirs) console.log(`   • ${dir}`);
  } else if (event === 'progress') {
    const idx     = (completedCount + failedCount + 1).toString().padStart(2, '0');
    const slug    = data.dir.replace(/[^a-z0-9]/gi, '_').slice(0, 60);
    const fname   = `${idx}-${slug}.md`;
    const fpath   = path.join(outDir, fname);
    const status  = data.status === 'completed' ? '✅' : '❌';
    const dur     = (data.durationMs / 1000).toFixed(1);
    console.log(`${status} [${idx}/${totalTasks}] ${data.dir}  (${dur}s, rounds=${data.result?.rounds ?? 0}, tools=${(data.result?.toolsUsed ?? []).join(',') || 'none'})`);

    const md = [
      `# Batch fix plan — \`${data.dir}\``,
      ``,
      `- **Task ID:** \`${data.taskId}\``,
      `- **Status:** ${data.status}`,
      `- **Duration:** ${dur}s`,
      `- **Rounds:** ${data.result?.rounds ?? 0}`,
      `- **Tools used:** ${(data.result?.toolsUsed ?? []).join(', ') || '(none)'}`,
      `- **Cache tier:** ${data.result?.cacheTier ?? '—'}`,
      `- **Backend:** ${data.result?.inferenceBackend ?? '—'}`,
      ``,
      `## Plan`,
      ``,
      data.result?.answer ?? `❌ Failed: ${data.error ?? 'unknown error'}`,
    ].join('\n');
    await writeFile(fpath, md, 'utf-8');

    indexLines.push(`- [${idx} ${data.dir}](./${fname}) — ${data.status} (${dur}s)`);
    if (data.status === 'completed') completedCount++;
    else failedCount++;
  } else if (event === 'completed') {
    const dur = (data.durationMs / 1000).toFixed(1);
    console.log(`\n🏁 Done — ${data.totalCompleted}✅ / ${data.totalFailed}❌ in ${dur}s`);

    // Write index.md
    const indexMd = [
      `# Batch error-fix run — ${ts}`,
      ``,
      `- **Hotspots analyzed:** ${totalTasks}`,
      `- **Completed:** ${data.totalCompleted}`,
      `- **Failed:** ${data.totalFailed}`,
      `- **Total duration:** ${dur}s`,
      `- **Concurrency:** ${concurrency ?? 'server-default'}`,
      ``,
      `## Plans`,
      ``,
      ...indexLines,
    ].join('\n');
    await writeFile(path.join(outDir, 'index.md'), indexMd, 'utf-8');
    console.log(`📝 Index → ${path.join(outDir, 'index.md')}`);
  } else if (event === 'error') {
    console.error(`💥 Server error: ${data.error}`);
    process.exitCode = 4;
  }
}

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  // SSE: events separated by blank line
  let sep;
  while ((sep = buffer.indexOf('\n\n')) !== -1) {
    const block = buffer.slice(0, sep);
    buffer = buffer.slice(sep + 2);

    let event = 'message';
    const dataLines = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:'))      event = line.slice(6).trim();
      else if (line.startsWith('data:'))  dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) continue;
    try {
      const data = JSON.parse(dataLines.join('\n'));
      await handleEvent(event, data);
    } catch (e) {
      console.warn(`⚠️  Failed to parse SSE event "${event}":`, e.message);
    }
  }
}

console.log(`\n✨ Plans written to ${outDir}`);
