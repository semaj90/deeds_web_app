#!/usr/bin/env node
// Builds a self-contained, OFFLINE, searchable review sheet for the domain calibration draft (DOMAIN-CAL-02).
// Read-only over the draft; writes only docs/reports/domain-review-sheet-v1.html. No network, no DB.
// The sheet exports reviewed rows as JSONL in the same schema the eval harness reads
// (python/atlas_domain_classifier_eval_v1.py --input <exported file>).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argOf = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const INPUT = argOf('--input') ? path.resolve(argOf('--input')) : path.join(ROOT, 'docs/reports/domain-calibration-draft-v1.jsonl');
const OUTPUT = argOf('--output') ? path.resolve(argOf('--output')) : path.join(ROOT, 'docs/reports/domain-review-sheet-v1.html');

const TOP_LEVEL = ['api', 'auth', 'cache', 'compiler', 'database', 'devops', 'error-handling', 'frontend', 'gpu', 'graph', 'machine-learning', 'retrieval', 'test'];
const CHILDREN = ['database.postgresql', 'devops.env-config', 'devops.process-mgmt', 'frontend.sveltekit'];
const NON_GOLD = ['AMBIGUOUS', 'NOT_A_DOMAIN', 'SKIP'];
const TRUST_TOTAL = 200;
const TRUST_PER_CLASS = 30;

