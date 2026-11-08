#!/usr/bin/env node
// Exports HUMAN-REVIEWED domain examples for the OKF learning notebook (python/atlas_okf_learning_colab/).
//
// Input : the JSONL exported by the domain review sheet (scripts/atlas/build-domain-review-sheet-v1.mjs), i.e. rows with
//         sourceRef, featureLabel, textEvidence, sourceRevision, workspaceRevision, reviewedGroup, reviewStatus, reviewer, reviewedAt
//         and optionally evidenceSpan {byteStart, byteEnd} and sourceGroup.
// Output: <out-dir>/atlas_reviewed_training_examples.jsonl (notebook format) + a receipt. Local files only.
//
// Rules (fail closed, never infer a label):
//  - The label must already be one of the NES palette domains (scripts/atlas/data/nes-domain-palette-v1.json). There is NO
//    translation from the review sheet's 13-group ontology (api, compiler, devops, ...) to the 10 palette domains: that
//    crosswalk is not an approved authority. Rows with any other label are rejected and counted by label.
//  - Needs a human review (REVIEWED/HUMAN_REVIEWED, named reviewer that is not a bot/test/model, reviewedAt).
//  - Needs a sha256 source revision and a workspace revision. Unless --allow-unverified-source, the source file must exist under
//    --root, hash to that revision, and any evidenceSpan must lie inside it.
//  - A source group labelled with two different domains is dropped entirely.
//  - AMBIGUOUS / NOT_A_DOMAIN / SKIP are counted, never exported.
// Exit: 0 READY_FOR_HELD_OUT_EVAL, 2 BLOCKED_NO_REVIEWED_INPUT / INSUFFICIENT_DATA, 3 palette checksum failure, 1 usage error.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIN_ROWS = 200;
const MIN_PER_CLASS = 30;
const MIN_GROUPS_PER_DOMAIN = 5;
const NON_GOLD = new Set(['AMBIGUOUS', 'NOT_A_DOMAIN', 'SKIP']);
const REVIEWED_STATUSES = new Set(['REVIEWED', 'HUMAN_REVIEWED']);
const NOT_HUMAN_REVIEWER = /^(test|bot|auto|model|llm|script|system)/i;
const SHA_REVISION = /^sha256:[0-9a-f]{64}$/;

const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const bump = (obj, key, n = 1) => { obj[key] = (obj[key] ?? 0) + n; };

export function verifyPaletteChecksum(palette) {
  const { checksum, ...body } = palette;
  const actual = `sha256:${sha256Hex(Buffer.from(JSON.stringify(body), 'utf8'))}`;
  return { ok: actual === checksum, actual, expected: checksum };
}

function resolveSource(root, sourceRef) {
  if (typeof sourceRef !== 'string' || !sourceRef || path.isAbsolute(sourceRef) || sourceRef.split(/[\\/]/).includes('..')) return null;
  const resolved = path.resolve(root, sourceRef);
  return resolved.startsWith(path.resolve(root) + path.sep) ? resolved : null;
}

