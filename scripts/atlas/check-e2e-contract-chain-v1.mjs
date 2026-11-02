#!/usr/bin/env node
/**
 * check-e2e-contract-chain-v1.mjs  (READ-ONLY)
 *
 * End-to-end contract check across the live surfaces. Composes existing owners;
 * it adds no peer owner and writes no datastore. Stages:
 *   startup  VS Code startup gates: MCP initialize, endpoint consistency, folderOpen hygiene
 *   trace    TRACE MCP :8788 tools/list + required tools
 *   db       db.schema_overview / db.table_inspect vs Drizzle declared columns
 *   parity   Zod (TRACE tool inputSchema) vs Pydantic (:8095 /openapi.json) + same-schema-id source diff
 *   sidecar  :8095 /analyze round trip validated against OpenAPI AnalyzeResponse
 *   fix      error-fixing tools: contract + ops.validate_tool_call (positive and negative)
 *   kanban   /api/admin/atlas/kanban-tickets response shape
 *   acp      /api/acp/tools shape
 *   a2a      /.well-known/agent.json shape and skill/ACP cross-reference
 *   helpers  AFC-SCHED helper tools (summary-priority matrix describe + invariants)
 *   dag      DAG / prefill entry points (honest NOT_WIRED when no read-only entry exists)
 *
 * Status per check: PASS | FAIL | WARN | NULL (could not run; reason recorded, never counts as PASS).
 * Exit 1 when any FAIL. Receipt: .tmp/atlas/e2e-contract-chain-receipt-v1.json
 *
 * Usage: node scripts/atlas/check-e2e-contract-chain-v1.mjs [--stage=a,b] [--json]
 * Env:   TRACE_MCP_URL (default http://127.0.0.1:8788), APP_BASE (http://127.0.0.1:5173),
 *        NLP_URL (http://127.0.0.1:8095), DECODER_URL (http://127.0.0.1:8121)
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FE = path.join(ROOT, 'sveltekit-frontend');
const TRACE = (process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788').replace(/\/$/, '');
const APP = (process.env.APP_BASE ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const NLP = (process.env.NLP_URL ?? 'http://127.0.0.1:8095').replace(/\/$/, '');
const DECODER = (process.env.DECODER_URL ?? 'http://127.0.0.1:8121').replace(/\/$/, '');
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--stage=')) ?? '').slice(8).split(',').filter(Boolean);
const asJson = args.includes('--json');

const results = [];
function rec(stage, name, status, detail = '') {
  results.push({ stage, name, status, detail: String(detail).slice(0, 400) });
  if (!asJson) console.log(`  ${status.padEnd(4)} [${stage}] ${name}${detail ? ' — ' + String(detail).slice(0, 200) : ''}`);
}
const want = (s) => only.length === 0 || only.includes(s);

async function http(url, init = {}, timeoutMs = 20000) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { ok: res.ok, status: res.status, text, json };
}

let rpcId = 0;
async function mcp(method, params = {}) {
  const r = await http(`${TRACE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  }, 60000);
  const line = r.text.split('\n').find((l) => l.startsWith('data: '));
  const body = line ? JSON.parse(line.slice(6)) : r.json;
  if (!body) throw new Error(`MCP ${method}: HTTP ${r.status} non-JSON`);
  if (body.error) throw new Error(`MCP ${method}: ${body.error.message ?? JSON.stringify(body.error)}`);
  return body.result;
}
async function callTool(name, argumentsObj) {
  const result = await mcp('tools/call', { name, arguments: argumentsObj });
  const text = result?.content?.find((c) => c.type === 'text')?.text ?? '';
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* plain text */ }
  return { isError: result?.isError === true, text, json: parsed };
}

const propNames = (schema) => Object.keys(schema?.properties ?? {}).sort();
const requiredOf = (schema) => [...(schema?.required ?? [])].sort();
const diff = (a, b) => ({ onlyA: a.filter((x) => !b.includes(x)), onlyB: b.filter((x) => !a.includes(x)) });

let tools = [];

