#!/usr/bin/env node
// Builds a self-contained, OFFLINE, searchable review sheet for the domain calibration draft (DOMAIN-CAL-02).
// Read-only over the draft; writes only docs/reports/domain-review-sheet-v1.html. No network, no DB.
// The sheet exports reviewed rows as JSONL in the same schema the eval harness reads
// (python/atlas_domain_classifier_eval_v1.py --input <exported file>).
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDomainReviewSourceEvidenceV1 } from './lib/domain-review-source-evidence-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argOf = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const INPUT = argOf('--input') ? path.resolve(argOf('--input')) : path.join(ROOT, 'docs/reports/domain-calibration-draft-v1.jsonl');
const SIDECAR_INPUT = argOf('--sidecar-evidence') ? path.resolve(argOf('--sidecar-evidence')) : path.join(ROOT, 'docs/reports/domain-calibration-gold-v2-sidecar-evidence-v1.jsonl');
const PG_BINDING_AUDIT = argOf('--pg-binding-audit') ? path.resolve(argOf('--pg-binding-audit')) : path.join(ROOT, '.tmp/review/domain-calibration-pg18-source-bindings-v1.json');
// --palette: label directly in the NES palette domains (scripts/atlas/data/nes-domain-palette-v1.json) instead of the 13-group ontology.
// No automatic ontology->palette translation exists (see docs/reports/domain-ontology-to-nes-palette-mapping-proposal-v1.json, PROPOSAL_ONLY),
// so reviewers choose a palette domain themselves and the export feeds export-okf-reviewed-domain-examples-v1.mjs unchanged.
const PALETTE_MODE = process.argv.includes('--palette');

let paletteChecksum = null;
let TOP_LEVEL = ['api', 'auth', 'cache', 'compiler', 'database', 'devops', 'error-handling', 'frontend', 'gpu', 'graph', 'machine-learning', 'retrieval', 'test'];
let CHILDREN = ['database.postgresql', 'devops.env-config', 'devops.process-mgmt', 'frontend.sveltekit'];

if (PALETTE_MODE) {
  const palettePath = argOf('--palette-file') ? path.resolve(argOf('--palette-file')) : path.join(ROOT, 'scripts/atlas/data/nes-domain-palette-v1.json');
  const palette = JSON.parse(fs.readFileSync(palettePath, 'utf8'));
  const { checksum, ...body } = palette;
  const actual = 'sha256:' + createHash('sha256').update(JSON.stringify(body)).digest('hex');
  if (actual !== checksum) { console.error(`PALETTE_CHECKSUM_MISMATCH: expected ${checksum}, got ${actual}`); process.exit(3); }
  paletteChecksum = checksum;
  TOP_LEVEL = Object.keys(palette.domains);
  CHILDREN = [];
}

const inputBytes = fs.readFileSync(INPUT);
const inputSha256 = 'sha256:' + createHash('sha256').update(inputBytes).digest('hex');
const rows = inputBytes.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
let pgBindingAudit = null;
if (fs.existsSync(PG_BINDING_AUDIT)) {
  const candidate = JSON.parse(fs.readFileSync(PG_BINDING_AUDIT, 'utf8'));
  if (candidate.schema === 'atlas.domain-calibration-pg18-source-bindings-audit.v1'
      && candidate.inputSha256 === inputSha256
      && candidate.canonicalAuthority === false
      && candidate.writesPerformed === false
      && candidate.goldEligible === false
      && Array.isArray(candidate.rows)) {
    pgBindingAudit = candidate;
  } else {
    console.error('PG_BINDING_AUDIT_IGNORED: schema, input digest, or non-authority flags did not match');
  }
}
const sidecarEvidenceByKey = {};
if (fs.existsSync(SIDECAR_INPUT)) {
  for (const line of fs.readFileSync(SIDECAR_INPUT, 'utf8').split('\n').filter(Boolean)) {
    const record = JSON.parse(line);
    if (record.packetKey) sidecarEvidenceByKey[record.packetKey] = record;
  }
}
const sourceEvidenceByKey = {};
const evidenceByBinding = new Map();
for (const row of rows) {
  const key = row.stableKey || row.packetKey || row.id;
  const sourcePath = row.canonicalSourceRef || row.sourceRef || '';
  const bindingKey = JSON.stringify([sourcePath, row.sourceRevision ?? null, row.bindingContentDigest ?? null, row.workspaceRevision ?? null]);
  if (!Object.hasOwn(sourceEvidenceByKey, key)) {
    if (!evidenceByBinding.has(bindingKey)) evidenceByBinding.set(bindingKey, buildDomainReviewSourceEvidenceV1({ repoRoot: ROOT, row }));
    sourceEvidenceByKey[key] = evidenceByBinding.get(bindingKey);
  }
}
// PG18 binding readback is supplemental review evidence only. It can qualify the exact
// per-file source bytes for blind review, but it never promotes the whole workspace or
// grants canonical/gold authority. Require the receipt row, packet/path identity, digest,
// workspace revision, and an independently generated, checksummed text excerpt to agree.
if (pgBindingAudit) {
  for (const bindingRow of pgBindingAudit.rows) {
    if (bindingRow.status !== 'DB_BINDING_MATCHES_LOCAL_BYTES' || !Number.isInteger(bindingRow.line)) continue;
    const row = rows[bindingRow.line - 1];
    if (!row || row.packetKey !== bindingRow.packetKey || (row.canonicalSourceRef || row.sourceRef) !== bindingRow.sourceRef) continue;
    const key = row.stableKey || row.packetKey || row.id;
    const evidence = sourceEvidenceByKey[key];
    if (!evidence?.excerptText || !evidence.excerptSha256 || evidence.currentSourceSha256 !== bindingRow.currentSourceSha256) continue;
    const workspaceRevision = String(bindingRow.workspaceRevision || '');
    if (!/^sha256:[0-9a-f]{64}$/i.test(workspaceRevision)
        || workspaceRevision !== pgBindingAudit.selectedWorkspaceRevision
        || String(bindingRow.sourceRevision).replace(/^sha256:/i, '').toLowerCase() !== String(bindingRow.contentDigest).replace(/^sha256:/i, '').toLowerCase()
        || String(bindingRow.sourceRevision).replace(/^sha256:/i, '').toLowerCase() !== evidence.currentSourceSha256.replace(/^sha256:/i, '').toLowerCase()) continue;
    const scoreComponents = { ...(evidence.scoreComponents || {}), sourceBinding: 25 };
    const evidenceScore = Object.values(scoreComponents).reduce((sum, value) => sum + Number(value || 0), 0);
    sourceEvidenceByKey[key] = {
      ...evidence,
      evidenceStatus: 'SOURCE_EXCERPT_BINDINGS_MATCHED',
      revisionStatus: 'SOURCE_BINDINGS_MATCH_WORKTREE',
      workspaceRevision,
      workspaceRevisionCheck: 'RECORDED_NOT_REVALIDATED',
      expectedSourceRevision: bindingRow.sourceRevision,
      expectedBindingContentDigest: bindingRow.contentDigest,
      bindingVerification: 'PG18_PER_FILE_READONLY_MATCH',
      wholeWorkspaceCurrentness: 'NOT_PROVEN',
      evidenceScore,
      scoreComponents,
    };
  }
}
const IS_TIER_B = rows.some((r) => r.tier === 'B' || r.stableKey);

