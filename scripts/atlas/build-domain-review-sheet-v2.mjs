#!/usr/bin/env node
/**
 * Builds the tidied, enriched v2 Domain Calibration Review Sheet HTML
 * from docs/reports/domain-calibration-gold-v2-enriched-v1.jsonl.
 *
 * Output: docs/reports/domain-calibration-gold-v2-review-sheet-v2.html
 * Adds:
 *   - pathCategory filter (EXISTING_SOURCE_FILE / MISSING_ON_DISK / NOISE_OR_EPHEMERAL)
 *   - 0-100% completenessScore badge + breakdown
 *   - rg symbol lines & moved-candidate hints
 *   - oaklib OBO term chips + semantic_768 / eg2 vector badges
 *   - Editable supportEvidenceAnnotation textarea persisted in localStorage and exported to JSONL
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argOf = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const INPUT = path.resolve(argOf('--input') || path.join(ROOT, 'docs/reports/domain-calibration-gold-v2-graphrag-v2.jsonl'));
const OUTPUT = path.resolve(argOf('--output') || path.join(ROOT, 'docs/reports/domain-calibration-gold-v2-review-sheet-v2.html'));

const TOP_LEVEL = ['api', 'auth', 'cache', 'compiler', 'database', 'devops', 'error-handling', 'frontend', 'gpu', 'graph', 'machine-learning', 'retrieval', 'test'];
const CHILDREN = ['database.postgresql', 'devops.env-config', 'devops.process-mgmt', 'frontend.sveltekit'];
const NON_GOLD = ['AMBIGUOUS', 'NOT_A_DOMAIN', 'SKIP'];

const rawBytes = fs.readFileSync(INPUT);
const inputSha256 = 'sha256:' + createHash('sha256').update(rawBytes).digest('hex');
const basePath = path.join(ROOT, 'docs/reports/domain-calibration-gold-v2.jsonl');
const baseDatasetSha256 = fs.existsSync(basePath)
  ? 'sha256:' + createHash('sha256').update(fs.readFileSync(basePath)).digest('hex')
  : inputSha256;
const rows = rawBytes.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

const payload = {
  generatedAt: new Date().toISOString(),
  inputSha256,
  baseDatasetSha256,
  storageKey: `domainReviewV2_${inputSha256.slice(7, 19)}`,
  exportFilename: 'domain-calibration-gold-v2-annotated-v2.jsonl',
  topLevel: TOP_LEVEL,
  children: CHILDREN,
  nonGold: NON_GOLD,
  rows,
};

const safeJson = JSON.stringify(payload).replace(/<\/script/gi, '<\\/script');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Domain Calibration Gold v2 — Enriched Review Sheet</title>
<style>
  :root { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #111827; background: #f8fafc; }
  body { margin: 0; padding: 18px 24px 60px; max-width: 1220px; margin-inline: auto; }
  h1 { margin: 0 0 6px; font-size: 20px; }
  .sub { color: #475569; font-size: 13px; margin-bottom: 14px; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; position: sticky; top: 8px; z-index: 10; box-shadow: 0 2px 6px rgba(15,23,42,.06); }
  .bar input[type="text"], .bar select { padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; }
  .bar button.p { background: #0f172a; color: #fff; border: 0; border-radius: 6px; padding: 7px 12px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .stat { margin: 12px 0; font-size: 13px; color: #334155; background: #eef2ff; border: 1px solid #c7d2fe; padding: 8px 12px; border-radius: 6px; }
  .row { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; }
  .row.done { border-left: 4px solid #16a34a; }
  .row.noise { opacity: 0.78; background: #f8fafc; }
  .hdr { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 6px; }
  .tag { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 999px; }
  .tag.exact { background: #dcfce7; color: #166534; }
  .tag.unres { background: #fef3c7; color: #92400e; }
  .tag.src { background: #dbeafe; color: #1e40af; }
  .tag.miss { background: #fee2e2; color: #991b1b; }
  .tag.noise { background: #e2e8f0; color: #475569; }
  .tag.sc-hi { background: #dcfce7; color: #166534; }
  .tag.sc-mid { background: #fef3c7; color: #92400e; }
  .tag.sc-lo { background: #fee2e2; color: #991b1b; }
  .tag.vec { background: #ede9fe; color: #5b21b6; }
  .tag.obo { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
  .meta { font-size: 12px; color: #475569; margin-bottom: 6px; }
  .ev { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; white-space: pre-wrap; margin-bottom: 8px; color: #1e293b; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
  .rec { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 7px 10px; margin-bottom: 8px; font-size: 12px; color: #14532d; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .rec button { background: #15803d; color: #fff; border: 0; border-radius: 5px; padding: 5px 10px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .controls { display: grid; grid-template-columns: 220px 1fr; gap: 8px; align-items: start; }
  .controls select { width: 100%; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; }
  .controls textarea { width: 100%; box-sizing: border-box; min-height: 54px; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; font-family: inherit; resize: vertical; }
</style>
</head>
<body>
<h1>Domain Calibration Gold v2 — Enriched Review Sheet (v2)</h1>
<div class="sub">Source: <code>docs/reports/domain-calibration-gold-v2-enriched-v1.jsonl</code> | Includes <code>rg</code> symbol evidence, <code>oaklib</code> OBO terms, PG18 vector flags, 0–100% completeness ranker, and editable Support Evidence annotations.</div>
<div class="bar">
  <input type="text" id="q" placeholder="Filter path, symbol, OBO term..." size="26">
  <select id="fp" aria-label="Path category">
    <option value="EXISTING_SOURCE_FILE">Actionable: Existing Source (242)</option>
    <option value="">All Paths (455)</option>
    <option value="MISSING_ON_DISK">Missing on Disk (61)</option>
    <option value="NOISE_OR_EPHEMERAL">Noise / Ephemeral (152)</option>
  </select>
  <select id="fr" aria-label="Resolution">
    <option value="">All Resolutions</option>
    <option value="BINDING_EXACT">BINDING_EXACT</option>
    <option value="UNRESOLVED">UNRESOLVED</option>
  </select>
  <select id="fc" aria-label="Completeness">
    <option value="">All Scores</option>
    <option value="gte75">Completeness &ge; 75%</option>
    <option value="lt50">Completeness &lt; 50%</option>
  </select>
  <label><input type="checkbox" id="blind" checked> Blind mode</label>
  <input type="text" id="rev" placeholder="Reviewer" size="10" aria-label="Reviewer">
  <input type="file" id="impFile" accept=".jsonl,.ndjson" hidden>
  <button type="button" id="impBtn">Import JSONL</button>
  <button class="p" id="exp">Export annotated JSONL</button>
</div>
<div class="stat" id="stat"></div>
<div id="list"></div>
<script id="d" type="application/json">${safeJson}</script>
<script>
const D = JSON.parse(document.getElementById('d').textContent);
const KEY = D.storageKey;
let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { saved = {}; }
const opts = [...D.topLevel, ...D.children, ...D.nonGold];
const $ = (id) => document.getElementById(id);
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {} };
const isHosted = location.protocol === 'http:' || location.protocol === 'https:';

async function syncServerDecisions() {
  if (!isHosted) return;
  try {
    const resp = await fetch('/api/admin/domain-calibration-reviews', { cache: 'no-store' });
    if (!resp.ok) return;
    const data = await resp.json();
    if (data && data.ok && data.decisions) {
      for (const [k, v] of Object.entries(data.decisions)) {
        saved[k] = { ...(saved[k] || {}), ...v };
      }
      persist();
      render();
    }
  } catch {}
}

async function saveDecisionToServer(r, choice, note) {
  if (!isHosted || !choice) return;
  try {
    await fetch('/api/admin/domain-calibration-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        datasetSha256: D.baseDatasetSha256,
        rowKey: r.stableKey || r.packetKey || r.id,
        packetKey: r.packetKey || null,
        sourceRef: r.canonicalSourceRef || r.sourceRef,
        choice,
        supportEvidence: (note || '').slice(0, 3000),
        blindAtDecision: $('blind').checked,
        sourceEvidenceStatus: r.pathCategory || null,
        currentSourceSha256: r.sourceRevision || null,
        excerptSha256: null,
        startByte: null,
        endByte: null,
      }),
    });
  } catch {}
}

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else e.setAttribute(k, v); }
  for (const kid of kids) e.append(kid);
  return e;
}

function scoreClass(s) { return s >= 75 ? 'sc-hi' : s >= 50 ? 'sc-mid' : 'sc-lo'; }
function pathClass(p) { return p === 'EXISTING_SOURCE_FILE' ? 'src' : p === 'MISSING_ON_DISK' ? 'miss' : 'noise'; }

function render() {
  const q = $('q').value.toLowerCase();
  const fp = $('fp').value;
  const fr = $('fr').value;
  const fc = $('fc').value;
  const blind = $('blind').checked;

  const filtered = D.rows.filter((r) => {
    if (fp && r.pathCategory !== fp) return false;
    if (fr && r.revisionResolution !== fr) return false;
    if (fc === 'gte75' && (r.completenessScore || 0) < 75) return false;
    if (fc === 'lt50' && (r.completenessScore || 0) >= 50) return false;
    const hay = [
      r.sourceRef, r.featureLabel, r.evidenceTextEnriched,
      ...(r.rgSupportingLines || []),
      ...((r.oaklibSupportingTerms || []).map((t) => t.id + ' ' + t.name)),
      ...(blind ? [] : [r.originalLabel, r.proposedOntologyGroup, r.reviewedGroup]),
    ].filter(Boolean).join(' ').toLowerCase();
    if (q && !hay.includes(q)) return false;
    return true;
  }).sort((a, b) => (b.completenessScore || 0) - (a.completenessScore || 0));

  const annotatedCount = D.rows.filter((r) => saved[r.packetKey]?.note?.trim()).length;
  $('stat').textContent = 'Showing ' + filtered.length + ' / ' + D.rows.length + ' rows | Custom support-evidence annotations saved locally: ' + annotatedCount;

  const root = $('list');
  root.replaceChildren();
  for (const r of filtered) {
    const cur = saved[r.packetKey] || {};
    const sel = el('select', {}, el('option', { value: '' }, '- choose domain -'), ...opts.map((o) => el('option', { value: o }, o)));
    sel.value = cur.g !== undefined ? cur.g : (blind ? '' : (r.reviewedGroup || ''));
    sel.onchange = () => {
      saved[r.packetKey] = { ...cur, g: sel.value, by: $('rev').value || cur.by || '', at: new Date().toISOString() };
      persist();
      saveDecisionToServer(r, sel.value, ta.value);
      render();
    };

    const ta = el('textarea', { placeholder: 'Annotate support evidence (symbols, OBO rationale, moved path, or skip reason)...' });
    ta.value = cur.note !== undefined ? cur.note : (r.evidenceTextEnriched || '');
    ta.onchange = () => {
      saved[r.packetKey] = { ...cur, g: sel.value, note: ta.value, by: $('rev').value || cur.by || '', at: new Date().toISOString() };
      persist();
      $('stat').textContent = 'Showing ' + filtered.length + ' / ' + D.rows.length + ' rows | Custom support-evidence annotations saved locally: ' + D.rows.filter((x) => saved[x.packetKey]?.note?.trim()).length;
    };

    const hdr = el('div', { class: 'hdr' },
      el('span', { class: 'tag ' + (r.revisionResolution === 'BINDING_EXACT' ? 'exact' : 'unres') }, r.revisionResolution),
      el('span', { class: 'tag ' + pathClass(r.pathCategory) }, r.pathCategory),
      el('span', { class: 'tag ' + scoreClass(r.completenessScore || 0) }, (r.completenessScore || 0) + '% complete'),
      r.hasSemantic768Vector ? el('span', { class: 'tag vec' }, 'semantic_768') : '',
      r.hasEg2Vector ? el('span', { class: 'tag vec' }, 'eg2') : '',
      el('b', {}, r.sourceRef),
    );

    const metaText = r.packetKey + ' | feature: ' + (r.featureLabel || '—') +
      (blind && !cur.g ? ' | labels hidden (blind mode)' : ' | proposed: ' + (r.proposedOntologyGroup || 'none') + ' | reviewed: ' + (r.reviewedGroup || 'none')) +
      (r.rawEvidenceScaffoldContaminated ? ' | [SCAFFOLD_CONTAMINATED_RAW_SUMMARY_STRIPPED]' : '');

    const chips = el('div', { class: 'chips' }, ...(r.oaklibSupportingTerms || []).map((t) => el('span', { class: 'tag obo' }, t.id + ' ' + t.name)));

    let evText = '';
    if (r.rgSupportingLines && r.rgSupportingLines.length) {
      evText = 'rg symbols:\\n' + r.rgSupportingLines.join('\\n');
    } else if (r.pathCategory === 'MISSING_ON_DISK') {
      evText = 'Missing on disk. rg moved-path candidates (' + (r.rgMovedCandidateCount || 0) + '): ' + ((r.rgMovedCandidateSamples || []).join(', ') || 'none');
    } else if (r.evidenceTextEnriched) {
      evText = r.evidenceTextEnriched;
    } else {
      evText = '(no clean source-grounded evidence yet — add support evidence annotation below)';
    }

    const rec = r.graphRagRecommendation;
    const nbrs = r.graphRagNeighbors || [];
    const recBox = rec ? el('div', { class: 'rec' },
      el('div', {},
        el('b', {}, 'GraphRAG Rec: ' + rec.recommendedDomain + ' (' + Math.round((rec.confidence || 0) * 100) + '%)'),
        ' — ' + rec.rationale + (nbrs.length ? ' | Neighbors: ' + nbrs.map((n) => n.targetFeatureId + ' (' + n.relationshipType + ')').join(', ') : '')
      ),
      (() => {
        const b = el('button', { type: 'button' }, 'Accept Rec + Evidence');
        b.onclick = () => {
          const nextNote = cur.note?.trim() ? cur.note : (rec.suggestedSupportEvidence || r.evidenceTextEnriched || '');
          saved[r.packetKey] = { ...cur, g: rec.recommendedDomain, note: nextNote, by: $('rev').value || cur.by || '', at: new Date().toISOString() };
          persist();
          saveDecisionToServer(r, rec.recommendedDomain, nextNote);
          render();
        };
        return b;
      })()
    ) : '';

    const card = el('div', { class: 'row' + (cur.g ? ' done' : '') + (r.pathCategory === 'NOISE_OR_EPHEMERAL' ? ' noise' : '') },
      hdr,
      el('div', { class: 'meta' }, metaText),
      chips,
      recBox,
      el('div', { class: 'ev' }, evText),
      el('div', { class: 'controls' }, sel, ta),
    );
    root.append(card);
  }
}

['q', 'fp', 'fr', 'fc', 'blind'].forEach((id) => $(id).addEventListener('input', render));
$('impBtn').onclick = () => $('impFile').click();
$('impFile').onchange = async () => {
  const file = $('impFile').files && $('impFile').files[0];
  if (!file) return;
  const text = await file.text();
  let imported = 0;
  for (const line of text.split(/\\r?\\n/)) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const key = obj.stableKey || obj.packetKey || obj.rowKey || obj.id;
      const g = obj.reviewedGroup || obj.choice || obj.g || '';
      const note = obj.supportEvidenceAnnotation || obj.supportEvidence || obj.note || '';
      if (key && (g || note)) {
        saved[key] = { ...(saved[key] || {}), g, note, by: obj.reviewer || $('rev').value || '', at: obj.reviewedAt || new Date().toISOString(), importedUnconfirmed: true };
        imported += 1;
      }
    } catch {}
  }
  persist();
  render();
  alert('Imported ' + imported + ' local choices (review & confirm each before server sync).');
};
$('exp').onclick = () => {
  const lines = D.rows.map((r) => {
    const s = saved[r.packetKey] || {};
    return JSON.stringify({
      ...r,
      reviewedGroup: s.g || r.reviewedGroup,
      supportEvidenceAnnotation: s.note !== undefined ? s.note : (r.evidenceTextEnriched || ''),
      reviewer: s.by || r.reviewer,
      reviewedAt: s.at || r.reviewedAt,
    });
  }).join('\\n') + '\\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines], { type: 'application/x-ndjson' }));
  a.download = D.exportFilename;
  a.click();
};
render();
syncServerDecisions();
</script>
</body>
</html>`;

fs.writeFileSync(OUTPUT, html, 'utf8');
console.log(JSON.stringify({
  schema: 'atlas.domain-review-sheet-v2.build.v1',
  input: path.relative(ROOT, INPUT).replaceAll('\\', '/'),
  output: path.relative(ROOT, OUTPUT).replaceAll('\\', '/'),
  rows: rows.length,
  inputSha256,
}, null, 2));
