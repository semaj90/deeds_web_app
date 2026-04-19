#!/usr/bin/env node
/**
 * test-langgraph-pipeline.mjs
 *
 * Tests the LangGraph concurrent research pipeline end-to-end and
 * generates contextual graph analysis with Ollama synthesis:
 *
 *   Phase 1 — Preflight         (dev server health)
 *   Phase 2 — Endpoint tests    (GET status, POST JSON, SSE stream)
 *   Phase 3 — Deep analysis     (claude-assist: error fixes + dir consolidations)
 *   Phase 4 — Log results       (JSON + Markdown to scripts/tests/logs/)
 *
 * Usage:
 *   node scripts/tests/test-langgraph-pipeline.mjs
 *   node scripts/tests/test-langgraph-pipeline.mjs --base http://localhost:3000
 *   node scripts/tests/test-langgraph-pipeline.mjs --skip-stream   (skip SSE phase)
 *   node scripts/tests/test-langgraph-pipeline.mjs --quick         (error-patterns only)
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir  = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '..', '..');
const LOGS   = join(__dir, 'logs');

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const baseIdx    = args.indexOf('--base');
const BASE       = baseIdx !== -1 ? args[baseIdx + 1] : 'http://localhost:5173';
const SKIP_SSE   = args.includes('--skip-stream');
const QUICK      = args.includes('--quick');
const TIMEOUT_MS = 180_000;

// ── Helpers ───────────────────────────────────────────────────────────────────
const ts   = () => new Date().toISOString();
const ms   = (t) => `${Math.round(performance.now() - t)}ms`;
const pad  = (s, w = 60) => s.slice(0, w).padEnd(w);
const sep  = (label = '') => console.log(`\n${'─'.repeat(70)}\n  ${label}\n${'─'.repeat(70)}`);
let   failCount = 0;

function log(status, label, detail = '') {
  const icon = status === 'ok' ? '✅' : status === 'skip' ? '⏭️ ' : status === 'warn' ? '⚠️ ' : '❌';
  console.log(`${icon}  ${pad(label)} ${detail}`);
}

async function apiFetch(path, opts = {}) {
  const t0  = performance.now();
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      'x-dev-bypass':  'true',           // picked up by hooks.server.ts when DEV_BYPASS_AUTH=true
      ...(opts.headers ?? {}),
    },
  });
  return { res, durationMs: Math.round(performance.now() - t0) };
}

async function sseCollect(path, body, maxEvents = 6, timeoutMs = 60_000) {
  return new Promise((resolve) => {
    const events = [];
    const ctrl   = new AbortController();
    const timer  = setTimeout(() => { ctrl.abort(); resolve({ events, timedOut: true }); }, timeoutMs);

    fetch(`${BASE}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
      body:    JSON.stringify(body),
      signal:  ctrl.signal,
    }).then(async (res) => {
      if (!res.ok) { clearTimeout(timer); resolve({ events, httpStatus: res.status }); return; }
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let   buf    = '';
      let   curEvt = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (line.startsWith('event: ')) { curEvt = line.slice(7).trim(); }
          else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              events.push({ event: curEvt, data });
              if (events.length >= maxEvents || curEvt === 'complete' || curEvt === 'error') {
                reader.cancel(); clearTimeout(timer); resolve({ events }); return;
              }
            } catch {}
          }
        }
      }
      clearTimeout(timer); resolve({ events });
    }).catch((err) => { clearTimeout(timer); resolve({ events, error: err.message }); });
  });
}

// ── Report accumulator ────────────────────────────────────────────────────────
const report = {
  meta:      { startedAt: ts(), base: BASE, args },
  phases:    {},
  summary:   { passed: 0, failed: 0, skipped: 0 },
  analysis:  {},
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Preflight
// ─────────────────────────────────────────────────────────────────────────────
sep('Phase 1 — Preflight');
const t_pre = performance.now();

let serverOk = false;
try {
  const { res } = await apiFetch('/api/health');
  serverOk = res.ok || res.status === 404; // 404 means server is up, route doesn't exist
  log(serverOk ? 'ok' : 'warn', 'Dev server reachable', `HTTP ${res.status}`);
} catch (e) {
  log('fail', 'Dev server NOT reachable', e.message);
  failCount++;
}

const { res: lgStatus } = await apiFetch('/api/research/concurrent-deep').catch(() => ({ res: null }));
const lgStatusOk = lgStatus?.status === 200;
log(lgStatusOk ? 'ok' : 'fail', 'GET /api/research/concurrent-deep', lgStatus ? `HTTP ${lgStatus.status}` : 'fetch failed');
if (!lgStatusOk) failCount++;

report.phases.preflight = {
  serverOk,
  lgEndpointOk: lgStatusOk,
  lgMeta:       lgStatusOk ? await lgStatus.json() : null,
  durationMs:   Math.round(performance.now() - t_pre),
};

if (!serverOk) {
  console.log('\n⛔  Dev server not reachable — start it with `npm run dev` then re-run.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Endpoint tests
// ─────────────────────────────────────────────────────────────────────────────
sep('Phase 2 — Endpoint tests');
const t_ep = performance.now();
report.phases.endpoints = {};

// 2A: POST concurrent-deep (JSON, compact, error-patterns only)
{
  const q = 'What are the critical error patterns in the API routes and auth system?';
  const body = { query: q, domains: ['error-patterns', 'auth'], limitPerWorker: 8, compact: true };
  log('skip', '2A POST /concurrent-deep (error-patterns + auth) …', '');
  const t0 = performance.now();
  try {
    const { res, durationMs } = await apiFetch('/api/research/concurrent-deep', {
      method: 'POST', body: JSON.stringify(body),
    });
    const ok   = res.status === 200;
    const data = ok ? await res.json() : null;
    log(ok ? 'ok' : 'fail', '2A POST /concurrent-deep', `HTTP ${res.status} ${durationMs}ms chunks=${data?.totalChunks ?? '?'}`);
    if (!ok) failCount++;
    report.phases.endpoints.jsonError = { ok, status: res.status, durationMs, data };
  } catch (e) {
    log('fail', '2A POST /concurrent-deep', e.message);
    failCount++;
  }
}

// 2B: POST concurrent-deep (JSON, broader query)
if (!QUICK) {
  const q = 'Which directory and file organization patterns cause the most duplication or confusion?';
  const body = { query: q, domains: ['api-routes', 'ui-components', 'general'], limitPerWorker: 8, compact: true };
  const t0 = performance.now();
  try {
    const { res, durationMs } = await apiFetch('/api/research/concurrent-deep', {
      method: 'POST', body: JSON.stringify(body),
    });
    const ok   = res.status === 200;
    const data = ok ? await res.json() : null;
    log(ok ? 'ok' : 'fail', '2B POST /concurrent-deep (dir analysis)', `HTTP ${res.status} ${durationMs}ms chunks=${data?.totalChunks ?? '?'}`);
    if (!ok) failCount++;
    report.phases.endpoints.jsonDir = { ok, status: res.status, durationMs, data };
  } catch (e) {
    log('fail', '2B POST /concurrent-deep', e.message);
    failCount++;
  }
}

// 2C: SSE stream (per-worker events)
if (!SKIP_SSE) {
  console.log('\n  ⏳ 2C SSE stream — collecting up to 6 events (60s timeout)…');
  const body = { query: 'How does the codebase handle CUDA OOM errors and GPU fallbacks?', limitPerWorker: 6, persist: false };
  const t0   = performance.now();
  const { events, timedOut, error, httpStatus } = await sseCollect(
    '/api/research/concurrent-deep/stream', body, 6, 60_000
  );
  const elapsed = Math.round(performance.now() - t0);
  if (error || httpStatus) {
    log('fail', '2C SSE stream', error ?? `HTTP ${httpStatus}`);
    failCount++;
  } else {
    const types = events.map(e => e.event);
    log(events.length > 0 ? 'ok' : 'warn', '2C SSE stream', `${events.length} events [${types.join('→')}] ${elapsed}ms${timedOut ? ' (timed out)' : ''}`);
    // Print worker events inline
    events.filter(e => e.event === 'worker').forEach(e =>
      console.log(`      worker[${e.data.domain}]: ${e.data.chunkCount} chunks ${e.data.durationMs}ms (${e.data.source})`)
    );
    const complete = events.find(e => e.event === 'complete');
    if (complete) {
      console.log(`      complete: ${complete.data.totalChunks} total chunks, ${complete.data.totalDurationMs}ms`);
      console.log(`      summary: ${(complete.data.supervisorSummary ?? '').slice(0, 200)}…`);
    }
  }
  report.phases.endpoints.sse = { events, timedOut, error, durationMs: Math.round(performance.now() - t0) };
}

report.phases.endpoints.durationMs = Math.round(performance.now() - t_ep);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Deep contextual graph analysis
// ─────────────────────────────────────────────────────────────────────────────
sep('Phase 3 — Deep contextual graph analysis (claude-assist)');
const t_deep = performance.now();
report.analysis = {};

// Force bypass caching so Ollama does fresh synthesis when stale cache is suspected
const FORCE_FRESH = args.includes('--force-ollama');

const ANALYSES = [
  {
    key:     'errorFixes',
    label:   '3A Error-fix recommendations',
    query:   'What are the top TypeScript and runtime errors in the codebase? List specific files and the exact fixes needed.',
    errorQuery: 'TS2345 TS2339 TS2322 undefined is not a function',
    domains: ['error-patterns', 'api-routes', 'database'],
    budgets: { maxResearchFindings: 8, maxRetrievalHits: 10, maxAceChunks: 8, maxSummaryChars: 1200, maxActionItems: 10 },
  },
  ...(QUICK ? [] : [
    {
      key:     'dirConsolidation',
      label:   '3B Directory consolidation recommendations',
      query:   'Which server modules, API route groups, or lib directories have overlapping responsibilities that could be merged or restructured?',
      domains: ['api-routes', 'rag-pipeline', 'cache', 'general'],
      budgets: { maxResearchFindings: 8, maxRetrievalHits: 10, maxAceChunks: 8, maxSummaryChars: 1200, maxActionItems: 10 },
    },
    {
      key:     'graphTopology',
      label:   '3C Graph + SOM topology analysis',
      query:   'How does the Neo4j graph relate to the Qdrant vector store? What are the highest-value knowledge graph clusters and how should they drive LLM context selection?',
      domains: ['graph-db', 'rag-pipeline', 'ml-inference', 'cache'],
      budgets: { maxResearchFindings: 6, maxRetrievalHits: 8, maxAceChunks: 6, maxSummaryChars: 1000, maxActionItems: 6 },
    },
  ]),
];

for (const spec of ANALYSES) {
  console.log(`\n  ⏳ ${spec.label} …`);
  const t0 = performance.now();
  try {
    const body = {
      query:               spec.query,
      errorQuery:          spec.errorQuery,
      domains:             spec.domains,
      compactContext:      true,
      preferCachedResearch: !FORCE_FRESH,
      debug:               true,
      budgets:             spec.budgets,
    };
    const extraHeaders = FORCE_FRESH ? { 'x-bf-cache-type': 'none' } : {};
    const { res, durationMs } = await apiFetch('/api/codebase-index/claude-assist', {
      method: 'POST', body: JSON.stringify(body), headers: extraHeaders,
    });
    const ok   = res.status === 200;
    const data = ok ? await res.json() : null;
    log(ok ? 'ok' : 'fail', spec.label, `HTTP ${res.status} ${durationMs}ms`);
    if (!ok) { failCount++; report.analysis[spec.key] = { ok, status: res.status, durationMs }; continue; }

    // Print findings to console
    const r = data.research;
    if (r?.keyFindings?.length) {
      console.log('\n  Key findings:');
      r.keyFindings.slice(0, 5).forEach((f, i) => console.log(`    ${i+1}. ${f}`));
    }
    if (r?.actionItems?.length) {
      console.log('\n  Action items:');
      r.actionItems.slice(0, 5).forEach((a, i) => console.log(`    → ${a}`));
    }
    if (data.ace_context?.error_cards?.length) {
      console.log(`\n  Error cards: ${data.ace_context.error_cards.length} (top: ${data.ace_context.error_cards[0]?.errorCode ?? '?'})`);
    }
    if (data.retrieval) {
      const ret = data.retrieval;
      console.log(`  Retrieval: content=${ret.content_hits} error=${ret.error_hits} kb=${ret.kb_hits} fused=${ret.fused_hits}`);
    }
    if (data.timing) {
      console.log(`  Timing: research=${data.timing.researchMs}ms retrieval=${data.timing.retrievalMs}ms total=${data.timing.totalMs}ms`);
    }

    report.analysis[spec.key] = { ok, status: res.status, durationMs, data };
  } catch (e) {
    log('fail', spec.label, e.message);
    failCount++;
    report.analysis[spec.key] = { ok: false, error: e.message };
  }
}

report.phases.deepAnalysis = { durationMs: Math.round(performance.now() - t_deep) };

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 — Persist results
// ─────────────────────────────────────────────────────────────────────────────
sep('Phase 4 — Log results');

report.meta.completedAt  = ts();
report.meta.totalMs      = Math.round(performance.now());
report.summary.passed    = Object.values(report.analysis).filter(a => a.ok).length
                         + (lgStatusOk ? 1 : 0);
report.summary.failed    = failCount;

if (!existsSync(LOGS)) mkdirSync(LOGS, { recursive: true });
const stamp   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const jsonOut = join(LOGS, `langgraph-${stamp}.json`);
const mdOut   = join(LOGS, `langgraph-${stamp}.md`);

writeFileSync(jsonOut, JSON.stringify(report, null, 2), 'utf8');
log('ok', 'JSON report', jsonOut);

// Build markdown summary
const md = [
  `# LangGraph Pipeline Test — ${stamp}`,
  `**Base**: ${BASE}  **Completed**: ${report.meta.completedAt}`,
  '',
  `## Summary`,
  `- Passed: ${report.summary.passed}  Failed: ${report.summary.failed}`,
  '',
];

for (const [key, spec] of Object.entries(report.analysis)) {
  if (!spec.ok || !spec.data) continue;
  const { research: r, ace_context: ace, retrieval: ret, timing } = spec.data;

  const titles = {
    errorFixes:       '## 3A — Error-Fix Recommendations',
    dirConsolidation: '## 3B — Directory Consolidation Recommendations',
    graphTopology:    '## 3C — Graph & SOM Topology Analysis',
  };
  md.push(titles[key] ?? `## ${key}`, '');

  if (r?.keyFindings?.length) {
    md.push('### Key Findings');
    r.keyFindings.forEach((f, i) => md.push(`${i+1}. ${f}`));
    md.push('');
  }
  if (r?.actionItems?.length) {
    md.push('### Action Items');
    r.actionItems.forEach(a => md.push(`- [ ] ${a}`));
    md.push('');
  }
  if (ace?.error_cards?.length) {
    md.push('### Error Cards (top 5)');
    ace.error_cards.slice(0, 5).forEach(e =>
      md.push(`- **${e.errorCode ?? 'ERR'}** \`${e.file ?? ''}\` — ${(e.message ?? '').slice(0, 120)}`)
    );
    md.push('');
  }
  if (ace?.top_chunks?.length) {
    md.push('### Top Relevant Files');
    const paths = [...new Set(ace.top_chunks.map(c => c.relativePath ?? c.path ?? '').filter(Boolean))].slice(0, 8);
    paths.forEach(p => md.push(`- \`${p}\``));
    md.push('');
  }
  if (ret) {
    md.push(`### Retrieval Stats`);
    md.push(`content=${ret.content_hits} error=${ret.error_hits} kb=${ret.kb_hits} fused=${ret.fused_hits}`);
    md.push('');
  }
  if (timing) {
    md.push(`_research=${timing.researchMs}ms retrieval=${timing.retrievalMs}ms total=${timing.totalMs}ms_`);
    md.push('');
  }
}

// Endpoint test summary
md.push('## Phase 2 — Endpoint Tests');
const ep = report.phases.endpoints;
if (ep?.jsonError?.data) {
  const d = ep.jsonError.data;
  md.push(`\n### Error-patterns research (compact)`);
  md.push(`Workers: ${d.workers?.length ?? 0} | Chunks: ${d.totalChunks} | ${ep.jsonError.durationMs}ms`);
  if (d.keyFindings) d.keyFindings.slice(0, 4).forEach(f => md.push(`- ${f}`));
}
if (ep?.sse) {
  md.push(`\n### SSE stream`);
  const evtNames = ep.sse.events.map(e => e.event).join(' → ');
  md.push(`Events: ${ep.sse.events.length} [${evtNames}]  Duration: ${ep.sse.durationMs}ms`);
}

writeFileSync(mdOut, md.join('\n'), 'utf8');
log('ok', 'Markdown report', mdOut);

console.log(`\n${'═'.repeat(70)}`);
console.log(`  Result: ${failCount === 0 ? '✅ ALL PASSED' : `⚠️  ${failCount} FAILED`}   (${report.meta.totalMs}ms total)`);
console.log(`  Logs:   ${LOGS}`);
console.log(`${'═'.repeat(70)}\n`);
process.exit(failCount > 0 ? 1 : 0);