// ── trace ────────────────────────────────────────────────────────────────────
async function stageTrace() {
  try {
    const res = await mcp('tools/list');
    tools = res.tools ?? [];
    rec('trace', 'tools/list responds', tools.length > 0 ? 'PASS' : 'FAIL', `${tools.length} tools`);
    for (const n of ['db.schema_overview', 'db.table_inspect', 'kag.recall_similar_fix', 'ops.validate_tool_call',
      'ops.inspect_tool_contract', 'ops.propose_patch', 'miniforge.health', 'miniforge.analyze', 'miniforge.extract', 'domain.classify']) {
      rec('trace', `tool registered: ${n}`, tools.some((t) => t.name === n) ? 'PASS' : 'FAIL');
    }
    const noSchema = tools.filter((t) => !t.inputSchema || typeof t.inputSchema !== 'object').map((t) => t.name);
    rec('trace', 'every tool has an inputSchema', noSchema.length === 0 ? 'PASS' : 'FAIL', noSchema.slice(0, 5).join(', '));
  } catch (e) {
    rec('trace', 'TRACE reachable', 'FAIL', e.message);
  }
}

// ── db ───────────────────────────────────────────────────────────────────────
const DB_TABLES = ['atlas_packets', 'codebase_chunk_index', 'error_logs'];
function drizzleColumns(tables) {
  const loader = pathToFileURL(path.join(FE, 'scripts', 'node-ts-loader.mjs')).href;
  const schemaUrl = pathToFileURL(path.join(FE, 'src', 'lib', 'server', 'db', 'schema-postgres.ts')).href;
  const code = `
    const { getTableColumns, getTableName, is } = await import('drizzle-orm');
    const { PgTable } = await import('drizzle-orm/pg-core');
    const s = await import(${JSON.stringify(schemaUrl)});
    const want = new Set(${JSON.stringify(tables)});
    const out = {};
    for (const v of Object.values(s)) {
      if (v && typeof v === 'object' && is(v, PgTable)) {
        const n = getTableName(v);
        if (want.has(n)) out[n] = Object.values(getTableColumns(v)).map((c) => c.name);
      }
    }
    console.log('@@JSON@@' + JSON.stringify(out));`;
  const r = spawnSync(process.execPath, ['--no-warnings', '--loader', loader, '--input-type=module', '-e', code],
    { cwd: FE, encoding: 'utf8', timeout: 90000 });
  const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('@@JSON@@'));
  if (!line) throw new Error(`drizzle introspection failed: ${(r.stderr ?? '').split('\n').find((l) => l.trim()) ?? 'no output'}`);
  return JSON.parse(line.slice(8));
}
async function stageDb() {
  try {
    const ov = await callTool('db.schema_overview', {});
    rec('db', 'db.schema_overview', ov.isError ? 'FAIL' : 'PASS', ov.isError ? ov.text : `${ov.text.length} bytes`);
  } catch (e) { rec('db', 'db.schema_overview', 'FAIL', e.message); }
  let declared = null;
  try { declared = drizzleColumns(DB_TABLES); } catch (e) { rec('db', 'Drizzle declared columns', 'NULL', e.message); }
  for (const t of DB_TABLES) {
    try {
      const r = await callTool('db.table_inspect', { table: t });
      const live = (r.json?.columns ?? []).map((c) => c.name);
      if (r.isError || live.length === 0) { rec('db', `live table ${t}`, 'FAIL', r.text.slice(0, 160)); continue; }
      rec('db', `live table ${t}`, 'PASS', `${live.length} columns`);
      if (declared?.[t]) {
        const d = diff(declared[t], live);
        rec('db', `Drizzle ↔ live ${t}`, d.onlyA.length || d.onlyB.length ? 'WARN' : 'PASS',
          `declared-only: [${d.onlyA.join(',')}] live-only: [${d.onlyB.join(',')}]`);
      } else if (declared) {
        rec('db', `Drizzle ↔ live ${t}`, 'NULL', 'table not exported by schema-postgres.ts');
      }
    } catch (e) { rec('db', `live table ${t}`, 'FAIL', e.message); }
  }
}

