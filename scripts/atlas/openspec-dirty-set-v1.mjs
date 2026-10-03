#!/usr/bin/env node
// OPENSPEC-DAILY-ANALYSIS-01A: revision-independent, read-only dirty-set for OpenSpec EvidenceCards.
// Runs standalone and as the runner stage EVF-05B_DIRTY_SET (run-openspec-evidence-fabric-v1.mjs).
//
// Why not card.checksum: the generated card embeds `REVISION workspace=... source=...` in its
// contextBlob and hashes the revisions into `cardId` and `checksum`, so a change anywhere in the
// workspace would mark every card dirty. This tool hashes the semantic content only and keeps the
// revisions as separate, informational fields (`cardChecksumChanged` is reported, never a cause).
//
// Read-only by default. Writes: the optional receipt (OPENSPEC_DIRTY_SET_OUTPUT / --output) and,
// only with --write-snapshot, the baseline under .tmp/atlas/openspec-dirty/. No Postgres / Qdrant /
// Valkey / tasks.md writes.
//
//   node scripts/atlas/openspec-dirty-set-v1.mjs [--cards file] [--baseline file] [--output file]
//        [--write-snapshot] [--representations 5]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMBEDDING_INPUT_RECIPE_REVISION, normalizeCardText } from './lib/openspec-embedding-input-v1.mjs';

export const SNAPSHOT_SCHEMA = 'atlas.openspec-dirty-snapshot.v1';
export const RECEIPT_SCHEMA = 'atlas.openspec-dirty-set-receipt.v1';
// The text recipe lives in one place (lib/openspec-embedding-input-v1.mjs); a bump there makes
// every card dirty here.
export const RECIPE_REVISION = EMBEDDING_INPUT_RECIPE_REVISION;
// Bump when the snapshot entry shape or the way hashes are composed changes. An older baseline is
// then incompatible: it is re-baselined (everything treated dirty), never compared hash-to-hash.
export const HASH_FORMAT = 2;
// Reasons that need an input this repo does not yet produce. Reported as null, never as 0.
export const UNTRACKED_REASONS = ['extractorRevisionChanged', 'ontologyRevisionChanged', 'featureRevisionChanged'];
const KEY_LIST_CAP = 500;

const sha256 = (text) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The text that would be embedded: the card context minus the volatile revision suffix. */
export function embeddingText(card) {
  return normalizeCardText(card.contextBlob);
}

/** Component hashes, so a dirty card can be attributed to a cause. */
export function partHashes(card) {
  return {
    task: sha256(canonicalJson({
      task: card.taskIdentity?.canonicalTaskRef ?? null,
      changeId: card.taskIdentity?.changeId ?? null,
      claim: card.claim ?? null,
      predicates: (card.predicates ?? []).map((p) => ({ status: p.status, text: p.text }))
    })),
    receipts: sha256(canonicalJson({
      proofState: card.proofState ?? null,
      blockers: card.blockers ?? [],
      contradictions: card.contradictions ?? [],
      dependencyRefs: card.dependencyRefs ?? [],
      receiptRefs: card.receiptRefs ?? []
    })),
    text: sha256(embeddingText(card))
  };
}

/** Hash of everything semantic about a card, and nothing that changes with a workspace revision. */
export function contentHash(card) {
  return sha256(canonicalJson({ recipe: RECIPE_REVISION, parts: partHashes(card) }));
}

export function cardKey(card) {
  return `${card.taskIdentity?.taskRef ?? ''}|${card.taskIdentity?.canonicalTaskRef ?? ''}`;
}

export function buildSnapshot(cards) {
  const entries = {};
  const duplicateKeys = [];
  for (const card of cards) {
    const key = cardKey(card);
    if (key in entries) duplicateKeys.push(key);
    entries[key] = { content: contentHash(card), parts: partHashes(card), card: card.checksum ?? null };
  }
  return { schema: SNAPSHOT_SCHEMA, hashFormat: HASH_FORMAT, recipeRevision: RECIPE_REVISION, count: cards.length, duplicateKeys: [...new Set(duplicateKeys)].sort(), entries };
}

const emptyReasons = () => ({
  cardChecksumChanged: 0,
  taskRevisionChanged: 0,
  receiptRevisionChanged: 0,
  embeddingTextChanged: 0,
  embeddingRecipeChanged: 0,
  unattributed: 0,
  ...Object.fromEntries(UNTRACKED_REASONS.map((r) => [r, null]))
});

