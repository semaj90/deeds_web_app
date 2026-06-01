#!/usr/bin/env node
/**
 * validate-knowledge-cards.mjs
 *
 * Read-only validator for card.ndjson knowledge consolidation sets.
 * Streams NDJSON line by line — never modifies the input file.
 *
 * Outputs:
 *   .tmp/knowledge-card-validation.json
 *   .tmp/knowledge-card-validation.md
 *
 * Usage:
 *   node scripts/atlas/validate-knowledge-cards.mjs [--card-file <path>]
 */

import { createReadStream, existsSync, mkdirSync, writeFileSync, statSync } from 'fs';
import { createInterface } from 'readline';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const cardFileArgIdx = args.indexOf('--card-file');
const cardFileArg = cardFileArgIdx >= 0 ? args[cardFileArgIdx + 1] : null;

const CARD_FILE_CANDIDATES = [
  join(REPO_ROOT, '.tmp', 'ingest', 'lanes', 'card.ndjson'),
  join(REPO_ROOT, 'sveltekit-frontend', 'memory', 'knowledge', 'document-knowledge-cards.jsonl'),
  join(REPO_ROOT, 'sveltekit-frontend', 'memory', 'exports', 'feature-map-cards.jsonl'),
  join(REPO_ROOT, 'consolidated-index.ndjson'),
];

const CARD_FILE = cardFileArg
  ? resolve(REPO_ROOT, cardFileArg)
  : CARD_FILE_CANDIDATES.find(f => existsSync(f) && statSync(f).size > 100);

const OUT_DIR = join(REPO_ROOT, '.tmp');
mkdirSync(OUT_DIR, { recursive: true });

const GENERATED_DIRS = new Set([
  '.svelte-kit', 'node_modules', '.tmp', 'build', 'dist', '.git',
  'deeds_labs', 'tmp', 'out',
]);

console.log(`\n🔍 Knowledge Card Validator`);
console.log(`════════════════════════════════════════`);
console.log(`Card file: ${CARD_FILE ?? 'NOT FOUND'}`);
console.log(`Repo root: ${REPO_ROOT}\n`);

if (!CARD_FILE || !existsSync(CARD_FILE)) {
  console.error('❌ No card.ndjson found. Tried:\n' + CARD_FILE_CANDIDATES.map(f => '  ' + f).join('\n'));
  process.exit(1);
}

const stats = {
  card_file: CARD_FILE.replace(REPO_ROOT + '\\', '').replace(REPO_ROOT + '/', ''),
  total_cards: 0,
  cards_with_direct_source_ref: 0,
  cards_with_source_ref_array: 0,
  cards_with_source_ref_like_field: 0,
  cards_with_only_som_bmu_index: 0,
  cards_with_uuid_title: 0,
  cards_missing_any_ref: 0,
  source_refs_checked: 0,
  source_refs_existing_on_disk: 0,
  source_refs_missing_on_disk: 0,
  source_refs_outside_repo: 0,
  source_refs_pointing_to_generated_dirs: 0,
  cards_with_feature_id: 0,
  cards_with_workspace_task_id: 0,
  cards_with_embedding_metadata: 0,
  cards_with_model_version: 0,
  cards_with_qdrant_point_id: 0,
  parse_errors: 0,
};

const topSourceRefs = new Map();
const missingRefs = new Map();
const uuidTitles = [];
const featureIds = new Map();
const workspaceTaskIds = new Map();

const UUID_TITLE_RE = /^[0-9a-f]{8,16}$/i;
const CHUNK_REF_RE = /#chunk-\d+$/;

function stripChunk(ref) {
  return ref.replace(CHUNK_REF_RE, '');
}

function isGeneratedDir(ref) {
  return ref.split(/[/\\]/).some(p => GENERATED_DIRS.has(p));
}

function checkRefOnDisk(ref) {
  if (!ref) return 'empty';
  const clean = stripChunk(ref).replace(/^sveltekit-frontend[\\/]/, '');
  const candidates = [
    join(REPO_ROOT, ref),
    join(REPO_ROOT, 'sveltekit-frontend', clean),
    join(REPO_ROOT, clean),
  ];
  return candidates.some(p => existsSync(p)) ? 'exists' : 'missing';
}