/** Pure core: returns { rows, receipt }. No file writes. */
export function buildReviewedExport({ inputRows, palette, root, allowUnverifiedSource = false, requireAllDomains = true, inputSha256 = null }) {
  const domains = new Set(Object.keys(palette.domains));
  const rejected = {};
  const nonGold = {};
  const unmappedLabels = {};
  const accepted = [];
  const seenIds = new Set();

  for (const r of inputRows) {
    const label = r.reviewedGroup;
    if (typeof label === 'string' && NON_GOLD.has(label)) { bump(nonGold, label); continue; }
    if (!REVIEWED_STATUSES.has(r.reviewStatus)) { bump(rejected, 'NOT_HUMAN_REVIEWED_STATUS'); continue; }
    if (typeof r.reviewer !== 'string' || !r.reviewer.trim() || NOT_HUMAN_REVIEWER.test(r.reviewer.trim()) || !r.reviewedAt) { bump(rejected, 'REVIEWER_MISSING_OR_NOT_HUMAN'); continue; }
    if (typeof label !== 'string' || !domains.has(label)) { bump(rejected, 'DOMAIN_NOT_IN_NES_PALETTE'); bump(unmappedLabels, String(label)); continue; }
    if (!SHA_REVISION.test(String(r.sourceRevision ?? ''))) { bump(rejected, 'SOURCE_REVISION_MISSING_OR_INVALID'); continue; }
    if (typeof r.workspaceRevision !== 'string' || !r.workspaceRevision.trim()) { bump(rejected, 'WORKSPACE_REVISION_MISSING'); continue; }
    const text = String(r.textEvidence ?? r.text ?? '').trim();
    const featureLabel = String(r.featureLabel ?? '').trim();
    if (!text || !featureLabel || typeof r.sourceRef !== 'string' || !r.sourceRef) { bump(rejected, 'TEXT_OR_LABEL_MISSING'); continue; }

    if (!allowUnverifiedSource) {
      const file = resolveSource(root, r.sourceRef);
      if (!file) { bump(rejected, 'SOURCE_REF_UNSAFE'); continue; }
      let bytes;
      try { bytes = fs.readFileSync(file); } catch { bump(rejected, 'SOURCE_UNREADABLE'); continue; }
      if (`sha256:${sha256Hex(bytes)}` !== r.sourceRevision) { bump(rejected, 'SOURCE_REVISION_MISMATCH'); continue; }
      const span = r.evidenceSpan;
      if (span !== undefined && span !== null) {
        const ok = Number.isInteger(span.byteStart) && Number.isInteger(span.byteEnd) && span.byteStart >= 0 && span.byteStart < span.byteEnd && span.byteEnd <= bytes.length;
        if (!ok) { bump(rejected, 'EVIDENCE_SPAN_INVALID'); continue; }
      }
    }

    const id = `${r.sourceRef}#${sha256Hex(Buffer.from(text, 'utf8')).slice(0, 12)}`;
    if (seenIds.has(id)) { bump(rejected, 'DUPLICATE_ID'); continue; }
    seenIds.add(id);
    accepted.push({
      id, text, feature_label: featureLabel, domain: label, source_ref: r.sourceRef,
      source_group: String(r.sourceGroup ?? r.sourceRef), source_revision: r.sourceRevision,
      workspace_revision: r.workspaceRevision, label_status: 'REVIEWED',
      reviewer: r.reviewer, reviewed_at: r.reviewedAt, ...(r.evidenceSpan ? { evidence_span: r.evidenceSpan } : {}),
    });
  }

  // A source group labelled with two domains is ambiguous: drop all of its rows.
  const domainsOfGroup = new Map();
  for (const a of accepted) { if (!domainsOfGroup.has(a.source_group)) domainsOfGroup.set(a.source_group, new Set()); domainsOfGroup.get(a.source_group).add(a.domain); }
  const conflicted = new Set([...domainsOfGroup].filter(([, d]) => d.size > 1).map(([g]) => g));
  const rows = accepted.filter((a) => !conflicted.has(a.source_group));
  if (conflicted.size) bump(rejected, 'SOURCE_GROUP_DOMAIN_CONFLICT', accepted.length - rows.length);

  const perDomain = {};
  const groupsPerDomain = {};
  for (const a of rows) bump(perDomain, a.domain);
  for (const d of Object.keys(perDomain)) groupsPerDomain[d] = new Set(rows.filter((a) => a.domain === d).map((a) => a.source_group)).size;

  // Every governed palette domain must be represented (unless the caller relaxes it, and the receipt records that). With 10 domains the per-class floor
  // of 30 already implies 300 rows; the separate 200-row minimum is a lower bound, not the binding constraint.
  const requiredDomains = requireAllDomains ? [...domains] : Object.keys(perDomain);
  const missingDomains = requiredDomains.filter((d) => !perDomain[d]);
  let status;
  if (rows.length === 0) status = 'BLOCKED_NO_REVIEWED_INPUT';
  else if (rows.length < MIN_ROWS || missingDomains.length > 0 || Math.min(...Object.values(perDomain)) < MIN_PER_CLASS || Math.min(...Object.values(groupsPerDomain)) < MIN_GROUPS_PER_DOMAIN) status = 'INSUFFICIENT_DATA';
  else status = 'READY_FOR_HELD_OUT_EVAL';

  const receipt = {
    schema: 'atlas.okf.reviewed-export-receipt.v1',
    generatedAt: new Date().toISOString(),
    status,
    inputRows: inputRows.length, inputSha256,
    exportedRows: rows.length, perDomain, groupsPerDomain,
    rejected, nonGold, unmappedLabels,
    unmappedLabelsNote: 'Labels outside the NES palette are never translated. The review sheet uses a 13-group ontology; no approved crosswalk to the 10 palette domains exists.',
    droppedConflictingGroups: [...conflicted],
    paletteRevision: palette.revision, paletteChecksum: palette.checksum,
    sourceVerification: allowUnverifiedSource ? 'SKIPPED_BY_FLAG' : 'SOURCE_BYTES_HASHED',
    gate: { minRows: MIN_ROWS, minPerClass: MIN_PER_CLASS, minGroupsPerDomain: MIN_GROUPS_PER_DOMAIN, requireAllDomains, missingDomains, impliedMinimumRows: requireAllDomains ? MIN_PER_CLASS * domains.size : MIN_ROWS },
    canonicalAuthority: false, writesPerformed: false, localArtifactsWritten: true,
  };
  return { rows, receipt };
}

function main() {
  const argOf = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const input = argOf('--input');
  if (!input) { console.error('usage: --input <review-export.jsonl> [--palette <file>] [--root <repo root>] [--out-dir <dir>] [--allow-unverified-source]'); process.exit(1); }
  const root = path.resolve(argOf('--root') ?? path.join(HERE, '..', '..'));
  const palettePath = path.resolve(argOf('--palette') ?? path.join(HERE, 'data', 'nes-domain-palette-v1.json'));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const outDir = path.resolve(argOf('--out-dir') ?? path.join(root, '.tmp', 'atlas', `okf-reviewed-export-${stamp}`));

  const palette = JSON.parse(fs.readFileSync(palettePath, 'utf8'));
  const pc = verifyPaletteChecksum(palette);
  if (!pc.ok) { console.error(`BLOCKED_PALETTE_CHECKSUM: expected ${pc.expected}, got ${pc.actual}`); process.exit(3); }

  const raw = fs.readFileSync(path.resolve(input));
  const inputRows = raw.toString('utf8').split('\n').filter((l) => l.trim()).map((l, i) => { try { return JSON.parse(l); } catch { console.error(`input line ${i + 1} is not JSON`); process.exit(1); } });
  const { rows, receipt } = buildReviewedExport({ inputRows, palette, root, allowUnverifiedSource: process.argv.includes('--allow-unverified-source'), requireAllDomains: !process.argv.includes('--allow-missing-domains'), inputSha256: `sha256:${sha256Hex(raw)}` });

  fs.mkdirSync(outDir, { recursive: true });
  if (rows.length) fs.writeFileSync(path.join(outDir, 'atlas_reviewed_training_examples.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(outDir, 'reviewed-export-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(`${receipt.status}: ${rows.length}/${inputRows.length} rows exported -> ${outDir}`);
  console.log('rejected:', JSON.stringify(receipt.rejected), 'nonGold:', JSON.stringify(receipt.nonGold));
  process.exit(receipt.status === 'READY_FOR_HELD_OUT_EVAL' ? 0 : 2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