if (IS_TIER_B && !argOf('--output')) {
  console.error('TIER_B_EXPLICIT_OUTPUT_REQUIRED: Tier B review sheet requires explicit --output to avoid clobbering Tier A review sheets');
  process.exit(1);
}

const OUTPUT = argOf('--output') ? path.resolve(argOf('--output')) : path.join(ROOT, PALETTE_MODE ? 'docs/reports/domain-review-sheet-palette-v1.html' : 'docs/reports/domain-review-sheet-v1.html');

// Validate Tier B keys: must have stableKey, no duplicates
if (IS_TIER_B) {
  const seenStableKeys = new Set();
  for (const r of rows) {
    if (!r.stableKey) {
      console.error('TIER_B_MISSING_STABLE_KEY: Tier B row missing stableKey');
      process.exit(1);
    }
    if (seenStableKeys.has(r.stableKey)) {
      console.error(`TIER_B_DUPLICATE_STABLE_KEY: duplicate stableKey ${r.stableKey}`);
      process.exit(1);
    }
    seenStableKeys.add(r.stableKey);
  }
}

const NON_GOLD = ['AMBIGUOUS', 'NOT_A_DOMAIN', 'SKIP'];
const TRUST_PER_CLASS = 30;
const TRUST_TOTAL = Math.max(200, TOP_LEVEL.length * TRUST_PER_CLASS);

const storageKey = IS_TIER_B
  ? `domainReview_tierB_${(paletteChecksum || 'v1').slice(7, 19)}_${inputSha256.slice(7)}`
  : argOf('--input')
    ? `domainReview_tierA_${inputSha256.slice(7)}`
    : 'domainReviewV1';