/** Pure diff. With no baseline, everything is dirty (initial full build). */
export function diffSnapshots(previous, current, { representations = 5 } = {}) {
  const keys = Object.keys(current.entries).sort();
  const reasons = emptyReasons();
  if (!previous) {
    reasons.cardChecksumChanged = keys.length;
    return { status: 'NO_BASELINE_FULL_BUILD', added: keys.length, removed: 0, modified: 0, unchanged: 0, reasons, dirtyCards: keys.length, dirtyRepresentations: keys.length * representations, dirtyKeys: keys };
  }
  if ((previous.hashFormat ?? 1) !== current.hashFormat) {
    reasons.unattributed = keys.length;
    return { status: 'BASELINE_FORMAT_CHANGED_REBASELINE', added: 0, removed: 0, modified: keys.length, unchanged: 0, reasons, dirtyCards: keys.length, dirtyRepresentations: keys.length * representations, dirtyKeys: keys };
  }
  if (previous.recipeRevision !== current.recipeRevision) {
    reasons.embeddingRecipeChanged = keys.length;
    reasons.cardChecksumChanged = keys.length;
    return { status: 'RECIPE_CHANGED_FULL_REBUILD', added: 0, removed: 0, modified: keys.length, unchanged: 0, reasons, dirtyCards: keys.length, dirtyRepresentations: keys.length * representations, dirtyKeys: keys };
  }
  let added = 0, modified = 0, unchanged = 0;
  const dirtyKeys = [];
  for (const key of keys) {
    const before = previous.entries[key];
    const now = current.entries[key];
    if (!before) { added += 1; dirtyKeys.push(key); reasons.cardChecksumChanged += 1; continue; }
    if (before.card !== now.card) reasons.cardChecksumChanged += 1;
    if (before.content === now.content) { unchanged += 1; continue; }
    modified += 1;
    dirtyKeys.push(key);
    if (!before.parts) { reasons.unattributed += 1; continue; }
    let attributed = false;
    if (before.parts.task !== now.parts.task) { reasons.taskRevisionChanged += 1; attributed = true; }
    if (before.parts.receipts !== now.parts.receipts) { reasons.receiptRevisionChanged += 1; attributed = true; }
    if (before.parts.text !== now.parts.text) { reasons.embeddingTextChanged += 1; attributed = true; }
    if (!attributed) reasons.unattributed += 1;
  }
  const removed = Object.keys(previous.entries).filter((k) => !(k in current.entries)).length;
  const dirtyCards = added + modified;
  return { status: dirtyCards || removed ? 'DIRTY' : 'CLEAN', added, removed, modified, unchanged, reasons, dirtyCards, dirtyRepresentations: dirtyCards * representations, dirtyKeys };
}

/** OpenSpecDirtySetReceiptV1 plus the phase block the runner merges into its stage record. */
export function buildDirtySetReceipt({ previous, current, diff, report }) {
  const sourceRevision = report?.source?.workspaceRevision ?? null;
  const cardUniverseChecksum = sha256(Object.keys(current.entries).sort().join('\n'));
  const dirtyKeysChecksum = sha256(diff.dirtyKeys.join('\n'));
  return {
    schema: RECEIPT_SCHEMA,
    status: diff.status,
    sourceRevision,
    cardUniverseChecksum,
    recipeRevision: current.recipeRevision,
    baselineRevision: previous?.capturedFrom?.workspaceRevision ?? null,
    totalCards: current.count,
    dirtyCards: diff.dirtyCards,
    unchangedCards: diff.unchanged,
    addedCards: diff.added,
    removedCards: diff.removed,
    modifiedCards: diff.modified,
    dirtyRepresentations: diff.dirtyRepresentations,
    reasons: diff.reasons,
    untrackedReasons: UNTRACKED_REASONS,
    duplicateKeys: current.duplicateKeys.length,
    dirtyKeysChecksum,
    dirtyKeys: diff.dirtyKeys.slice(0, KEY_LIST_CAP),
    dirtyKeysTruncated: diff.dirtyKeys.length > KEY_LIST_CAP,
    phaseReceipt: {
      phase: 'EVF-05B_DIRTY_SET',
      inputRevision: sourceRevision,
      outputRevision: dirtyKeysChecksum,
      inputCount: current.count,
      outputCount: diff.dirtyCards,
      dirtyCount: diff.dirtyCards,
      skippedUnchangedCount: diff.unchanged,
      writesPerformed: false,
      canonicalAuthority: false
    },
    writesPerformed: false
  };
}

function parseArgs(argv) {
  const a = {
    cards: process.env.OPENSPEC_CARDS_PATH ?? 'docs/reports/openspec-evidence-cards-v1.json',
    baseline: '.tmp/atlas/openspec-dirty/baseline.json',
    output: process.env.OPENSPEC_DIRTY_SET_OUTPUT ?? null,
    writeSnapshot: false,
    representations: 5
  };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (k === '--cards') a.cards = argv[++i];
    else if (k === '--baseline') a.baseline = argv[++i];
    else if (k === '--output') a.output = argv[++i];
    else if (k === '--write-snapshot') a.writeSnapshot = true;
    else if (k === '--representations') a.representations = Number(argv[++i]);
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(readFileSync(resolve(args.cards), 'utf8'));
  const current = buildSnapshot(report.cards);
  const baselinePath = resolve(args.baseline);
  const previous = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
  const diff = diffSnapshots(previous, current, { representations: args.representations });
  const receipt = buildDirtySetReceipt({ previous, current, diff, report });
  if (args.output) {
    const out = resolve(args.output);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify({ ...receipt, dirtyKeys: diff.dirtyKeys, dirtyKeysTruncated: false }, null, 2)}\n`, 'utf8');
  }
  if (args.writeSnapshot) {
    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, `${JSON.stringify({ ...current, capturedFrom: { cardsReportChecksum: report.checksum ?? null, workspaceRevision: report.source?.workspaceRevision ?? null } })}\n`, 'utf8');
  }
  console.log(JSON.stringify({
    ...receipt,
    writes: { receipt: args.output ? resolve(args.output) : null, snapshot: args.writeSnapshot ? baselinePath : null, postgres: 0, qdrant: 0, valkey: 0, tasksMd: 0 }
  }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