function processCard(card) {
  stats.total_cards++;

  const payload = (() => {
    try { return card.payload_json ? JSON.parse(card.payload_json) : (card.payload ?? {}); }
    catch { return {}; }
  })();

  const directRef = typeof card.sourceRef === 'string' ? card.sourceRef.trim() : '';
  const refArray = Array.isArray(card.sourceRefs) ? card.sourceRefs.filter(Boolean) : [];
  const hasSourceRefLike = Object.keys(card).some(k =>
    k.toLowerCase().includes('sourceref') || k === 'source_ref' || k === 'path' || k === 'file'
  );

  if (directRef) {
    if (!CHUNK_REF_RE.test(directRef)) {
      stats.cards_with_direct_source_ref++;
    }
    topSourceRefs.set(directRef, (topSourceRefs.get(directRef) ?? 0) + 1);
    stats.source_refs_checked++;
    const base = stripChunk(directRef);
    if (isGeneratedDir(base)) {
      stats.source_refs_pointing_to_generated_dirs++;
    } else if (/^https?:\/\//.test(base)) {
      stats.source_refs_outside_repo++;
    } else {
      if (checkRefOnDisk(base) === 'exists') {
        stats.source_refs_existing_on_disk++;
      } else {
        stats.source_refs_missing_on_disk++;
        const pattern = base.replace(/[0-9a-f]{8,}/gi, '<id>').slice(0, 60);
        missingRefs.set(pattern, (missingRefs.get(pattern) ?? 0) + 1);
      }
    }
  }

  if (refArray.length > 0) stats.cards_with_source_ref_array++;
  if (hasSourceRefLike) stats.cards_with_source_ref_like_field++;

  if (payload.som_bmu_index !== undefined && !directRef && refArray.length === 0) {
    stats.cards_with_only_som_bmu_index++;
  }

  const title = String(card.title ?? card.node_id ?? '');
  if (UUID_TITLE_RE.test(title)) {
    stats.cards_with_uuid_title++;
    if (uuidTitles.length < 20) uuidTitles.push(title);
  }

  if (!directRef && refArray.length === 0 && !card.path && !card.file) {
    stats.cards_missing_any_ref++;
  }

  const featureId = card.feature_id ?? payload.feature_id ?? card.featureId;
  if (featureId) {
    stats.cards_with_feature_id++;
    featureIds.set(featureId, (featureIds.get(featureId) ?? 0) + 1);
  }

  const taskId = card.workspace_task_id ?? payload.workspace_task_id ?? card.taskId;
  if (taskId) {
    stats.cards_with_workspace_task_id++;
    workspaceTaskIds.set(taskId, (workspaceTaskIds.get(taskId) ?? 0) + 1);
  }

  if (card.embedding ?? payload.embedding ?? card.vector) stats.cards_with_embedding_metadata++;
  if (card.model_version ?? payload.model_version ?? card.modelVersion) stats.cards_with_model_version++;
  if (card.qdrant_point_id ?? payload.qdrant_point_id ?? card.pointId) stats.cards_with_qdrant_point_id++;
}

const rl = createInterface({ input: createReadStream(CARD_FILE), crlfDelay: Infinity });
await new Promise(res => {
  rl.on('line', line => {
    const t = line.trim();
    if (!t) return;
    try { processCard(JSON.parse(t)); }
    catch { stats.parse_errors++; }
  });
  rl.on('close', res);
});

function topN(map, n = 10) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ value: k, count: v }));
}

const validRefPct = stats.source_refs_checked > 0
  ? ((stats.source_refs_existing_on_disk / stats.source_refs_checked) * 100).toFixed(1)
  : '0.0';

const result = {
  generated_at: new Date().toISOString(),
  card_file: stats.card_file,
  summary: {
    total_cards: stats.total_cards,
    parse_errors: stats.parse_errors,
    valid_source_ref_pct: parseFloat(validRefPct),
  },
  ref_coverage: {
    cards_with_direct_source_ref: stats.cards_with_direct_source_ref,
    cards_with_source_ref_array: stats.cards_with_source_ref_array,
    cards_with_source_ref_like_field: stats.cards_with_source_ref_like_field,
    cards_with_only_som_bmu_index: stats.cards_with_only_som_bmu_index,
    cards_with_uuid_title: stats.cards_with_uuid_title,
    cards_missing_any_ref: stats.cards_missing_any_ref,
  },
  disk_check: {
    source_refs_checked: stats.source_refs_checked,
    source_refs_existing_on_disk: stats.source_refs_existing_on_disk,
    source_refs_missing_on_disk: stats.source_refs_missing_on_disk,
    source_refs_outside_repo: stats.source_refs_outside_repo,
    source_refs_pointing_to_generated_dirs: stats.source_refs_pointing_to_generated_dirs,
    valid_ref_pct: parseFloat(validRefPct),
  },
  identity_fields: {
    cards_with_feature_id: stats.cards_with_feature_id,
    cards_with_workspace_task_id: stats.cards_with_workspace_task_id,
    cards_with_embedding_metadata: stats.cards_with_embedding_metadata,
    cards_with_model_version: stats.cards_with_model_version,
    cards_with_qdrant_point_id: stats.cards_with_qdrant_point_id,
  },
  top_source_refs: topN(topSourceRefs),
  top_missing_ref_patterns: topN(missingRefs),
  top_uuid_titles: uuidTitles.slice(0, 10),
  top_feature_ids: topN(featureIds),
  top_workspace_task_ids: topN(workspaceTaskIds),
};