const qualified = rows.filter((r) => sourceEvidenceByKey[r.stableKey || r.packetKey || r.id]?.revisionStatus === 'SOURCE_BINDINGS_MATCH_WORKTREE');
const needs = TOP_LEVEL.map((g) => {
  // In palette mode the draft's proposedOntologyGroup is a different vocabulary, so count matching proposals only.
  const have = PALETTE_MODE
    ? qualified.filter((r) => (r.proposedDomain ?? r.proposedOntologyGroup) === g).length
    : qualified.filter((r) => r.proposedOntologyGroup === g).length;
  return { group: g, sourceBoundRowsProposed: have, target: TRUST_PER_CLASS, shortBy: Math.max(0, TRUST_PER_CLASS - have) };
});
const payload = {
  generatedAt: new Date().toISOString(),
  inputSha256,
  tier: IS_TIER_B ? 'B' : 'A',
  storageKey,
  exportFilename: IS_TIER_B
    ? 'tier-b-task-reviewed-v1.jsonl'
    : argOf('--input')
      ? `${path.basename(INPUT, '.jsonl')}-reviewed.jsonl`
      : 'domain-calibration-reviewed-v1.jsonl',
  topLevel: TOP_LEVEL, children: CHILDREN, nonGold: NON_GOLD,
  trust: { total: TRUST_TOTAL, perClass: TRUST_PER_CLASS },
  pgBindingAudit: pgBindingAudit ? {
    selectedWorkspaceRevision: pgBindingAudit.selectedWorkspaceRevision,
    perFileBindingMatchCount: pgBindingAudit.perFileBindingMatchCount,
    wholeWorkspaceCurrentness: 'NOT_PROVEN',
    canonicalAuthority: false,
    goldEligible: false,
  } : null,
  needs, rows, sourceEvidenceByKey, sidecarEvidenceByKey,
  sourceEvidenceSummary: Object.values(sourceEvidenceByKey).reduce((acc, value) => { acc[value.evidenceStatus] = (acc[value.evidenceStatus] || 0) + 1; return acc; }, {}),
  sidecarEvidenceSummary: Object.values(sidecarEvidenceByKey).reduce((acc, value) => { acc[value.status] = (acc[value.status] || 0) + 1; return acc; }, {}),
};
// Escape "<" and the JS line separators inside the embedded JSON so data can never close the script tag.
// The backslash is built from a char code so no source-level escape can silently collapse to a no-op.
const BS = String.fromCharCode(92);
const data = JSON.stringify(payload)
  .split('<').join(BS + 'u003c')
  .split(String.fromCharCode(0x2028)).join(BS + 'u2028')
  .split(String.fromCharCode(0x2029)).join(BS + 'u2029');
const evidenceSummaryText = Object.entries(payload.sourceEvidenceSummary).map(([status, count]) => `${count} ${status}`).join(' · ');

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
.support{display:grid;gap:4px;margin-top:8px}.support label{font-weight:600;font-size:12px}.support small{color:var(--mut)}
.support textarea{box-sizing:border-box;width:100%;min-height:72px;padding:7px;background:var(--bg);color:var(--fg);border:1px solid var(--bd);border-radius:4px;font:13px/1.4 system-ui,sans-serif;resize:vertical}
.tag{display:inline-block;font-size:11px;border:1px solid var(--bd);border-radius:10px;padding:0 6px;margin-right:4px}
.q{color:var(--ok);border-color:var(--ok)}.u{color:var(--warn);border-color:var(--warn)}
.stat{font-weight:600}
</style></head><body>
<h1>Domain review sheet (DOMAIN-CAL-02)</h1>
<div class="meta" id="syncStatus" role="status">Browser-only preview. Open this sheet from the authenticated Parent Atlas review page to sync decisions to the server review ledger. A file:// preview stays local.</div>
<div class="meta">Evidence inventory: ${evidenceSummaryText}. Source/binding digest agreement does not revalidate the recorded whole-workspace revision.</div>
${pgBindingAudit ? `<div class="meta" role="note"><b>PostgreSQL source-binding readback:</b> ${pgBindingAudit.perFileBindingMatchCount} files match unique per-file source bindings at ${pgBindingAudit.selectedWorkspaceRevision}. Whole-workspace currentness remains <b>NOT PROVEN</b>; these rows are reviewable source excerpts, not canonical admission or automatic gold labels.</div>` : ''}
<div class="meta" role="note"><b>Review eligibility:</b> ${qualified.length}/${rows.length} rows currently pass the source-binding check. The ${TRUST_TOTAL}-row trust floor is not yet reachable from this cohort; ${Math.max(0, TRUST_TOTAL - qualified.length)} additional rows need source re-binding and requalification. Labels on unqualified rows remain triage only.</div>

<details open><summary>Labeling rules (read first)</summary><ol>
<li><b>Judge the file's primary responsibility</b> from the verbatim source excerpt below. Ripgrep selects it from the current checkout; the byte range and source checksum are shown. A source revision and content digest that both match the bytes, plus a recorded workspace revision, make the excerpt source-bound. The workspace revision itself is recorded but not independently revalidated here. Unresolved/mismatched files are triage only. Generated summaries are deliberately not shown as evidence.</li>
<li><b>Decide independently.</b> Blind mode (default) hides the weak label and the proposed group until you choose, so they do not anchor you. Agreement with them is measured afterward, not assumed.</li>
<li><b>One group per row</b> from the list. Use a child group (database.postgresql, devops.env-config, devops.process-mgmt, frontend.sveltekit) only when certain; otherwise its top-level parent.</li>
<li><b>Multiple responsibilities:</b> pick the dominant one. If none dominates, choose <b>AMBIGUOUS</b> (counted, excluded from gold).</li>
<li><b>Not a domain</b> (run output, log, generated report, fixture data, memory dump): choose <b>NOT_A_DOMAIN</b>. Many rows under <code>memory/runs</code> are artifacts, not code.</li>
<li><b>File gone or unreadable:</b> choose <b>SKIP</b>.</li>
<li>Review source-bound rows first. A source path with no excerpt, a binary file, a missing file, or a digest mismatch must be rebound or marked <b>SKIP</b>; do not promote a label from a filename or generated summary alone.</li>
<li>Evidence completeness score (0–100) measures only provenance/excerpt completeness: safe file path 20, strict UTF-8 text 20, source-revision + content-digest match with workspace revision recorded 25, ripgrep declaration/metadata match 20 (fallback first nonempty line 10), and exact UTF-8 excerpt span checksum 15. It does not measure domain correctness or confidence.</li>
<li><b>Support evidence annotation</b> is your own explanation or a pointer to a relevant symbol/line. It is saved in this browser and exported with the review, but it is not source-verified evidence and does not raise the completeness score. For a source claim, cite an exact excerpt and line; do not paste generated summaries as if they came from the file.</li>
<li>8095 Tree-sitter/CST symbol observations are a proposal-only aid. Their returned byte spans are checked against exact current source bytes and the parser revision is shown. They do not establish the dataset's historical workspace revision, domain label, ontology mapping, or graph admission.</li>
<li>Keep Blind mode on for labels intended for classifier gold. Visible-mode labels are recorded but excluded from gold evaluation. A distinct second reviewer on at least 10% of eligible rows is still required before trust.</li>
</ol></details>