// ── parity ───────────────────────────────────────────────────────────────────
function pyFieldNames(file, cls) {
  const src = readFileSync(file, 'utf8');
  const m = src.match(new RegExp(`class ${cls}\\([^)]*\\):([\\s\\S]*?)(?=\\nclass |$)`));
  if (!m) return null;
  return [...m[1].matchAll(/^    ([a-z_][a-z0-9_]*)\s*:/gm)].map((x) => x[1]).filter((n) => n !== 'model_config');
}
function zodKeys(file, constName) {
  const src = readFileSync(file, 'utf8');
  const m = src.match(new RegExp(`const ${constName}\\s*=\\s*z\\s*\\.object\\(\\{([\\s\\S]*?)\\n\\}\\)`));
  if (!m) return null;
  return [...m[1].matchAll(/^  ([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)].map((x) => x[1]);
}
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const snakeKey = (s) => s.replace(/_$/, '');
async function stageParity() {
  let openapi = null;
  try { openapi = (await http(`${NLP}/openapi.json`)).json; } catch (e) { rec('parity', ':8095 /openapi.json', 'NULL', e.message); }
  if (openapi) {
    const schemas = openapi.components?.schemas ?? {};
    rec('parity', ':8095 OpenAPI schemas', 'PASS', `${Object.keys(schemas).length} Pydantic models`);
    const pairs = [['miniforge.analyze', 'AnalyzeRequest'], ['miniforge.extract', 'AnalyzeRequest']];
    for (const [tool, model] of pairs) {
      const t = tools.find((x) => x.name === tool);
      if (!t || !schemas[model]) { rec('parity', `${tool} ↔ ${model}`, 'NULL', !t ? 'tool not listed (run trace stage)' : 'model missing'); continue; }
      // Tool args are camelCase, Pydantic fields snake_case: compare on the camelCase form.
      const z = propNames(t.inputSchema).map(camel), p = propNames(schemas[model]).map(camel);
      const d = diff(z, p);
      const reqZ = requiredOf(t.inputSchema).map(camel), reqP = requiredOf(schemas[model]).map(camel);
      const unsatisfied = reqP.filter((r) => !z.includes(r));
      rec('parity', `${tool} ↔ ${model}`, unsatisfied.length ? 'FAIL' : (d.onlyA.length || d.onlyB.length ? 'WARN' : 'PASS'),
        `tool-only: [${d.onlyA.join(',')}] pydantic-only: [${d.onlyB.join(',')}] pydantic-required-not-in-tool: [${unsatisfied.join(',')}] (required tool=[${reqZ}] py=[${reqP}])`);
    }
  }
  // A schema id declared in both runtimes must carry the same fields; distinct ids are a resolved collision.
  const tsFile = path.join(ROOT, 'packages/parent-atlas/src/core/parameter-artifact-v1.ts');
  const pyFile = path.join(ROOT, 'docker/langgraph-synthesis/research_contracts.py');
  const pyClass = ['ResearchParameterArtifactV1', 'ParameterArtifactV1'].find((c) => new RegExp(`^class ${c}\\b`, 'm').test(readFileSync(pyFile, 'utf8')));
  try {
    const tsSrc = readFileSync(tsFile, 'utf8');
    const tsId = (tsSrc.match(/schema:\s*z\.literal\('([^']+)'\)/) ?? [])[1];
    const pySrc = readFileSync(pyFile, 'utf8');
    const body = pyClass ? (pySrc.match(new RegExp(`class ${pyClass}\\([^)]*\\):([\\s\\S]*?)(?=\\nclass |\\n[A-Za-z_]+ = |$)`)) ?? [])[1] : null;
    const pyId = body ? (body.match(/default="(atlas\.[^"]+)"/) ?? [])[1] : null;
    if (!tsId || !pyId) { rec('parity', 'parameter-artifact schema ids', 'NULL', `could not extract ids (ts=${tsId} py=${pyId} class=${pyClass})`); }
    else if (tsId !== pyId) {
      rec('parity', 'parameter-artifact schema ids are distinct (collision resolved)', 'PASS', `ts=${tsId} py=${pyId} (${pyClass})`);
    } else {
      const z = zodKeys(tsFile, 'parameterArtifactV1Schema'), y = pyFieldNames(pyFile, pyClass);
      if (!z || !y) { rec('parity', `schema id ${tsId}`, 'NULL', 'same id in both runtimes but fields could not be extracted'); }
      else {
        const d = diff(z.map(snakeKey).sort(), y.map(snakeKey).map(camel).sort());
        rec('parity', `schema id ${tsId} (Zod ↔ Pydantic)`, d.onlyA.length || d.onlyB.length ? 'FAIL' : 'PASS', `zod-only: [${d.onlyA.join(',')}] pydantic-only: [${d.onlyB.join(',')}]`);
      }
    }
    const loose = [...pySrc.matchAll(/^[ ]+(canonical_authority|writes_performed):[ ]*bool(?![A-Za-z_])/gm)].length;
    rec('parity', 'Python contracts pin authority flags to Literal[False]', loose ? 'WARN' : 'PASS', loose ? `${loose} flag(s) typed bool (e.g. WebSearchEnvelopeV1)` : '');
  } catch (e) { rec('parity', 'parameter-artifact schema ids', 'NULL', e.message); }
}

// ── sidecar ──────────────────────────────────────────────────────────────────
async function stageSidecar() {
  try {
    const h = await http(`${NLP}/health`);
    rec('sidecar', ':8095 /health', h.ok ? 'PASS' : 'FAIL', h.text.slice(0, 120));
    const body = { text: 'The Defendant appeared before the Court of Appeals on March 3, 2021.', source_type: 'plain_text', extraction_mode: 'entities' };
    const r = await http(`${NLP}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 60000);
    if (!r.ok || !r.json) { rec('sidecar', '/analyze round trip', 'FAIL', `HTTP ${r.status} ${r.text.slice(0, 120)}`); return; }
    const spec = (await http(`${NLP}/openapi.json`)).json?.components?.schemas?.AnalyzeResponse;
    const required = requiredOf(spec);
    const missing = required.filter((k) => !(k in r.json));
    rec('sidecar', '/analyze response vs AnalyzeResponse', missing.length ? 'FAIL' : 'PASS', `required=[${required}] missing=[${missing}]`);
    const extra = Object.keys(r.json).filter((k) => !(k in (spec?.properties ?? {})));
    rec('sidecar', '/analyze undeclared response keys', extra.length ? 'WARN' : 'PASS', extra.join(','));
    // Same call through the TRACE tool (Zod boundary) to confirm the MCP path agrees.
    const viaTool = await callTool('miniforge.analyze', { text: body.text });
    rec('sidecar', 'miniforge.analyze via TRACE', viaTool.isError ? 'FAIL' : 'PASS', viaTool.isError ? viaTool.text.slice(0, 160) : `${viaTool.text.length} bytes`);
  } catch (e) { rec('sidecar', ':8095 sidecar', 'FAIL', e.message); }
}

// ── fix (agentic error fixing; no writes) ────────────────────────────────────
async function stageFix() {
  try {
    const c = await callTool('ops.inspect_tool_contract', { tool_name: 'ops.propose_patch' });
    rec('fix', 'ops.inspect_tool_contract(ops.propose_patch)', c.isError ? 'FAIL' : 'PASS', c.text.slice(0, 160));
    // validate_tool_call is contract-based: a tool with no registered contract is rejected as TOOL_CONTRACT_UNKNOWN.
    const verdict = async (tool_name, argumentsObj) => {
      const v = await callTool('ops.validate_tool_call', { tool_name, arguments: argumentsObj });
      return { ok: v.json?.ok === true, state: v.json?.state ?? 'UNPARSED', reasons: v.json?.reason_codes ?? [], text: v.text };
    };
    const recallV = await verdict('kag.recall_similar_fix', { errorText: 'TypeError: x is undefined', limit: 3 });
    rec('fix', 'kag.recall_similar_fix has a validation contract',
      recallV.reasons.includes('TOOL_CONTRACT_UNKNOWN') ? 'WARN' : (recallV.ok ? 'PASS' : 'FAIL'),
      `${recallV.state} ${recallV.reasons.join(',')}`);
    const badV = await verdict('ops.propose_patch', { not_a_real_field: 1 });
    rec('fix', 'validate_tool_call rejects an invalid ops.propose_patch call',
      !badV.ok && !badV.reasons.includes('TOOL_CONTRACT_UNKNOWN') ? 'PASS' : 'FAIL', `${badV.state} ${badV.reasons.join(',')}`);
    const recall = await callTool('kag.recall_similar_fix', { errorText: 'TypeError: Cannot read properties of undefined', limit: 3 });
    rec('fix', 'kag.recall_similar_fix (read-only)', recall.isError ? 'FAIL' : 'PASS', recall.text.slice(0, 120));
  } catch (e) { rec('fix', 'error-fixing tools', 'FAIL', e.message); }
}

// ── kanban ───────────────────────────────────────────────────────────────────
async function stageKanban() {
  try {
    const r = await http(`${APP}/api/admin/atlas/kanban-tickets?limit=5`);
    if (!r.json) { rec('kanban', 'kanban-tickets JSON', 'FAIL', `HTTP ${r.status}`); return; }
    const keys = ['ok', 'tasks', 'total', 'events', 'canonicalAuthority'];
    const missing = keys.filter((k) => !(k in r.json));
    rec('kanban', 'degraded-shape contract (same top-level keys)', missing.length ? 'FAIL' : 'PASS', `missing=[${missing}]`);
    rec('kanban', 'GET reports ok:true', r.json.ok === true ? 'PASS' : 'FAIL',
      r.json.ok === true ? `${r.json.total} tasks` : String(r.json.error ?? '').replace(/\s+/g, ' ').slice(0, 220));
    rec('kanban', 'canonicalAuthority is false', r.json.canonicalAuthority === false ? 'PASS' : 'FAIL');
  } catch (e) { rec('kanban', 'kanban-tickets', 'FAIL', e.message); }
}

// ── acp ──────────────────────────────────────────────────────────────────────
let acpTools = [];
async function stageAcp() {
  try {
    const r = await http(`${APP}/api/acp/tools`);
    acpTools = r.json?.tools ?? [];
    rec('acp', '/api/acp/tools', r.ok && r.json?.success === true && acpTools.length ? 'PASS' : 'FAIL', `${acpTools.length} tools`);
    const bad = acpTools.filter((t) => !t.name || !t.description || typeof t.inputSchema !== 'object').map((t) => t.name ?? '?');
    rec('acp', 'each tool has name/description/inputSchema', bad.length ? 'FAIL' : 'PASS', bad.slice(0, 5).join(','));
    const dup = acpTools.map((t) => t.name).filter((n, i, a) => a.indexOf(n) !== i);
    rec('acp', 'tool names are unique', dup.length ? 'FAIL' : 'PASS', dup.join(','));
    rec('acp', 'dry-run support declared', 'PASS', `${acpTools.filter((t) => t.supportsDryRun).length}/${acpTools.length} support dry-run`);
  } catch (e) { rec('acp', '/api/acp/tools', 'FAIL', e.message); }
}

// ── a2a ──────────────────────────────────────────────────────────────────────
async function stageA2a() {
  try {
    const r = await http(`${APP}/.well-known/agent.json`);
    const c = r.json;
    if (!c) { rec('a2a', 'agent.json JSON', 'FAIL', `HTTP ${r.status}`); return; }
    const missing = ['name', 'description', 'url', 'version', 'capabilities', 'skills', 'defaultInputModes', 'defaultOutputModes'].filter((k) => !(k in c));
    rec('a2a', 'agent card required fields', missing.length ? 'FAIL' : 'PASS', `missing=[${missing}]`);
    const skills = Array.isArray(c.skills) ? c.skills : [];
    const badSkills = skills.filter((s) => !s.id || !s.name || !s.description).map((s) => s.id ?? '?');
    rec('a2a', 'skills have id/name/description', badSkills.length ? 'FAIL' : 'PASS', `${skills.length} skills ${badSkills.join(',')}`);
    try {
      const u = new URL(c.url);
      const reach = await http(c.url, {}, 8000).catch(() => null);
      rec('a2a', 'card url is reachable', reach ? 'PASS' : 'WARN', `${u.origin}${reach ? ` HTTP ${reach.status}` : ' unreachable'}`);
    } catch { rec('a2a', 'card url parses', 'FAIL', String(c.url)); }
    if (acpTools.length) {
      const acpNames = new Set(acpTools.map((t) => t.name));
      const unmatched = skills.filter((s) => !acpNames.has(s.id) && !tools.some((t) => t.name === s.id)).map((s) => s.id);
      rec('a2a', 'skill ids resolve to ACP or TRACE tools', unmatched.length ? 'WARN' : 'PASS', `unmatched=[${unmatched}]`);
    } else rec('a2a', 'skill ↔ ACP cross-reference', 'NULL', 'acp stage did not run');
  } catch (e) { rec('a2a', 'agent.json', 'FAIL', e.message); }
}

// ── dag / prefill ────────────────────────────────────────────────────────────
async function stageDag() {
  try {
    const h = await http(`${DECODER}/health`, {}, 8000);
    rec('dag', 'neural decoder :8121 /health (prefill encoder)', h.ok ? 'PASS' : 'WARN', h.text.slice(0, 100));
  } catch (e) { rec('dag', 'neural decoder :8121', 'NULL', e.message); }
  const dagTools = tools.filter((t) => /dag/i.test(t.name)).map((t) => t.name);
  rec('dag', 'TRACE DAG tool registered', dagTools.length ? 'PASS' : 'WARN', dagTools.join(',') || 'NOT_WIRED');
  const prefillTools = tools.filter((t) => /prefill/i.test(t.name)).map((t) => t.name);
  rec('dag', 'TRACE prefill tool registered', prefillTools.length ? 'PASS' : 'WARN',
    prefillTools.join(',') || 'NOT_WIRED: no prefill tool in TRACE; the prefill caller is library code (PREFILL-CALLER-01), exercised only via :8121 encode');
  for (const f of ['sveltekit-frontend/src/lib/server/atlas/agentic/agent-control-plane-v1.ts',
    'sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/context-prefix-identity-v1.ts']) {
    rec('dag', `owner file exists: ${path.basename(f)}`, existsSync(path.join(ROOT, f)) ? 'PASS' : 'FAIL');
  }
}

// ── startup (VS Code folderOpen hygiene + MCP readiness) ─────────────────────
function stripJsonc(text) { return text.replace(/^\s*\/\/.*$/gm, ''); }
async function stageStartup() {
  // 1. Real MCP initialize (an HTTP-healthy process is not proof a client can open a session).
  try {
    const init = await mcp('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'e2e-startup-gate', version: '1' } });
    rec('startup', 'MCP initialize at configured endpoint', init?.serverInfo?.name ? 'PASS' : 'FAIL', `${TRACE} -> ${init?.serverInfo?.name}`);
  } catch (e) { rec('startup', 'MCP initialize at configured endpoint', 'FAIL', e.message); }

  // 2. Every client configuration points at the same host:port.
  const endpoints = {};
  try { const m = readFileSync(path.join(FE, '.env'), 'utf8').match(/^TRACE_MCP_URL=(\S+)/m); if (m) endpoints['.env TRACE_MCP_URL'] = m[1]; } catch { /* absent */ }
  try { endpoints['.mcp.json trace'] = JSON.parse(readFileSync(path.join(ROOT, '.mcp.json'), 'utf8')).mcpServers?.trace?.url; } catch { /* absent */ }
  try {
    const oc = readFileSync(path.join(ROOT, '.opencode', 'opencode.jsonc'), 'utf8');
    const m = oc.match(/"trace"\s*:\s*\{[^}]*?"url"\s*:\s*"([^"]+)"/);
    if (m) endpoints['.opencode/opencode.jsonc trace'] = m[1];
  } catch { /* absent */ }
  const hostPort = (u) => {
    try { const x = new URL(u); return `${x.hostname === 'localhost' ? '127.0.0.1' : x.hostname}:${x.port}`; } catch { return String(u); }
  };
  const distinct = [...new Set(Object.values(endpoints).filter(Boolean).map(hostPort))];
  rec('startup', 'TRACE endpoint consistent across .env / .mcp.json / OpenCode', distinct.length === 1 ? 'PASS' : 'FAIL',
    Object.entries(endpoints).map(([k, v]) => `${k}=${v}`).join(' | '));
  rec('startup', 'TRACE bound to IPv4 loopback only', /^127\.0\.0\.1:\d+$/.test(distinct[0] ?? '') ? 'PASS' : 'WARN', distinct[0] ?? 'unknown');

  // 3. tasks.json folderOpen hygiene.
  try {
    const tj = JSON.parse(stripJsonc(readFileSync(path.join(ROOT, '.vscode', 'tasks.json'), 'utf8')));
    const open = tj.tasks.filter((t) => t.runOptions?.runOn === 'folderOpen');
    const openLabels = new Set(open.map((t) => t.label));
    const cmd = (t) => `${t.command ?? ''} ${(t.args ?? []).join(' ')}`;

    const dry = open.filter((t) => /:dry\b|--dry-run/.test(cmd(t)) && !/graphify:daily:dry/.test(cmd(t))).map((t) => t.label);
    rec('startup', 'no dry-run task runs at folderOpen', dry.length ? 'FAIL' : 'PASS', dry.join(' | '));

    const orphanDeps = open.flatMap((t) => [].concat(t.dependsOn ?? []).filter((d) => !openLabels.has(d)).map((d) => `${t.label} -> ${d}`));
    rec('startup', 'every folderOpen dependsOn target is itself a folderOpen task', orphanDeps.length ? 'FAIL' : 'PASS', orphanDeps.join(' | '));

    // Key on script + first argument: generic launchers (run-detached.mjs) are reused with different targets.
    const scriptOf = (t) => (cmd(t).match(/scripts[\\/\w.-]*\.(?:mjs|ps1|mts)(?:\s+[\w:.-]+)?/) ?? [])[0];
    const byScript = {};
    for (const t of open) { const sc = scriptOf(t); if (sc) (byScript[sc] ??= []).push(t.label); }
    const dupes = Object.entries(byScript).filter(([, labels]) => labels.length > 1).map(([sc, labels]) => `${sc}: ${labels.length}x`);
    rec('startup', 'no script is started twice at folderOpen', dupes.length ? 'FAIL' : 'PASS', dupes.join(' | '));

    const silentSkip = open.filter((t) => /skipped\s*[—-][^;'"]*(down|missing|not running)/i.test(cmd(t)) && !/BLOCKED/.test(cmd(t))).map((t) => t.label);
    rec('startup', 'prerequisite-missing paths say BLOCKED (never a silent skip)', silentSkip.length ? 'FAIL' : 'PASS', silentSkip.join(' | '));

    const mutating = open.filter((t) => /--apply|backfill|embedding:batch|promote/i.test(`${cmd(t)} ${t.label}`)).map((t) => t.label);
    rec('startup', 'folderOpen tasks that may write state (review)', mutating.length ? 'WARN' : 'PASS', mutating.join(' | '));
  } catch (e) { rec('startup', '.vscode/tasks.json', 'NULL', e.message); }
}

// ── helpers (AFC-SCHED tools) ────────────────────────────────────────────────
async function stageHelpers() {
  const name = 'atlas.summary_priority_matrix_describe';
  try {
    if (!tools.length) tools = (await mcp('tools/list')).tools ?? [];
    rec('helpers', `tool registered: ${name}`, tools.some((t) => t.name === name) ? 'PASS' : 'FAIL');
    const r = await callTool(name, { verify_checksums: true });
    if (r.isError || !r.json) { rec('helpers', `${name} call`, 'FAIL', r.text.slice(0, 160)); return; }
    if (r.json.state === 'MATRIX_NOT_BUILT') { rec('helpers', 'matrix built', 'NULL', 'run scripts/atlas/build-summary-priority-matrix-v1.mjs'); return; }
    rec('helpers', 'matrix raw files match descriptor checksums', r.json.ok === true ? 'PASS' : 'FAIL', JSON.stringify(r.json.verification));
    const d = r.json.descriptor ?? {};
    const cols = d.columns ?? [];
    rec('helpers', 'shape[1] equals column count', d.shape?.[1] === cols.length ? 'PASS' : 'FAIL', `shape=${JSON.stringify(d.shape)} columns=${cols.length}`);
    const ids = cols.map((c) => c.columnId);
    const sequential = ids.every((id, i) => id === `SPM_${String(i + 1).padStart(3, '0')}`);
    rec('helpers', 'column ids are unique and sequential (append-only registry)', new Set(ids).size === ids.length && sequential ? 'PASS' : 'FAIL', ids.join(','));
    rec('helpers', 'advisory flags (canonicalAuthority:false, writesPerformed:false)', d.canonicalAuthority === false && d.writesPerformed === false ? 'PASS' : 'FAIL');
    const dead = cols.filter((c) => c.observedFraction === 0).map((c) => c.columnId);
    rec('helpers', 'columns with no observed values', dead.length ? 'WARN' : 'PASS', dead.join(','));
    const sparse = cols.filter((c) => c.observedFraction > 0 && c.observedFraction < 0.1).map((c) => `${c.columnId}=${c.observedFraction}`);
    rec('helpers', 'sparse columns (<10% observed)', sparse.length ? 'WARN' : 'PASS', sparse.join(','));
    rec('helpers', 'matrix status', d.status === 'DRAFT_NOT_CANONICAL' ? 'WARN' : 'PASS', `${d.status}; blockers=${(d.blockers ?? []).length}; tokenRemap=${d.tokenRemap?.status}`);
  } catch (e) { rec('helpers', 'helpers stage', 'FAIL', e.message); }
}

const STAGES = { helpers: stageHelpers, startup: stageStartup, trace: stageTrace, db: stageDb, parity: stageParity, sidecar: stageSidecar, fix: stageFix, kanban: stageKanban, acp: stageAcp, a2a: stageA2a, dag: stageDag };
if (!asJson) console.log('=== E2E contract chain (read-only) ===');
// Stages that read the tool list / ACP list need those first even when filtered.
if (!want('trace') && (want('parity') || want('a2a') || want('dag'))) {
  try { tools = (await mcp('tools/list')).tools ?? []; } catch { /* reported by the stage itself */ }
}
if (!want('acp') && want('a2a')) {
  try { acpTools = (await http(`${APP}/api/acp/tools`)).json?.tools ?? []; } catch { /* a2a reports NULL */ }
}
for (const [name, fn] of Object.entries(STAGES)) {
  if (!want(name)) continue;
  try { await fn(); } catch (e) { rec(name, 'stage crashed', 'FAIL', e.message); }
}

const count = (s) => results.filter((r) => r.status === s).length;
const summary = { pass: count('PASS'), warn: count('WARN'), fail: count('FAIL'), null: count('NULL') };
const receipt = { schema: 'atlas.e2e-contract-chain-receipt.v1', generatedAt: new Date().toISOString(), canonicalAuthority: false, writesPerformed: false, summary, results };
mkdirSync(path.join(ROOT, '.tmp', 'atlas'), { recursive: true });
writeFileSync(path.join(ROOT, '.tmp', 'atlas', 'e2e-contract-chain-receipt-v1.json'), JSON.stringify(receipt, null, 2));
if (asJson) console.log(JSON.stringify(receipt, null, 2));
else console.log(`\n  ${summary.pass} pass, ${summary.warn} warn, ${summary.fail} fail, ${summary.null} null → .tmp/atlas/e2e-contract-chain-receipt-v1.json`);
process.exit(summary.fail > 0 ? 1 : 0);
