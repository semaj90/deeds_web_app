#!/usr/bin/env node
/**
 * WFU-09b/09d experiment (read-only): derive workboard ranking features from the OpenSpec tasks.md
 * text itself. Advisory only — never writes a canonical store, never promotes anything.
 *
 * Input : docs/reports/openspec-execution-controller-v1.json (task keys, source file, line, state)
 *         docs/reports/actionable-workboard-v3.json          (the 2,309 actionable tasks)
 *         the tasks.md files those tasks come from
 * Output: docs/reports/workboard-feature-derivation-v1.json
 *
 * Every derived value is text-derived, so its basis is TEXT_DERIVED (extracted counts) or HEURISTIC
 * (keyword flags) — never OBSERVED/DERIVED. Downstream producers must opt in to weak-basis features.
 * Features that have no text source (estimatedMinutes, historicalMedianMinutes) stay absent.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const reportsDir = path.resolve(process.argv[2] ?? 'docs/reports');
const outputPath = path.resolve(process.argv[3] ?? path.join(reportsDir, 'workboard-feature-derivation-v1.json'));
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(reportsDir, name), 'utf8'));

const controller = readJson('openspec-execution-controller-v1.json');
const workboard = readJson('actionable-workboard-v3.json');

const CHECKBOX = /^(\s*)- \[([ xX])\]\s+(.*)$/;
const HEADING = /^#{1,6}\s/;
const ID_AT_START = /^(?:\*\*)?`?([A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+[a-z]?|\d+(?:\.\d+)+[a-z]?)`?\b/;
const ID_TOKEN = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+[a-z]?\b/g;
const PREREQ_CUE = /(?:\bafter\b|gated?\s+(?:behind|on|by)|\brequires?\b|depends?\s+on|blocked\s+by|only\s+after|prerequisite|\bonce\b|builds?\s+on|\bneeds?\b|\buntil\b|following)[^.;]{0,100}$/i;
const PATH_TOKEN = /(?:^|[\s`(\[,"'])((?:sveltekit-frontend\/|src\/|scripts\/|python\/|docs\/|packages\/|openspec\/|docker\/|native\/|services\/|drizzle\/|models\/)[\w@./\\+-]*\.[A-Za-z0-9]{1,6})/g;
const RECEIPT_TOKEN = /(?:docs\/reports\/)?([\w.-]+-v\d+(?:-[\w.-]+)?\.json)/g;
const HUMAN_GATE = /human[- ]?gate|human authori[sz]ation|explicit(?:ly)?\s+(?:operator|human)|operator[- ](?:approval|decision|only)|not yet applied|requires? (?:an )?explicit/i;
const SCHEMA_RISK = /\bmigration\b|alter table|drop (?:table|column)|create table|drizzle|schema change|backfill/i;
const PRODUCTION_RISK = /--apply|\bdeploy|\bproduction\b|promot(?:e|ion)|writes? to (?:postgres|qdrant|neo4j|valkey|redis)|apply_proven/i;
const EXTERNAL_RISK = /\bdocker\b|network|websearch|https?:\/\/|api key|rate limit|external service|firecrawl|registry access/i;

const normalize = (s) => s.replace(/[*`_]/g, '').replace(/\s+/g, ' ').trim();
const fileCache = new Map();
function loadFile(rel) {
  if (!fileCache.has(rel)) {
    let lines = null;
    try { lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split(/\r?\n/); } catch { /* missing */ }
    fileCache.set(rel, lines);
  }
  return fileCache.get(rel);
}

// --- parse every checkbox task in every source file once ---------------------------------
const parsed = new Map(); // file -> { tasks: [], byId: Map }
function parseFile(rel) {
  if (parsed.has(rel)) return parsed.get(rel);
  const lines = loadFile(rel);
  const out = { lines, tasks: [], byId: new Map(), byLine: new Map() };
  parsed.set(rel, out);
  if (!lines) return out;
  for (let i = 0; i < lines.length; i++) {
    const m = CHECKBOX.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    const block = [lines[i]];
    for (let j = i + 1; j < lines.length && block.length < 60; j++) {
      const l = lines[j];
      if (l.trim() === '') { block.push(l); continue; }
      const ind = l.length - l.trimStart().length;
      if (CHECKBOX.test(l) && ind <= indent) break;
      if (HEADING.test(l) || ind <= indent) break;
      block.push(l);
    }
    while (block.length && block[block.length - 1].trim() === '') block.pop();
    const idm = ID_AT_START.exec(m[3]);
    const task = { file: rel, lineIdx: i, state: m[2] === ' ' ? 'OPEN' : 'DONE', id: idm ? idm[1] : null, text: block.join('\n'), lineCount: block.filter((x) => x.trim()).length, norm: normalize(m[3]) };
    out.tasks.push(task);
    out.byLine.set(i + 1, task);
    if (task.id && !out.byId.has(task.id)) out.byId.set(task.id, task);
  }
  return out;
}