<details open id="needsSection"><summary>What we need (trust floor: ${TRUST_TOTAL} reviewed rows total, ${TRUST_PER_CLASS} per class)</summary>
<div id="needs"></div>
<div class="meta">Counts are source and content-digest matches, not counts of approved labels. The workspace revision is recorded but not independently refreshed. Proposed-group counts stay hidden during blind review.</div>
</details>

<div class="bar">
<input type="search" id="q" placeholder="Search path, label, evidence text..." aria-label="Search">
<select id="fq"><option value="all">All rows</option><option value="rq" selected>Source-bound only</option><option value="un">Unbound or stale only</option></select>
<select id="fs"><option value="all">All status</option><option value="todo">To do</option><option value="done">Reviewed</option></select>
<select id="fg" aria-label="Filter by proposed group"><option value="">Any proposed group (visible mode only)</option></select>
<label><input type="checkbox" id="blind" checked> Blind mode</label>
<input type="text" id="rev" placeholder="Reviewer" size="12" aria-label="Reviewer">
<button class="p" id="exp">Export reviewed JSONL</button>
<button id="syncAll" type="button">Sync saved browser choices</button>
<button id="importChoices" type="button">Import earlier JSONL choices</button><input id="importFile" type="file" accept=".jsonl,.ndjson,application/json" hidden>
</div>
<div class="stat" id="stat"></div>
<div id="list"></div>