const jsonOut = join(OUT_DIR, 'knowledge-card-validation.json');
writeFileSync(jsonOut, JSON.stringify(result, null, 2));

const pct = (n, d) => d > 0 ? ((n / d) * 100).toFixed(1) + '%' : '0.0%';
const T = stats.total_cards;

const md = `# Knowledge Card Validation Report

**Generated**: ${result.generated_at}
**Card file**: \`${result.card_file}\`

---

## Summary

| Metric | Value |
|--------|-------|
| Total cards | ${T.toLocaleString()} |
| Parse errors | ${stats.parse_errors} |
| Valid sourceRef % (disk check) | **${validRefPct}%** |

---

## sourceRef Coverage

| Category | Count | % of total |
|----------|-------|------------|
| Direct sourceRef (no \`#chunk\` suffix) | ${stats.cards_with_direct_source_ref} | ${pct(stats.cards_with_direct_source_ref, T)} |
| sourceRefs array present | ${stats.cards_with_source_ref_array} | ${pct(stats.cards_with_source_ref_array, T)} |
| Any sourceRef-like field | ${stats.cards_with_source_ref_like_field} | ${pct(stats.cards_with_source_ref_like_field, T)} |
| SOM BMU index only (no path ref) | ${stats.cards_with_only_som_bmu_index} | ${pct(stats.cards_with_only_som_bmu_index, T)} |
| UUID-only title (no meaningful ref) | ${stats.cards_with_uuid_title} | ${pct(stats.cards_with_uuid_title, T)} |
| **Missing any ref** | **${stats.cards_missing_any_ref}** | **${pct(stats.cards_missing_any_ref, T)}** |

---

## Disk Presence Check

| Metric | Count |
|--------|-------|
| sourceRefs checked | ${stats.source_refs_checked} |
| Existing on disk ✅ | ${stats.source_refs_existing_on_disk} (${validRefPct}%) |
| Missing on disk ❌ | ${stats.source_refs_missing_on_disk} |
| External URLs (skipped) | ${stats.source_refs_outside_repo} |
| Pointing to generated dirs | ${stats.source_refs_pointing_to_generated_dirs} |

---

## Identity Fields

| Field | Cards with it |
|-------|--------------|
| feature_id | ${stats.cards_with_feature_id} |
| workspace_task_id | ${stats.cards_with_workspace_task_id} |
| embedding metadata | ${stats.cards_with_embedding_metadata} |
| model_version | ${stats.cards_with_model_version} |
| qdrant_point_id | ${stats.cards_with_qdrant_point_id} |

---

## Top sourceRefs

${result.top_source_refs.length ? result.top_source_refs.map(r => `- \`${r.value}\` (×${r.count})`).join('\n') : '_none_'}

---

## Top Missing Ref Patterns

${result.top_missing_ref_patterns.length ? result.top_missing_ref_patterns.map(r => `- \`${r.value}\` (×${r.count})`).join('\n') : '_none_'}

---

## Top UUID Titles

${result.top_uuid_titles.length ? result.top_uuid_titles.map(t => `- \`${t}\``).join('\n') : '_none_'}

---

## Top Feature IDs

${result.top_feature_ids.length ? result.top_feature_ids.map(r => `- \`${r.value}\` (×${r.count})`).join('\n') : '_none_'}

---

## Top Workspace Task IDs

${result.top_workspace_task_ids.length ? result.top_workspace_task_ids.map(r => `- \`${r.value}\` (×${r.count})`).join('\n') : '_none_'}
`;

const mdOut = join(OUT_DIR, 'knowledge-card-validation.md');
writeFileSync(mdOut, md);

console.log(`✅ JSON:     ${jsonOut}`);
console.log(`✅ Markdown: ${mdOut}`);
console.log(`\n📊 Total cards:         ${T.toLocaleString()}`);
console.log(`   Direct sourceRefs:   ${stats.cards_with_direct_source_ref}`);
console.log(`   UUID-only titles:    ${stats.cards_with_uuid_title}`);
console.log(`   Valid path %:        ${validRefPct}%`);
console.log(`   Missing any ref:     ${stats.cards_missing_any_ref}`);