// global unique-id map for cross-change references
const globalIds = new Map();
for (const src of new Set(controller.allTasks.map((t) => t.source))) {
  for (const t of parseFile(src).tasks) {
    if (!t.id) continue;
    (globalIds.get(t.id) ?? globalIds.set(t.id, []).get(t.id)).push(t);
  }
}

// --- join controller rows to parsed tasks (line first, then nearest text match) -----------
const stats = { controllerRows: 0, matchedByLine: 0, matchedByText: 0, unresolved: 0 };
function locate(row) {
  const p = parseFile(row.source);
  const byLine = p.byLine.get(row.line);
  const want = normalize(row.text).slice(0, 40);
  if (byLine && byLine.norm.includes(want)) return { task: byLine, how: 'line' };
  let best = null;
  for (const t of p.tasks) {
    if (!t.norm.includes(want)) continue;
    if (!best || Math.abs(t.lineIdx + 1 - row.line) < Math.abs(best.lineIdx + 1 - row.line)) best = t;
  }
  return best ? { task: best, how: 'text' } : { task: null, how: 'none' };
}

// --- dependency edges (prerequisite: A depends on B) -------------------------------------
const located = new Map(); // taskKey -> task
for (const row of controller.allTasks) {
  stats.controllerRows++;
  const { task, how } = locate(row);
  if (!task) { stats.unresolved++; continue; }
  located.set(row.taskKey, task);
  if (how === 'line') stats.matchedByLine++; else stats.matchedByText++;
}

function resolveRef(fromTask, token) {
  const local = parseFile(fromTask.file).byId.get(token);
  if (local) return local;
  const g = globalIds.get(token);
  return g && g.length === 1 ? g[0] : null;
}
function prerequisites(task) {
  const prereq = new Set(); const mention = new Set(); const unresolved = new Set();
  const text = task.text;
  for (const m of text.matchAll(ID_TOKEN)) {
    const token = m[0];
    if (token === task.id) continue;
    const before = text.slice(Math.max(0, m.index - 140), m.index);
    const target = resolveRef(task, token);
    if (PREREQ_CUE.test(before)) {
      if (target) prereq.add(target); else unresolved.add(token);
    } else if (target) mention.add(target);
  }
  return { prereq, mention, unresolved };
}
const edgeCache = new Map();
const edgesOf = (task) => edgeCache.get(task) ?? edgeCache.set(task, prerequisites(task)).get(task);
const dependents = new Map(); // task -> Set(open dependents)
for (const t of located.values()) {
  if (t.state !== 'OPEN') continue;
  for (const p of edgesOf(t).prereq) (dependents.get(p) ?? dependents.set(p, new Set()).get(p)).add(t);
}
function downstream(task) {
  const seen = new Set(); const stack = [...(dependents.get(task) ?? [])];
  while (stack.length && seen.size < 500) {
    const t = stack.pop();
    if (seen.has(t)) continue;
    seen.add(t);
    for (const d of dependents.get(t) ?? []) stack.push(d);
  }
  return seen.size;
}

// --- per-task derived features -----------------------------------------------------------
const ABSENT = { present: false, value: 0, basis: 'ABSENT' };
const text = (value, extra) => ({ present: true, value, basis: 'TEXT_DERIVED', ...(extra ?? {}) });
const heur = (value) => ({ present: true, value, basis: 'HEURISTIC' });
const existsRel = (p) => {
  const clean = p.replaceAll('\\', '/');
  return fs.existsSync(path.join(ROOT, clean)) || fs.existsSync(path.join(ROOT, 'sveltekit-frontend', clean));
};
const probes = { pathsExtracted: 0, pathsExisting: 0, receiptsExtracted: 0, receiptsExisting: 0, prereqResolved: 0, prereqUnresolved: 0 };