<script id="d" type="application/json">${data}</script>
<script>
const D = JSON.parse(document.getElementById('d').textContent);
const KEY = D.storageKey || 'domainReviewV1';
const kOf = (r) => r.stableKey || r.packetKey || r.id;
let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { saved = {}; }
const recoveredLegacy = {};
try {
  const currentKeys = new Set(D.rows.map(kOf));
  for (let i = 0; i < localStorage.length; i++) {
    const legacyKey = localStorage.key(i);
    if (!legacyKey || legacyKey === KEY || !legacyKey.startsWith('domainReview')) continue;
    let legacy;
    try { legacy = JSON.parse(localStorage.getItem(legacyKey) || '{}'); } catch { continue; }
    for (const [rowKey, decision] of Object.entries(legacy)) {
      if (!currentKeys.has(rowKey) || !decision?.g || saved[rowKey]?.g) continue;
      const prior = recoveredLegacy[rowKey];
      if (!prior || String(decision.at || '') > String(prior.decision.at || '')) recoveredLegacy[rowKey] = { decision, storageKey: legacyKey };
    }
  }
} catch {}
const opts = [...D.topLevel, ...D.children, ...D.nonGold];
const $ = (id) => document.getElementById(id);
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {} };
let syncAvailable = false;
let syncQueue = Promise.resolve();
const setSyncStatus = (message) => { const node = $('syncStatus'); if (node) node.textContent = message; };
function syncDecision(rowKey) {
  const run = async () => {
  const decision = saved[rowKey];
  if (!syncAvailable || !decision?.g || decision.legacyRecovered) return;
  const row = D.rows.find((candidate) => kOf(candidate) === rowKey);
  if (!row) return;
  const evidence = D.sourceEvidenceByKey[rowKey] || null;
  try {
    const response = await fetch('/api/admin/domain-calibration-reviews', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ datasetSha256: D.inputSha256, rowKey, packetKey: row.packetKey || null,
        sourceRef: row.canonicalSourceRef || row.sourceRef || '', choice: decision.g,
        supportEvidence: decision.note || '', blindAtDecision: decision.blindAtDecision === true,
        sourceEvidenceStatus: evidence?.evidenceStatus || null, currentSourceSha256: evidence?.currentSourceSha256 || null,
        excerptSha256: evidence?.excerptSha256 || null, startByte: evidence?.startByte ?? null, endByte: evidence?.endByte ?? null })
    });
    const body = await response.json();
    if (!response.ok || body.ok !== true) throw new Error(body.error || 'sync refused');
    saved[rowKey] = { ...saved[rowKey], serverSyncedAt: body.savedAt };
    persist();
    setSyncStatus('Online: decision saved to the authenticated server review ledger. It is not canonical source authority or automatically eligible gold.');
  } catch (error) {
    setSyncStatus('Sync failed; this browser still has the local choice. ' + String(error?.message || error));
  }
  };
  const next = syncQueue.then(run, run);
  syncQueue = next.then(() => undefined, () => undefined);
  return next;
}
async function syncAllLocalDecisions() {
  if (!syncAvailable) {
    setSyncStatus('No server connection is active in this browser tab. Open the authenticated app route; local choices were not changed.');
    return;
  }
  const keys = Object.keys(saved).filter((key) => saved[key]?.g && !saved[key]?.legacyRecovered);
  if (!keys.length) { setSyncStatus('There are no confirmed browser choices to sync. Earlier imported choices must be reaffirmed from their rows first.'); return; }
  for (const key of keys) await syncDecision(key);
  setSyncStatus('Finished syncing ' + keys.length + ' saved browser choices where the server accepted them. Check each row status; unresolved source bindings remain ineligible for gold.');
}
async function importPriorChoices(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { setSyncStatus('Import refused: review export exceeds the 10 MiB limit.'); return; }
  try {
    const byKey = new Map(D.rows.map((row) => [kOf(row), row]));
    let imported = 0;
    for (const line of (await file.text()).split(/\\r?\\n/).filter(Boolean)) {
      const prior = JSON.parse(line);
      const rowKey = prior.stableKey || prior.packetKey || prior.id;
      const current = byKey.get(rowKey);
      const label = prior.reviewedGroup || prior.g;
      if (!current || !opts.includes(label) || prior.reviewStatus && prior.reviewStatus !== 'REVIEWED') continue;
      if ((current.canonicalSourceRef || current.sourceRef || '') !== (prior.canonicalSourceRef || prior.sourceRef || '')) continue;
      saved[rowKey] = { g: label, note: prior.supportEvidenceAnnotation || prior.note || '', by: prior.reviewer || prior.by || '',
        at: prior.reviewedAt || prior.at || null, blindAtDecision: prior.reviewMethod === 'BLIND_HUMAN_REVIEW_V1' || prior.blindAtDecision === true,
        legacyRecovered: true, importedFrom: file.name };
      imported++;
    }
    persist(); needsTable(); stat(); render();
    setSyncStatus(imported ? imported + ' earlier choices restored locally. Recheck and reaffirm each one before it is sent to the server; imported choices are excluded from gold until then.' : 'No matching earlier choices found in that JSONL export. The file was not uploaded.');
  } catch { setSyncStatus('Import failed: the file is not valid review JSONL. No server write occurred.'); }
}
async function loadServerDecisions() {
  if (!['http:', 'https:'].includes(location.protocol)) return;
  try {
    const response = await fetch('/api/admin/domain-calibration-reviews', { credentials: 'same-origin', headers: { accept: 'application/json' } });
    const body = await response.json();
    if (!response.ok || body.ok !== true) throw new Error(body.error || 'review sync unavailable');
    const pending = [];
    for (const [rowKey, decision] of Object.entries(body.decisions || {})) {
      if (!saved[rowKey]?.g) saved[rowKey] = decision;
      else if (saved[rowKey].g !== decision.g || (saved[rowKey].note || '') !== (decision.note || '')) pending.push(rowKey);
    }
    syncAvailable = true; persist(); stat(); render();
    setSyncStatus('Online: ' + Object.keys(body.decisions || {}).length + ' of your saved decisions loaded.' + (pending.length ? ' ' + pending.length + ' browser decisions differ; your browser copy is preserved.' : '') + ' Sync is per authenticated reviewer; labels remain separate from canonical source authority.');
  } catch (error) {
    setSyncStatus('Server review sync unavailable; choices remain local to this browser. ' + String(error?.message || error));
  }
}
const evidenceOf = (r) => D.sourceEvidenceByKey[kOf(r)] || null;
const sidecarOf = (r) => D.sidecarEvidenceByKey?.[r.packetKey] || null;
const sidecarDisplay = (r, evidence) => {
  const record = sidecarOf(r);
  if (!record) return null;
  const currentMatch = record.status === 'AST_ANALYSIS_COMPLETE' &&
    record.currentSourceRevision === evidence?.currentSourceSha256 &&
    record.sidecarSourceRevisionEchoMatches === true;
  const lexicalMatch = record.status === 'LEXICAL_ANALYSIS_COMPLETE' &&
    record.currentSourceRevision === evidence?.currentSourceSha256 &&
    record.sidecarSourceRevisionEchoMatches === true;
  const nl = String.fromCharCode(10);
  let text = '8095 AST/CST proposal only: ' + record.status;
  if (currentMatch) {
    text += (record.datasetBindingMatchesCurrentBytes === true
      ? ' | dataset source binding matches current bytes'
      : ' | CURRENT-CHECKOUT OBSERVATION ONLY: dataset binding does not match these bytes') +
      ' | ' + record.engine + ' ' + record.engineVersion + ' | ' + record.language +
      ' | ' + record.scanCompleteness + '/' + record.syntaxStatus +
      ' | ' + record.validatedChunkCount + '/' + record.chunkCount + ' spans checked' +
      ' | dataset binding matches current bytes: ' + String(record.datasetBindingMatchesCurrentBytes) +
      ' | edges ' + JSON.stringify(record.edgeCounts || {}) + nl;
    const chunks = (record.chunks || []).filter((c) => c.name || c.imports?.length || c.exports?.length || c.calls?.length).slice(0, 8);
    text += chunks.map((c) =>
      c.kind + (c.name ? ' ' + c.name : '') + ' | lines ' + c.startLine + '-' + c.endLine +
      ' | bytes ' + c.startByte + '-' + c.endByte +
      (c.imports?.length ? ' | imports: ' + c.imports.slice(0, 4).join(', ') : '') +
      (c.calls?.length ? ' | calls: ' + c.calls.slice(0, 4).join(', ') : '') +
      nl + c.excerpt
    ).join(nl + nl);
  } else if (lexicalMatch) {
    text = (record.datasetBindingMatchesCurrentBytes === true
      ? '8095 lexical proposal only; dataset source binding matches current bytes: '
      : '8095 CURRENT-CHECKOUT LEXICAL OBSERVATION ONLY; dataset binding does not match these bytes: ') + record.engine + ' ' + record.engineVersion +
      ' | ' + record.passName + ' ' + record.passRevision +
      ' | current-source echo verified | dataset binding matches current bytes: ' +
      String(record.datasetBindingMatchesCurrentBytes) + nl +
      (record.lexicalTerms || []).join(' · ');
  } else if (record.currentSourceRevision) {
    text += ' | current-byte or parser revision mismatch; observations hidden';
  }
  return el('div', { class: 'ev', 'aria-label': '8095 parser observations, proposal only' }, text);
};
const rq = (r) => evidenceOf(r)?.revisionStatus === 'SOURCE_BINDINGS_MATCH_WORKTREE';
const evidenceStatusText = (e) => !e ? 'No source evidence record' : ({
  SOURCE_EXCERPT_BINDINGS_MATCHED: 'Source revision and content digest match these bytes; workspace revision is recorded but not independently revalidated',
  SOURCE_EXCERPT_BINDINGS_UNQUALIFIED: 'Verbatim source excerpt found, but its source bindings do not all match current bytes',
  SOURCE_FILE_MISSING: 'Source file is missing from this checkout',
  SOURCE_FILE_UNREADABLE: 'Source file could not be read',
  SOURCE_PATH_OUTSIDE_REPO: 'Path resolves outside this repository',
  SOURCE_BINARY_OR_INVALID_UTF8: 'Binary or invalid UTF-8; text evidence unavailable',
  SOURCE_TOO_LARGE: 'File exceeds the bounded text-evidence size limit',
  TEXT_NO_RG_EXCERPT: 'Text file found, but ripgrep found no excerpt',
  EMPTY_TEXT_FILE: 'Source file is empty',
  RG_UNAVAILABLE: 'ripgrep is unavailable; no excerpt generated',
  RG_FAILED: 'ripgrep failed; no excerpt generated',
  RG_SPAN_NOT_UTF8_VERIFIABLE: 'Matched span could not be verified as UTF-8',
})[e.evidenceStatus] || e.evidenceStatus;