const rows = fs.readFileSync(INPUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const qualified = rows.filter((r) => r.sourceRevision);
const needs = TOP_LEVEL.map((g) => {
  const have = qualified.filter((r) => r.proposedOntologyGroup === g).length;
  return { group: g, revisionQualifiedRowsProposed: have, target: TRUST_PER_CLASS, shortBy: Math.max(0, TRUST_PER_CLASS - have) };
});
const payload = {
  generatedAt: new Date().toISOString(),
  topLevel: TOP_LEVEL, children: CHILDREN, nonGold: NON_GOLD,
  trust: { total: TRUST_TOTAL, perClass: TRUST_PER_CLASS },
  needs, rows,
};
// Escape "<" and the JS line separators inside the embedded JSON so data can never close the script tag.
// The backslash is built from a char code so no source-level escape can silently collapse to a no-op.
const BS = String.fromCharCode(92);
const data = JSON.stringify(payload)
  .split('<').join(BS + 'u003c')
  .split(String.fromCharCode(0x2028)).join(BS + 'u2028')
  .split(String.fromCharCode(0x2029)).join(BS + 'u2029');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Domain Review Sheet</title>
<style>
:root{--bg:#fff;--fg:#1a1a1a;--mut:#666;--bd:#d0d0d0;--acc:#0b5fff;--ok:#0a7d33;--warn:#a15c00}
@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#eaeaea;--mut:#9a9a9a;--bd:#3a3a3a;--acc:#6ea0ff;--ok:#4cd07d;--warn:#e0a040}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
h1{font-size:18px;margin:0 0 8px}h2{font-size:15px;margin:16px 0 6px}
details{border:1px solid var(--bd);border-radius:6px;padding:8px 12px;margin:8px 0}
summary{cursor:pointer;font-weight:600}
table{border-collapse:collapse;width:100%}td,th{border:1px solid var(--bd);padding:4px 8px;text-align:left;vertical-align:top}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
input[type=search]{flex:1;min-width:220px;padding:6px;background:var(--bg);color:var(--fg);border:1px solid var(--bd);border-radius:4px}
select,button{padding:6px;background:var(--bg);color:var(--fg);border:1px solid var(--bd);border-radius:4px;cursor:pointer}
button.p{background:var(--acc);color:#fff;border-color:var(--acc)}
.row{border:1px solid var(--bd);border-radius:6px;padding:10px;margin:8px 0}
.row.done{border-color:var(--ok)}
.meta{color:var(--mut);font-size:12px;word-break:break-all}
.ev{white-space:pre-wrap;color:var(--mut);font-size:12px;max-height:6.5em;overflow:auto;border-left:3px solid var(--bd);padding-left:8px;margin:6px 0}
.tag{display:inline-block;font-size:11px;border:1px solid var(--bd);border-radius:10px;padding:0 6px;margin-right:4px}
.q{color:var(--ok);border-color:var(--ok)}.u{color:var(--warn);border-color:var(--warn)}
.stat{font-weight:600}
</style></head><body>
<h1>Domain review sheet (DOMAIN-CAL-02)</h1>
<div class="meta">Offline, no network. Your choices autosave in this browser (localStorage) and export as JSONL for the eval harness. Nothing is written to any database.</div>

<details open><summary>Labeling rules (read first)</summary><ol>
<li><b>Judge the file's primary responsibility</b> from <code>sourceRef</code> and, if unsure, open the file. The evidence text is an LLM summary: often generic and sometimes contaminated with prompt residue (e.g. "Example 1 (Good)"). Never treat it as truth.</li>
<li><b>Decide independently.</b> Blind mode (default) hides the weak label and the proposed group until you choose, so they do not anchor you. Agreement with them is measured afterward, not assumed.</li>
<li><b>One group per row</b> from the list. Use a child group (database.postgresql, devops.env-config, devops.process-mgmt, frontend.sveltekit) only when certain; otherwise its top-level parent.</li>
<li><b>Multiple responsibilities:</b> pick the dominant one. If none dominates, choose <b>AMBIGUOUS</b> (counted, excluded from gold).</li>
<li><b>Not a domain</b> (run output, log, generated report, fixture data, memory dump): choose <b>NOT_A_DOMAIN</b>. Many rows under <code>memory/runs</code> are artifacts, not code.</li>
<li><b>File gone or unreadable:</b> choose <b>SKIP</b>.</li>
<li>Review the <span class="tag q">revision-qualified</span> rows first: only they can count in the revision-qualified score. <span class="tag u">unresolved</span> rows still make valid text labels but can never be joined to a feature matrix or promoted to canonical authority.</li>
<li>A second reviewer on at least 10% of rows is needed before the labels are trusted (agreement check). Add your name in Reviewer.</li>
</ol></details>

<details open><summary>What we need (trust floor: ${TRUST_TOTAL} reviewed rows total, ${TRUST_PER_CLASS} per class)</summary>
<div id="needs"></div>
<div class="meta">Counts are the revision-qualified rows currently in the draft, by proposed group. Groups showing shortfall need more revision-qualified candidates than the draft contains; that depends on current source authority, so it cannot be closed by labeling alone.</div>
</details>

<div class="bar">
<input type="search" id="q" placeholder="Search path, label, evidence text..." aria-label="Search">
<select id="fq"><option value="all">All rows</option><option value="rq">Revision-qualified only</option><option value="un">Unresolved only</option></select>
<select id="fs"><option value="all">All status</option><option value="todo">To do</option><option value="done">Reviewed</option></select>
<select id="fg"><option value="">Any proposed group</option></select>
<label><input type="checkbox" id="blind" checked> Blind mode</label>
<input type="text" id="rev" placeholder="Reviewer" size="12" aria-label="Reviewer">
<button class="p" id="exp">Export reviewed JSONL</button>
</div>
<div class="stat" id="stat"></div>
<div id="list"></div>

<script id="d" type="application/json">${data}</script>
<script>
const D = JSON.parse(document.getElementById('d').textContent);
const KEY = 'domainReviewV1';
let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { saved = {}; }
const opts = [...D.topLevel, ...D.children, ...D.nonGold];
const $ = (id) => document.getElementById(id);
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {} };
const isGold = (v) => v && !D.nonGold.includes(v);
const rq = (r) => !!r.sourceRevision;

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else e.setAttribute(k, v); }
  for (const kid of kids) e.append(kid);
  return e;
}
function needsTable() {
  const t = el('table'); t.append(el('tr', {}, ...['Group', 'Revision-qualified rows in draft', 'Reviewed so far (gold)', 'Target', 'Short by'].map((h) => el('th', {}, h))));
  for (const n of D.needs) {
    const got = D.rows.filter((r) => rq(r) && saved[r.packetKey] && saved[r.packetKey].g === n.group).length;
    t.append(el('tr', {}, el('td', {}, n.group), el('td', {}, String(n.revisionQualifiedRowsProposed)), el('td', {}, String(got)), el('td', {}, String(n.target)), el('td', {}, String(Math.max(0, n.target - got)))));
  }
  $('needs').replaceChildren(t);
}
function render() {
  const q = $('q').value.toLowerCase(), fq = $('fq').value, fs = $('fs').value, fg = $('fg').value, blind = $('blind').checked;
  const list = D.rows.filter((r) => {
    if (fq === 'rq' && !rq(r)) return false; if (fq === 'un' && rq(r)) return false;
    const done = !!saved[r.packetKey]; if (fs === 'todo' && done) return false; if (fs === 'done' && !done) return false;
    if (fg && r.proposedOntologyGroup !== fg) return false;
    if (q && !(r.sourceRef + ' ' + r.featureLabel + ' ' + r.originalLabel + ' ' + r.proposedOntologyGroup + ' ' + r.textEvidence).toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => Number(rq(b)) - Number(rq(a)));
  const root = $('list'); root.replaceChildren();
  for (const r of list) {
    const s = saved[r.packetKey];
    const sel = el('select', { 'aria-label': 'Reviewed group' }, el('option', { value: '' }, '- choose -'), ...opts.map((o) => el('option', { value: o }, o)));
    sel.value = s ? s.g : '';
    sel.onchange = () => { if (sel.value) saved[r.packetKey] = { g: sel.value, by: $('rev').value || '', at: new Date().toISOString() }; else delete saved[r.packetKey]; persist(); needsTable(); stat(); render(); };
    const revealed = !blind || !!s;
    const row = el('div', { class: 'row' + (s ? ' done' : '') },
      el('div', {}, el('span', { class: 'tag ' + (rq(r) ? 'q' : 'u') }, rq(r) ? 'revision-qualified' : 'unresolved'), el('b', {}, r.sourceRef)),
      el('div', { class: 'meta' }, 'packet ' + r.packetKey + (revealed ? ' | weak label: ' + r.originalLabel + ' | proposed: ' + r.proposedOntologyGroup + ' (' + r.mappingKind + ')' : ' | labels hidden (blind mode)')),
      el('div', { class: 'ev' }, r.textEvidence || '(no evidence text)'),
      el('div', {}, sel));
    root.append(row);
  }
  $('stat').textContent = list.length + ' shown | ' + ($('stat').dataset.summary || '');
}
function stat() {
  const all = Object.values(saved), gold = all.filter((v) => isGold(v.g)).length;
  const goldRq = D.rows.filter((r) => rq(r) && saved[r.packetKey] && isGold(saved[r.packetKey].g)).length;
  document.title = 'Domain Review Sheet - ' + all.length + ' reviewed';
  $('stat').dataset.summary = all.length + ' reviewed, ' + gold + ' gold (' + goldRq + ' revision-qualified) of trust floor ' + D.trust.total;
}
function exportJsonl() {
  const out = D.rows.filter((r) => saved[r.packetKey]).map((r) => {
    const s = saved[r.packetKey];
    return JSON.stringify({ ...r, reviewStatus: 'REVIEWED', reviewedGroup: s.g, reviewer: s.by || $('rev').value || null, reviewedAt: s.at });
  });
  const blob = new Blob([out.join('\\n') + '\\n'], { type: 'application/x-ndjson' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'domain-calibration-reviewed-v1.jsonl' }); a.click();
}
const groups = [...new Set(D.rows.map((r) => r.proposedOntologyGroup))].sort();
for (const g of groups) $('fg').append(el('option', { value: g }, g));
['q', 'fq', 'fs', 'fg', 'blind'].forEach((id) => $(id).addEventListener('input', render));
$('exp').onclick = exportJsonl;
needsTable(); stat(); render();
</script></body></html>`;

fs.writeFileSync(OUTPUT, html, 'utf8');
console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT), rows: rows.length, revisionQualified: qualified.length, bytes: html.length, writesPerformed: 'report file only' }));