const derived = {};
let withId = 0;
for (const wb of workboard.tasks) {
  const task = located.get(wb.id);
  if (!task) { derived[wb.id] = { located: false, features: {} }; continue; }
  const { prereq, unresolved } = edgesOf(task);
  const paths = new Set([...task.text.matchAll(PATH_TOKEN)].map((m) => m[1].replaceAll('\\', '/')));
  const receipts = new Set([...task.text.matchAll(RECEIPT_TOKEN)].map((m) => m[1]));
  const existingPaths = [...paths].filter(existsRel);
  const existingReceipts = [...receipts].filter((r) => fs.existsSync(path.join(reportsDir, r)));
  probes.pathsExtracted += paths.size; probes.pathsExisting += existingPaths.length;
  probes.receiptsExtracted += receipts.size; probes.receiptsExisting += existingReceipts.length;
  probes.prereqResolved += prereq.size; probes.prereqUnresolved += unresolved.size;
  const openPrereq = [...prereq].filter((p) => p.state === 'OPEN').length;
  const hasId = Boolean(task.id);
  if (hasId) withId++;
  derived[wb.id] = {
    located: true,
    file: task.file,
    id: task.id,
    features: {
      specLineCount: text(task.lineCount),
      affectedFileCount: text(paths.size),
      evidenceReceiptCount: text(receipts.size),
      evidenceReuse: text(existingReceipts.length),
      prerequisiteCount: text(prereq.size, { unresolvedIds: unresolved.size }),
      remainingRequiredGates: text(openPrereq),
      unblocksGateCount: hasId ? text(dependents.get(task)?.size ?? 0) : ABSENT,
      downstreamBlockedCount: hasId ? text(downstream(task)) : ABSENT,
      requiresHumanApproval: heur(HUMAN_GATE.test(task.text) ? 1 : 0),
      schemaRisk: heur(SCHEMA_RISK.test(task.text) ? 1 : 0),
      productionRisk: heur(PRODUCTION_RISK.test(task.text) ? 1 : 0),
      externalDependencyRisk: heur(EXTERNAL_RISK.test(task.text) ? 1 : 0),
      estimatedMinutes: ABSENT,
      historicalMedianMinutes: ABSENT
    }
  };
}

// --- coverage / quality report -----------------------------------------------------------
const names = Object.keys(Object.values(derived).find((d) => d.located).features);
const coverage = {};
for (const n of names) {
  const cells = Object.values(derived).filter((d) => d.located).map((d) => d.features[n]);
  const present = cells.filter((c) => c.present);
  const values = present.map((c) => c.value);
  coverage[n] = {
    present: present.length,
    absent: cells.length - present.length,
    basis: [...new Set(present.map((c) => c.basis))],
    distinctValues: new Set(values).size,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    nonZero: values.filter((v) => v !== 0).length
  };
}
const pct = (a, b) => (b ? Number((100 * a / b).toFixed(1)) : null);
const report = {
  schema: 'atlas.workboard-feature-derivation.v1',
  generatedFrom: { controllerGeneratedAt: controller.generatedAt, workboardSemanticChecksum: workboard.semanticChecksum },
  advisoryOnly: true,
  canonicalAuthority: false,
  writesPerformed: false,
  join: { ...stats, matchedPercent: pct(stats.matchedByLine + stats.matchedByText, stats.controllerRows) },
  workboardTasks: workboard.tasks.length,
  workboardLocated: Object.values(derived).filter((d) => d.located).length,
  tasksWithNamedId: withId,
  quality: {
    filePathsExtracted: probes.pathsExtracted,
    filePathsExistingOnDisk: probes.pathsExisting,
    filePathExistencePercent: pct(probes.pathsExisting, probes.pathsExtracted),
    receiptsExtracted: probes.receiptsExtracted,
    receiptsExistingInReportsDir: probes.receiptsExisting,
    prerequisiteEdgesResolved: probes.prereqResolved,
    prerequisiteIdsUnresolved: probes.prereqUnresolved
  },
  notDerivable: ['estimatedMinutes', 'historicalMedianMinutes'],
  coverage,
  tasks: derived
};
report.semanticChecksum = crypto.createHash('sha256').update(JSON.stringify({ ...report, tasks: undefined })).digest('hex');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify({ outputPath, join: report.join, workboardLocated: report.workboardLocated, tasksWithNamedId: withId, quality: report.quality }, null, 2));