function applyBlindVisibility() {
  const blind = $('blind').checked;
  $('needsSection').hidden = blind;
  $('fg').hidden = blind;
  $('fg').disabled = blind;
  if (blind) $('fg').value = '';
}

if (D.tier === 'B') {
  const banner = document.createElement('div');
  banner.style.cssText = 'background:#fff3cd;color:#856404;border:1px solid #ffeeba;padding:10px 14px;margin:10px 0;border-radius:4px;font-weight:600;font-size:13px;';
  banner.textContent = 'Tier B: Evaluation Only — Tasks have no admitted workspace revision and cannot acquire model-training authority.';
  $('stat').before(banner);
}

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else e.setAttribute(k, v); }
  for (const kid of kids) e.append(kid);
  return e;
}
function needsTable() {
  const t = el('table'); t.append(el('tr', {}, ...['Group', 'Source-bound rows in draft', 'Reviewed decisions (provisional; not gold)', 'Target', 'Short by'].map((h) => el('th', {}, h))));
  for (const n of D.needs) {
    const got = D.rows.filter((r) => rq(r) && saved[kOf(r)] && saved[kOf(r)].g === n.group).length;
    t.append(el('tr', {}, el('td', {}, n.group), el('td', {}, String(n.sourceBoundRowsProposed)), el('td', {}, String(got)), el('td', {}, String(n.target)), el('td', {}, String(Math.max(0, n.target - got)))));
  }
  $('needs').replaceChildren(t);
}
function render() {
  const q = $('q').value.toLowerCase(), fq = $('fq').value, fs = $('fs').value, fg = $('fg').value, blind = $('blind').checked;
  applyBlindVisibility();
  const list = D.rows.filter((r) => {
    if (fq === 'rq' && !rq(r)) return false; if (fq === 'un' && rq(r)) return false;
    const rKey = kOf(r);
    const done = !!saved[rKey]; if (fs === 'todo' && done) return false; if (fs === 'done' && !done) return false;
    const propDomain = r.proposedDomain ?? r.proposedOntologyGroup ?? '';
    if (fg && propDomain !== fg) return false;
    const evidence = evidenceOf(r);
    const searchText = [r.sourceRef, r.featureLabel, evidence?.excerptText, ...(blind ? [] : [r.originalLabel, propDomain, r.textEvidence])].filter(Boolean).join(' ');
    if (q && !searchText.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => Number(rq(b)) - Number(rq(a)) || (evidenceOf(b)?.evidenceScore ?? 0) - (evidenceOf(a)?.evidenceScore ?? 0) || String(a.sourceRef).localeCompare(String(b.sourceRef)));
  const root = $('list'); root.replaceChildren();
  for (const r of list) {
    const rKey = kOf(r);
    const s = saved[rKey];
    const oldChoice = !s?.g ? recoveredLegacy[rKey] : null;
    const sel = el('select', { 'aria-label': 'Reviewed group' }, el('option', { value: '' }, '- choose -'), ...opts.map((o) => el('option', { value: o }, o)));
    sel.value = s ? s.g : '';
    sel.onchange = () => {
      const prior = saved[rKey] || {};
      if (sel.value) saved[rKey] = { ...prior, g: sel.value, by: $('rev').value || prior.by || '', at: new Date().toISOString(), blindAtDecision: $('blind').checked };
      else if (prior.note) saved[rKey] = { ...prior, g: '', at: new Date().toISOString() };
      else delete saved[rKey];
      persist(); needsTable(); stat(); if (saved[rKey]?.g) void syncDecision(rKey); render();
    };
    const evidence = evidenceOf(r);
    const astPanel = sidecarDisplay(r, evidence);
    const revealed = !blind || !!s?.g;
    const propDomain = r.proposedDomain ?? r.proposedOntologyGroup ?? 'none';
    const weakLabel = r.originalLabel ? ' | weak label: ' + r.originalLabel : '';
    const mapKind = r.mappingKind ? ' (' + r.mappingKind + ')' : '';
    const keyLabel = r.stableKey ? 'task ' + r.stableKey : 'packet ' + r.packetKey;
    const statusMeta = evidence
      ? evidenceStatusText(evidence) + ' | evidence completeness ' + evidence.evidenceScore + '/100 | ' + (evidence.sourcePath || 'no source path') + ' | line ' + (evidence.lineNumber ?? '—') + ' bytes ' + (evidence.startByte ?? '—') + '-' + (evidence.endByte ?? '—') + ' | sha ' + (evidence.currentSourceSha256 || 'unavailable')
      : 'No source evidence record';
    const annotation = el('textarea', { 'aria-label': 'Reviewer-authored supporting evidence annotation', placeholder: 'Explain why the source supports your choice. Add a symbol or line pointer; this note is reviewer-authored and remains unverified.' });
    annotation.value = s?.note || '';
    let annotationTimer;
    annotation.oninput = () => {
      const prior = saved[rKey] || {};
      if (annotation.value.trim() || prior.g) saved[rKey] = { ...prior, note: annotation.value, by: $('rev').value || prior.by || '', annotationUpdatedAt: new Date().toISOString() };
      else delete saved[rKey];
      persist(); stat();
      clearTimeout(annotationTimer);
      annotationTimer = setTimeout(() => { if (saved[rKey]?.g) void syncDecision(rKey); }, 700);
    };
    const row = el('div', { class: 'row' + (s?.g ? ' done' : '') },
      el('div', {}, el('span', { class: 'tag ' + (rq(r) ? 'q' : 'u') }, rq(r) ? 'source bytes bound' : 'unbound/stale'), el('b', {}, r.sourceRef)),
      ...(oldChoice ? [el('div', { class: 'meta' }, 'Previous browser choice found: ' + oldChoice.decision.g + ' (' + oldChoice.storageKey + '). It is preserved, but not counted or exported until reaffirmed from this row.', el('button', { type: 'button', onclick: () => {
        saved[rKey] = { ...oldChoice.decision, legacyRecovered: true, recoverySourceKey: oldChoice.storageKey };
        persist(); stat(); render();
      } }, 'Restore previous choice'))] : []),
      ...(s?.legacyRecovered ? [el('div', { class: 'meta' }, 'Recovered choice: ' + s.g + '. Recheck the current evidence before confirming.', el('button', { type: 'button', onclick: () => {
        saved[rKey] = { ...saved[rKey], legacyRecovered: false, at: new Date().toISOString(), blindAtDecision: $('blind').checked };
        persist(); needsTable(); stat(); if (syncAvailable) void syncDecision(rKey); render();
      } }, 'Reaffirm this choice'))] : []),
      el('div', { class: 'meta' }, keyLabel + (revealed ? weakLabel + ' | proposed: ' + propDomain + mapKind : ' | weak/proposed labels hidden') + ' | ' + statusMeta),
      el('div', { class: 'ev' }, evidence?.excerptText || evidenceStatusText(evidence)),
      ...(astPanel ? [astPanel] : []),
      el('div', { class: 'meta' }, ...(evidence?.supportingArguments || []).map((arg) => arg.kind + ': ' + (arg.value ?? '') + (arg.interpretation ? ' — ' + arg.interpretation : ''))),
      el('div', {}, sel),
      el('div', { class: 'support' },
        el('label', {}, 'Reviewer support-evidence annotation'),
        annotation,
        el('small', {}, s?.note?.trim() ? 'Saved locally; exported as unverified reviewer rationale.' : 'Optional. This does not change the source-evidence score or prove a claim.')));
    root.append(row);
  }
  $('stat').textContent = list.length + ' shown | ' + ($('stat').dataset.summary || '');
}
function stat() {
  const all = Object.values(saved).filter((v) => !!v.g && !v.legacyRecovered);
  const sourceBoundReviewed = D.rows.filter((r) => rq(r) && saved[kOf(r)]?.g && !saved[kOf(r)].legacyRecovered).length;
  const sourceDigestMatches = D.rows.filter(rq).length;
  const readableExcerpts = D.rows.filter((r) => !!evidenceOf(r)?.excerptText).length;
  const noReadableExcerpt = D.rows.length - readableExcerpts;
  const annotated = Object.values(saved).filter((v) => v.note?.trim() && !v.legacyRecovered).length;
  document.title = 'Domain Review Sheet - ' + all.length + ' reviewed';
  $('stat').dataset.summary = all.length + ' provisional decisions; 0 gold (workspace-revision and second-review gates open) | ' + sourceBoundReviewed + ' decisions on source-bound rows | ' + sourceDigestMatches + '/' + D.rows.length + ' source+digest matches (workspace revision not independently revalidated) | ' + readableExcerpts + ' readable excerpts, ' + noReadableExcerpt + ' without text excerpts | ' + annotated + ' notes saved | trust floor ' + D.trust.total;
}
function exportJsonl() {
  const out = D.rows.filter((r) => saved[kOf(r)]?.g && !saved[kOf(r)]?.legacyRecovered).map((r) => {
    const s = saved[kOf(r)];
    const exported = {
      ...r,
      reviewStatus: 'REVIEWED',
      reviewQualificationStatus: 'PROVISIONAL_REVIEW_ONLY',
      goldEligible: false,
      reviewedGroup: s.g,
      reviewMethod: s.blindAtDecision === true ? 'BLIND_HUMAN_REVIEW_V1' : 'VISIBLE_HUMAN_REVIEW',
      reviewer: s.by || $('rev').value || null,
      reviewedAt: s.at,
      supportEvidenceAnnotation: s.note || '',
      supportEvidenceAnnotationStatus: s.note?.trim() ? 'REVIEWER_AUTHORED_UNVERIFIED' : 'NONE',
      supportEvidenceAnnotationUpdatedAt: s.annotationUpdatedAt || null,
      textEvidence: sourceEvidenceByKey[kOf(r)]?.excerptText || '',
      domainReviewSourceEvidenceV1: sourceEvidenceByKey[kOf(r)] || null,
    };
    const evidence = sourceEvidenceByKey[kOf(r)];
    if (evidence && Number.isInteger(evidence.startByte) && Number.isInteger(evidence.endByte)) {
      exported.evidenceSpan = { byteStart: evidence.startByte, byteEnd: evidence.endByte };
    }
    if (D.tier === 'B') {
      delete exported.workspaceRevision;
      exported.tier = 'B';
      exported.canonical_authority = false;
    }
    return JSON.stringify(exported);
  });
  const blob = new Blob([out.join('\\n') + '\\n'], { type: 'application/x-ndjson' });
  const filename = D.exportFilename || (D.tier === 'B' ? 'tier-b-task-reviewed-v1.jsonl' : 'domain-calibration-reviewed-v1.jsonl');
  const a = el('a', { href: URL.createObjectURL(blob), download: filename }); a.click();
}
const groups = [...new Set(D.rows.map((r) => r.proposedDomain ?? r.proposedOntologyGroup).filter(Boolean))].sort();
for (const g of groups) $('fg').append(el('option', { value: g }, g));
['q', 'fq', 'fs', 'fg', 'blind'].forEach((id) => $(id).addEventListener('input', render));
$('exp').onclick = exportJsonl;
$('syncAll').onclick = () => { void syncAllLocalDecisions(); };
$('importChoices').onclick = () => $('importFile').click();
$('importFile').onchange = () => { void importPriorChoices($('importFile').files?.[0]); $('importFile').value = ''; };
needsTable(); stat(); render();
if (Object.keys(recoveredLegacy).length) setSyncStatus('Found ' + Object.keys(recoveredLegacy).length + ' earlier browser choices. Restore each from its row; none were changed, exported, or uploaded.');
void loadServerDecisions();
</script></body></html>`;

fs.writeFileSync(OUTPUT, html, 'utf8');
console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT), rows: rows.length, sourceBoundRows: qualified.length, bytes: html.length, writesPerformed: 'report file only' }));
