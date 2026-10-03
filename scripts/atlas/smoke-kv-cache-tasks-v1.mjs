#!/usr/bin/env node
/**
 * Read-only smoke validation for openspec/changes/parent-atlas-kv-cache-adaptation-research/tasks.md
 * (BIFROST-CODEMODE-01 / KV-PREFIX-01 section). Sends tiny chat prompts (max_tokens 8) and
 * reads Postgres counts; mutates nothing. Run from repo root: node scripts/atlas/smoke-kv-cache-tasks-v1.mjs
 * Env: BIFROST_URL (http://127.0.0.1:3040), LLAMA_URL (http://127.0.0.1:8090)
 * Output: stdout table + docs/reports/kv-cache-tasks-smoke-v1.json
 * Status language: PASS / FAIL / SKIP (SKIP = precondition down, never counted as PASS).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BF = process.env.BIFROST_URL || 'http://127.0.0.1:3040';
const LL = process.env.LLAMA_URL || 'http://127.0.0.1:8090';
const TASKS = path.join(ROOT, 'openspec/changes/parent-atlas-kv-cache-adaptation-research/tasks.md');
const results = [];
const rec = (id, status, detail) => { results.push({ id: 'SM-' + id, status, detail }); }; // SM- prefix: smoke ids never collide with tasks.md ids

async function j(url, opts = {}, ms = 120000) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}
const post = (url, body, headers = {}, ms) => j(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }, ms);
const chat = (base, model, extraHeaders = {}) => post(`${base}/v1/chat/completions`,
  { model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 8, temperature: 0, stream: false }, extraHeaders);
const pt = r => r.body?.usage?.prompt_tokens;

async function safe(id, fn) { try { await fn(); } catch (e) { rec(id, 'FAIL', `threw: ${e.message}`); } }

// ── 1. config.json (static)
await safe('CFG-01', async () => {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'docker/bifrost/config.json'), 'utf8'));
  const names = (c.mcp?.client_configs || []).map(x => x.name);
  const ok = c.mcp?.tool_manager_config?.disable_auto_tool_inject === true && names.includes('trace') && names.includes('atlas_tools');
  rec('CFG-01', ok ? 'PASS' : 'FAIL', `config.json valid; clients=${names}; disable_auto_tool_inject=${c.mcp?.tool_manager_config?.disable_auto_tool_inject}`);
});

// ── 2. Bifrost gateway
let bifrostUp = false;
await safe('BF-01', async () => {
  const h = await j(`${BF}/health`, {}, 8000); bifrostUp = h.status === 200;
  const c = await j(`${BF}/api/config`, {}, 8000);
  const live = c.body?.client_config?.mcp_disable_auto_tool_inject;
  rec('BF-01', bifrostUp && live === true ? 'PASS' : 'FAIL', `health=${h.status}; live disable_auto_tool_inject=${live}; restart_required=${JSON.stringify(c.body?.restart_required)}`);
});
let clients = [];
if (bifrostUp) await safe('BF-02', async () => {
  const r = await j(`${BF}/api/mcp/clients`, {}, 20000);
  clients = r.body?.clients || [];
  const info = clients.map(c => `${c.config.name}:${c.state}:${(c.tools || []).length}tools:codemode=${c.config.is_code_mode_client}`);
  const ok = ['trace', 'atlas_tools'].every(n => clients.some(c => c.config.name === n && c.state === 'connected'));
  rec('BF-02', ok ? 'PASS' : 'FAIL', info.join(' | '));
  // live client URL vs config.json URL (port drift check)
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docker/bifrost/config.json'), 'utf8'));
  const want = cfg.mcp.client_configs.find(x => x.name === 'atlas_tools')?.connection_string;
  const liveUrl = clients.find(c => c.config.name === 'atlas_tools')?.config?.connection_string?.value;
  rec('OPS-PORT', 'INFO', `config.json atlas_tools=${want}; live (masked)=${liveUrl}`);
});

// ── 3. Token baselines
const llamaUp = await j(`${LL}/health`, {}, 5000).then(r => r.status === 200).catch(() => false);
let direct;
if (!llamaUp) { for (const id of ['BF-03', 'BF-04', 'BF-05', 'KV-01']) rec(id, 'SKIP', 'llama-server :8090 not reachable (npm run dev:gpu starts it)'); }
else {
  await safe('BF-03', async () => {
    direct = pt(await chat(LL, 'ornith-1.5-9b'));
    if (!bifrostUp) return rec('BF-03', 'SKIP', 'bifrost down');
    const viaBf = pt(await chat(BF, 'openai/ornith-1.5-9b'));
    rec('BF-03', viaBf === direct ? 'PASS' : 'FAIL', `direct=${direct} bifrost_default=${viaBf} (must be equal: no auto-injection)`);
  });
  if (bifrostUp) await safe('BF-04', async () => {
    const a = pt(await chat(BF, 'openai/ornith-1.5-9b', { 'x-bf-mcp-include-clients': 'atlas_tools' }));
    const t = pt(await chat(BF, 'openai/ornith-1.5-9b', { 'x-bf-mcp-include-clients': 'trace' }));
    const okA = a > direct && a < 5000, okT = t > direct && t < 6000;
    rec('BF-04', okA && okT ? 'PASS' : 'FAIL', `opt-in atlas_tools=${a} (expect >${direct}, <5000); opt-in trace code-mode=${t} (expect <6000; conventional TRACE was ~35,000)`);
  });
  // KV reuse
  await safe('KV-01', async () => {
    const SYS = 'You are a code analysis assistant. ' + Array.from({ length: 120 }, (_, i) => `Rule ${i}: cite sourceRef and packet_key for every claim.`).join(' ');
    const q = t => post(`${LL}/v1/chat/completions`, { model: 'ornith-1.5-9b', messages: [{ role: 'system', content: '[' + salt + '] ' + SYS }, { role: 'user', content: t }], max_tokens: 4, temperature: 0, stream: false, cache_prompt: true }, {}, 300000);
    var salt = Date.now(); // unique prefix so #1 is genuinely cold
    const r1 = await q('What is ACE?'); const r2 = await q('What is ACE?'); const r3 = await q('What is a packet?');
    const f = r => ({ n: r.body.usage.prompt_tokens, cache: r.body.timings?.cache_n, ms: Math.round(r.body.timings?.prompt_ms) });
    const a = f(r1), b = f(r2), c = f(r3);
    const okB = b.cache / b.n >= 0.9, okC = c.cache / c.n >= 0.5;
    rec('KV-01', okB && okC ? 'PASS' : 'FAIL', `cold ${JSON.stringify(a)} | identical ${JSON.stringify(b)} (reuse ${(100 * b.cache / b.n).toFixed(1)}%) | new suffix ${JSON.stringify(c)} (reuse ${(100 * c.cache / c.n).toFixed(1)}%)`);
  });
}

// ── 4. Bifrost /mcp gateway (no LLM needed)
if (bifrostUp) await safe('BF-05', async () => {
  const H = { Accept: 'application/json, text/event-stream' };
  const init = await post(`${BF}/mcp`, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } } }, H, 20000);
  const list = await post(`${BF}/mcp`, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, H, 30000);
  const names = (list.body?.result?.tools || []).map(t => t.name);
  const hasWrite = names.includes('atlas_tools-record_outcome');
  rec('BF-05', init.status === 200 && names.length > 0 && !hasWrite ? 'PASS' : 'FAIL', `initialize=${init.status}; tools/list=${names.length}; record_outcome_exposed=${hasWrite}`);
  const call = await post(`${BF}/mcp`, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'atlas_tools-classify_intent', arguments: { prompt: 'where is the bifrost cache invalidated' } } }, H, 60000);
  rec('BF-06', call.body?.result?.content?.[0]?.text ? 'PASS' : 'FAIL', `tools/call classify_intent -> ${JSON.stringify(call.body?.result?.content?.[0]?.text || call.body).slice(0, 120)}`);
});

// ── 5. Postgres + registry claims
await safe('ACE-01', async () => {
  const q = "select (select count(*) from ace_context_packets)||','||(select count(*) from ace_chunks)";
  const out = execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-Atc', q], { encoding: 'utf8', timeout: 30000 }).trim();
  rec('ACE-01', 'INFO', `ace_context_packets,ace_chunks rows = ${out} (claim in tasks.md: 0,0)`);
});
await safe('REG-01', async () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/architecture/runtime-ownership-registry.json'), 'utf8')).capabilities;
  const cls = k => reg[k]?.owner?.classification ?? reg[k]?.canonicalOwner?.classification;
  const ok = cls('symbol_identity') === 'UNKNOWN' && cls('semantic_768') === 'UNKNOWN';
  rec('REG-01', ok ? 'PASS' : 'FAIL', `symbol_identity=${cls('symbol_identity')} semantic_768=${cls('semantic_768')} (tasks.md ID-01 says both UNKNOWN)`);
});
await safe('SKILL-01', async () => {
  rec('SKILL-01', fs.existsSync(path.join(ROOT, '.claude/skills/parent-atlas-workstation/SKILL.md')) ? 'PASS' : 'FAIL', 'parent-atlas-workstation skill file present (loadability not tested)');
});

// ── 6. tasks.md checkbox census (counts; NOT verified progress)
const md = fs.readFileSync(TASKS, 'utf8').split('\n');
const sections = []; let cur = { name: '(preamble)', done: 0, open: 0 };
for (const line of md) {
  const h = line.match(/^#{2,3}\s+(.*)/);
  if (h) { sections.push(cur); cur = { name: h[1].slice(0, 90), done: 0, open: 0 }; }
  if (/^\s*[-*]\s+\[[xX]\]/.test(line)) cur.done++; else if (/^\s*[-*]\s+\[ \]/.test(line)) cur.open++;
}
sections.push(cur);
const live = sections.filter(s => s.done + s.open > 0);
const totD = live.reduce((a, s) => a + s.done, 0), totO = live.reduce((a, s) => a + s.open, 0);
const startIdx = md.findIndex(l => l.startsWith('## BIFROST-CODEMODE-01'));
const mine = startIdx < 0 ? [] : md.slice(startIdx);
const sessDone = mine.filter(l => /^\s*[-*]\s+\[[xX]\]/.test(l)).length;
const sessOpen = mine.filter(l => /^\s*[-*]\s+\[ \]/.test(l)).length;

const counts = results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
const verifiable = (counts.PASS || 0) + (counts.FAIL || 0);
const receipt = {
  schema: 'kv-cache-tasks-smoke-v1', at: new Date().toISOString(), tasksFile: path.relative(ROOT, TASKS),
  smoke: { counts, passOfVerifiable: `${counts.PASS || 0}/${verifiable}`, results },
  checkboxCensus: {
    file: { done: totD, open: totO, total: totD + totO, pctChecked: totD + totO ? +(100 * totD / (totD + totO)).toFixed(1) : null },
    thisSession: { section: 'from "## BIFROST-CODEMODE-01" to EOF', done: sessDone, open: sessOpen, pctChecked: sessDone + sessOpen ? +(100 * sessDone / (sessDone + sessOpen)).toFixed(1) : null },
    caveat: 'Checkbox ratio counts ticked boxes only; it is not verified progress. The smoke block above is the verified evidence.',
  },
};
fs.writeFileSync(path.join(ROOT, 'docs/reports/kv-cache-tasks-smoke-v1.json'), JSON.stringify(receipt, null, 2));
console.log('\n' + results.map(r => `${r.status.padEnd(5)} ${r.id.padEnd(9)} ${r.detail}`).join('\n'));
console.log(`\nSMOKE: ${JSON.stringify(counts)}  PASS/(PASS+FAIL) = ${receipt.smoke.passOfVerifiable}`);
console.log(`CHECKBOXES (whole file): ${totD} done / ${totO} open / ${totD + totO} total = ${receipt.checkboxCensus.file.pctChecked}% ticked`);
console.log(`CHECKBOXES (this session's sections): ${sessDone} done / ${sessOpen} open = ${receipt.checkboxCensus.thisSession.pctChecked}% ticked`);
process.exit((counts.FAIL || 0) > 0 ? 1 : 0);
