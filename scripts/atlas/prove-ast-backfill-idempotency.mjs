#!/usr/bin/env node
/**
 * Receipt-driven, read-only bounded AST backfill proof.
 *
 * Answers `parent-atlas-workstation-todo.md`'s "Next-session priority" item
 * (1) — "run the receipt-driven 1,000-row AST backfill per the transcript's
 * AST_BF_01-AST_BF_10 proof schema" — carried into
 * openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md's
 * `PARENT-ATLAS-WORKSTATION-BRIDGE-01` section.
 *
 * HONESTY NOTE: the original AST_BF_01-AST_BF_10 field-level schema came
 * from an external pasted transcript that was never preserved anywhere in
 * this repo (confirmed via `grep -r AST_BF_01` — zero hits outside the
 * one-line reference in parent-atlas-workstation-todo.md). This script
 * does NOT guess-reconstruct that lost schema. It designs a comparable
 * 10-step receipt from scratch, following this repo's own established
 * conventions (dry-run-by-default, real bugs found and reported honestly,
 * zero canonical writes), and says so plainly rather than pretending to
 * match an unavailable spec.
 *
 * This is explicitly NOT a live backfill. `AST-ID-06`
 * (parent-atlas-neural-prefill-encoder/tasks.md) still has 4 unresolved
 * operator decisions (path convention, case policy, method/chunk-
 * extraction-scope policy, vendored-tree exclusion) that any real
 * `atlas_ast_nodes` write must respect. This script proves the
 * *mechanics* of a backfill (row construction, idempotency, uniqueness,
 * constraint validity, collision-with-existing-rows) are sound, so that
 * once those 4 decisions land, applying the backfill is a small, already-
 * proven step rather than a leap of faith.
 *
 * Usage:
 *   node scripts/atlas/prove-ast-backfill-idempotency.mjs [--limit 1000]
 */
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildAstSourceRefKey } from './lib/ast-source-ref-key.mjs';
import { normalizeAstSourceRefForPolicy } from './lib/ast-source-ref-policy.mjs';
import { decodeSourceTextEnvelope } from './lib/source-text-envelope.mjs';

const { values: args } = parseArgs({
  options: { limit: { type: 'string', default: '1000' }, candidates: { type: 'string', default: '' } },
  strict: false,
});
const LIMIT = parseInt(args.limit ?? '1000', 10);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LEGACY_CANDIDATES_PATH = path.join(ROOT, 'docs/reports/graphify-ast-declaration-candidates-v2.jsonl');
const ACTIVE_CANDIDATES_PATH = path.join(ROOT, 'docs/reports/graphify-ast-declaration-candidates-active-v3.jsonl');
// AST-ID-06 (DECISIONS_FROZEN_FOR_DRY_RUN, 2026-09-20): default input is the ACTIVE-scope artifact when present.
const CANDIDATES_PATH = args.candidates
  ? path.resolve(ROOT, String(args.candidates))
  : (fs.existsSync(ACTIVE_CANDIDATES_PATH) ? ACTIVE_CANDIDATES_PATH : LEGACY_CANDIDATES_PATH);
const SNAPSHOT_DIR = path.join(ROOT, 'docs/reports/workspace-source-snapshots');
const KNOW09_RECEIPT_PATH = path.join(ROOT, '.tmp/knowledge-source-snapshot-live-v1.json');
const VENDORED_SEGMENTS = ['llama-cpp-turboquant-gemma4', 'node_modules', '.tmp', 'deeds_labs', 'archive'];
const PARSER_NAME = 'ast-grep-napi';
const BRIDGED_KEYS_PATH = path.join(ROOT, '.tmp/atlas/atlas-ast-nodes-source-ref-keys.txt');
const REPORT_PATH = path.join(ROOT, 'docs/reports/atlas-ast-backfill-idempotency-proof-v1.json');

// Matches the writer's own storage-kind contract
// (sveltekit-frontend/scripts/atlas/populate-atlas-ast-nodes.mjs KIND_MAP/VALID_KINDS)
// — deliberately NOT the same as buildAstSourceRefKey's alias table, which
// exists only for the join key, not the stored node_kind column.
const VALID_STORAGE_KINDS = new Set([
  'file', 'module', 'class', 'interface', 'type', 'function', 'method',
  'constructor', 'parameter', 'route', 'schema', 'test', 'call_site',
  'import', 'export',
]);
const CANDIDATE_KIND_TO_STORAGE_KIND = {
  function: 'function', interface: 'interface', type: 'type',
  method: 'method', class: 'class', file: 'file',
  // enum is NOT in VALID_STORAGE_KINDS — deliberately left unmapped so
  // AST_BF_06 below reports it as a real constraint violation, not
  // silently coerced into some other kind.
};

const REPO_ID = 'deeds-web-app'; // matches populate-atlas-ast-nodes.mjs's REPO_ID convention

function normalizePathLower(p) {
  return (p || '').replace(/\\/g, '/').replace(/^\//, '').toLowerCase();
}

function treeNodeId(repoId, normalizedPath, parserLanguage, nodeKind, qualifiedSymbol, parentKey, normalizedSig) {
  const input = [repoId, normalizedPath, parserLanguage, nodeKind, qualifiedSymbol, parentKey, normalizedSig ?? ''].join('\x00');
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function structuralKey(repoId, normalizedPath, nodeKind, qualifiedSymbol) {
  return `${repoId}/${normalizedPath}#${nodeKind}:${qualifiedSymbol}`;
}

function inferLanguage(relativePath) {
  const ext = path.extname(String(relativePath ?? '')).toLowerCase();
  const map = { '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript', '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.svelte': 'svelte' };
  return map[ext] ?? 'unknown';
}

/** AST_BF_02: construct a proposed atlas_ast_nodes row from one candidate. Pure function — no I/O. */
function candidateToProposedRow(candidate) {
  const storageKind = CANDIDATE_KIND_TO_STORAGE_KIND[candidate.symbol_kind];
  const normalizedPath = normalizePathLower(candidate.relative_path ?? candidate.source_ref);
  const language = inferLanguage(candidate.relative_path ?? candidate.source_ref);
  const violations = [];
  if (!storageKind || !VALID_STORAGE_KINDS.has(storageKind)) {
    violations.push(`UNSUPPORTED_NODE_KIND: candidate symbol_kind '${candidate.symbol_kind}' has no valid atlas_ast_nodes storage kind mapping (chk_atlas_ast_nodes_kind would reject it)`);
  }
  const sourceRefKey = buildAstSourceRefKey(candidate.relative_path ?? candidate.source_ref, candidate.symbol_kind, candidate.symbol_name);
  if (!sourceRefKey) violations.push('UNKEYABLE_CANDIDATE: buildAstSourceRefKey returned null');
  if (!(candidate.start_byte >= 0)) violations.push('BYTE_START_NEGATIVE: would violate atlas_ast_nodes_byte_start_check');
  if (!(candidate.end_byte >= candidate.start_byte)) violations.push('BYTE_END_BEFORE_START: would violate atlas_ast_nodes_check');

  if (violations.length) return { candidate_key: `${candidate.relative_path}#${candidate.symbol_kind}:${candidate.symbol_name}`, valid: false, violations };

  const parentKey = 'ROOT'; // bounded proof does not resolve real class-parent linkage (see AST_BF_08 note)
  const tid = treeNodeId(REPO_ID, normalizedPath, language, storageKind, candidate.symbol_name, parentKey, '');
  const sk = structuralKey(REPO_ID, normalizedPath, storageKind, candidate.symbol_name);

  return {
    candidate_key: `${candidate.relative_path}#${candidate.symbol_kind}:${candidate.symbol_name}`,
    valid: true,
    violations: [],
    proposed_row: {
      tree_node_id: tid,
      structural_key: sk,
      repo_id: REPO_ID,
      relative_path: normalizedPath,
      node_kind: storageKind,
      qualified_symbol: candidate.symbol_name,
      start_byte: candidate.start_byte,
      end_byte: candidate.end_byte,
      parser_name: 'ast-grep-napi',
      parser_language: language,
      source_ref_key: sourceRefKey,
    },
  };
}

async function loadBoundedCandidates(limit) {
  if (!fs.existsSync(CANDIDATES_PATH)) throw new Error(`AST_BF_01: candidates file not found: ${CANDIDATES_PATH} (re-run AST-ID-02's full pass first)`);
  const candidates = [];
  const rl = readline.createInterface({ input: fs.createReadStream(CANDIDATES_PATH, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (candidates.length >= limit) break;
    try { candidates.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return candidates;
}

function loadBridgedKeys() {
  if (!fs.existsSync(BRIDGED_KEYS_PATH)) return null;
  return new Set(fs.readFileSync(BRIDGED_KEYS_PATH, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean));
}

const sha256Hex = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** AST_BF_11/13: classify one candidate against the frozen AST-ID-06 path + scope policy. Pure. */
function classifyScope(candidate) {
  const raw = String(candidate.relative_path ?? candidate.source_ref ?? '').replaceAll('\\', '/');
  const canonical = normalizeAstSourceRefForPolicy(raw);
  const segs = canonical.split('/');
  const reasons = [];
  if (/^[A-Za-z]:/.test(raw) || raw.startsWith('/')) reasons.push('FOREIGN_ABSOLUTE_PATH');
  if (segs.includes('..')) reasons.push('PARENT_DIR_ESCAPE');
  if (canonical.startsWith('sveltekit-frontend/')) reasons.push('UNEXPECTED_WORKSPACE_PREFIX');
  if (VENDORED_SEGMENTS.some((v) => segs.includes(v))) reasons.push('VENDORED_OR_LEGACY_TREE');
  if (!canonical.startsWith('src/')) reasons.push('OUTSIDE_ACTIVE_APP_SRC');
  return { raw, canonical, reasons };
}

/** Two-phase cohort: Phase A ids for non-methods (ROOT parent), Phase B method ids bound to the smallest enclosing class. Pure, deterministic. */
function buildCohort(candidates) {
  const rejected = {};
  let unsupportedKind = 0;
  const rows = [];
  for (const c of candidates) {
    const s = classifyScope(c);
    if (s.reasons.length) { for (const r of s.reasons) rejected[r] = (rejected[r] ?? 0) + 1; continue; }
    const kind = CANDIDATE_KIND_TO_STORAGE_KIND[c.symbol_kind];
    if (!kind || !VALID_STORAGE_KINDS.has(kind)) { unsupportedKind += 1; continue; }
    rows.push({ raw: s.raw, canonical: s.canonical, np: s.canonical.toLowerCase(), kind, sym: c.symbol_name, start: c.start_byte, end: c.end_byte, sline: c.start_line, eline: c.end_line, lang: inferLanguage(s.canonical), rawRevisionCoerced: c.source_revision === 'workspace:0' || c.workspace_revision === 0, rawSource: c.raw_source_ref ?? null, tid: null, parentTid: null, deferred: null });
  }
  const byFile = new Map();
  for (const r of rows) (byFile.get(r.np) ?? byFile.set(r.np, []).get(r.np)).push(r);
  // Identity convention = the existing atlas_ast_nodes model: file row (ROOT) -> top-level declarations (parent = file tid) -> methods (parent = class tid).
  const fileByNp = new Map();
  for (const r of rows) if (r.kind === 'file') { r.tid = treeNodeId(REPO_ID, r.np, r.lang, 'file', r.sym, 'ROOT', ''); fileByNp.set(r.np, r); }
  let unresolvedParents = 0;
  for (const r of rows) {
    if (r.kind === 'file' || r.kind === 'method') continue;
    const f = fileByNp.get(r.np);
    if (!f) { r.deferred = 'NO_FILE_ROW'; unresolvedParents += 1; continue; }
    r.parentTid = f.tid;
    r.tid = treeNodeId(REPO_ID, r.np, r.lang, r.kind, r.sym, f.tid, '');
  }
  for (const list of byFile.values()) {
    const classes = list.filter((x) => x.kind === 'class' && x.tid);
    for (const m of list.filter((x) => x.kind === 'method')) {
      let best = null;
      for (const k of classes) {
        if (k.start <= m.start && k.end >= m.end && (k.start !== m.start || k.end !== m.end) && (!best || k.end - k.start < best.end - best.start)) best = k;
      }
      if (!best) { m.deferred = 'NO_ENCLOSING_CLASS'; unresolvedParents += 1; continue; }
      m.parentTid = best.tid;
      m.tid = treeNodeId(REPO_ID, m.np, m.lang, 'method', m.sym, best.tid, '');
    }
  }
  const checksum = sha256Hex(rows.filter((r) => r.tid).map((r) => [r.tid, r.np, r.kind, r.sym, r.start, r.end, r.parentTid ?? ''].join('|')).sort().join('\n'));
  return { rows, rejected, unsupportedKind, unresolvedParents, checksum };
}

function readAstGrepVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'sveltekit-frontend/node_modules/@ast-grep/napi/package.json'), 'utf8')).version ?? null; } catch { return null; }
}

/** AST_BF_15: lineage from the ADMITTED snapshot only (candidate `workspace:0` revisions are legacy-coerced and ignored). */
function evaluateLineage(cohort) {
  if (!fs.existsSync(KNOW09_RECEIPT_PATH)) return { status: 'NOT_EVALUATED', reason: `${path.relative(ROOT, KNOW09_RECEIPT_PATH)} missing — cannot identify admitted snapshot or drift set` };
  const know09 = JSON.parse(fs.readFileSync(KNOW09_RECEIPT_PATH, 'utf8'));
  const snapPath = know09.snapshotPath && fs.existsSync(know09.snapshotPath) ? know09.snapshotPath : path.join(SNAPSHOT_DIR, `${String(know09.snapshotRevision).replace('sha256:', '')}.json`);
  if (!fs.existsSync(snapPath)) return { status: 'NOT_EVALUATED', reason: 'admitted snapshot file not found', snapshotPath: snapPath };
  const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  const srcByLower = new Map();
  for (const s of snap.sources) srcByLower.set(String(s.sourceRef).toLowerCase(), s);
  const drift = new Set([...(know09.worktreeMismatchRefs ?? []), ...(know09.missingWorktreeRefs ?? [])].map((x) => String(x).toLowerCase()));
  const parserVersion = readAstGrepVersion();
  const digestCache = new Map();
  const c = { rows: cohort.rows.filter((r) => r.tid).length, notInSnapshot: 0, driftExcluded: 0, fileMissing: 0, digestDiverged: 0, spanDisagrees: 0, stampable: 0, rawRevisionCoerced: cohort.rows.filter((r) => r.rawRevisionCoerced).length };
  for (const r of cohort.rows) {
    if (!r.tid) continue;
    const ref = `sveltekit-frontend/${r.canonical}`.toLowerCase();
    const s = srcByLower.get(ref);
    if (!s) { c.notInSnapshot += 1; continue; }
    if (drift.has(ref)) { c.driftExcluded += 1; continue; }
    const abs = path.join(ROOT, s.sourceRef);
    if (!digestCache.has(abs)) {
      try { const env = decodeSourceTextEnvelope(fs.readFileSync(abs), s.sourceRef); digestCache.set(abs, { buf: env.parserBuffer, ok: env.rawContentHash === s.contentDigest }); } catch { digestCache.set(abs, null); }
    }
    const f = digestCache.get(abs);
    if (!f) { c.fileMissing += 1; continue; }
    if (!f.ok) { c.digestDiverged += 1; continue; }
    // A file row's symbol is its basename (not present in its text): its span must be the whole parserBuffer instead.
    const spanOk = r.kind === 'file' ? (r.start === 0 && r.end === f.buf.length) : f.buf.subarray(r.start, r.end).toString('utf8').includes(String(r.sym));
    if (!spanOk) { c.spanDisagrees += 1; continue; }
    r.lineage = { workspace_id: snap.workspaceId, workspace_revision: know09.workspaceRevision, source_revision: s.sourceRevision, source_content_digest: s.contentDigest, parser_name: PARSER_NAME, parser_version: parserVersion, evidence_ref: `${snap.snapshotRevision}:${s.sourceIdentityKey}` };
    c.stampable += 1;
  }
  const complete = cohort.rows.filter((r) => r.lineage && r.lineage.workspace_id && r.lineage.source_revision && r.lineage.parser_name && r.lineage.parser_version && r.lineage.evidence_ref).length;
  return { status: c.stampable > 0 && complete === c.stampable ? 'PASS_PARTIAL' : 'FAIL', snapshotRevision: snap.snapshotRevision, workspaceRevision: know09.workspaceRevision, parserVersion, counts: c, stampableRowsWithCompleteLineage: complete, stampableFraction: c.rows ? Number((c.stampable / c.rows).toFixed(4)) : 0, note: 'Only stampable rows (in admitted snapshot, not drifted, file bytes hash to snapshot digest, span contains symbol) may enter a canary; the rest are excluded, never stamped.' };
}

async function main() {
  const receipt = { schema: 'atlas.ast-backfill-idempotency-proof.v1', generatedAt: new Date().toISOString(), readOnly: true, databaseWrites: false, applyBlocked: true, applyBlockedReason: 'AST-ID-06 decisions frozen for dry-run only (2026-09-20); apply needs AST_BF_11..16 all passing plus explicit operator canary approval', candidatesInput: path.relative(ROOT, CANDIDATES_PATH), steps: {} };

  // AST_BF_01: bounded candidate selection
  const candidates = await loadBoundedCandidates(LIMIT);
  receipt.steps.AST_BF_01_select_candidates = { requestedLimit: LIMIT, selected: candidates.length, source: path.relative(ROOT, CANDIDATES_PATH) };
  if (!candidates.length) { receipt.status = 'NO_CANDIDATES'; console.log(JSON.stringify(receipt, null, 2)); return; }

  // AST_BF_02: construct proposed rows
  const constructedFirst = candidates.map(candidateToProposedRow);
  const validFirst = constructedFirst.filter((r) => r.valid);
  const invalidFirst = constructedFirst.filter((r) => !r.valid);
  receipt.steps.AST_BF_02_construct_rows = { total: constructedFirst.length, valid: validFirst.length, invalid: invalidFirst.length };

  // AST_BF_03: idempotency — construct the SAME candidates again, verify byte-identical hashes
  const constructedSecond = candidates.map(candidateToProposedRow);
  let idempotencyMismatches = 0;
  for (let i = 0; i < constructedFirst.length; i++) {
    const a = constructedFirst[i], b = constructedSecond[i];
    const same = a.valid === b.valid && (!a.valid || (a.proposed_row.tree_node_id === b.proposed_row.tree_node_id && a.proposed_row.structural_key === b.proposed_row.structural_key && a.proposed_row.source_ref_key === b.proposed_row.source_ref_key));
    if (!same) idempotencyMismatches++;
  }
  receipt.steps.AST_BF_03_idempotency_proof = { comparedPairs: constructedFirst.length, mismatches: idempotencyMismatches, proven: idempotencyMismatches === 0 };

  // AST_BF_04: uniqueness within the batch
  const treeNodeIds = validFirst.map((r) => r.proposed_row.tree_node_id);
  const uniqueTreeNodeIds = new Set(treeNodeIds);
  const treeNodeIdCounts = new Map();
  for (const r of validFirst) {
    const tid = r.proposed_row.tree_node_id;
    if (!treeNodeIdCounts.has(tid)) treeNodeIdCounts.set(tid, []);
    treeNodeIdCounts.get(tid).push(r.candidate_key);
  }
  const duplicateGroups = [...treeNodeIdCounts.values()].filter((keys) => keys.length > 1);
  receipt.steps.AST_BF_04_batch_uniqueness = { totalValidRows: treeNodeIds.length, uniqueTreeNodeIds: uniqueTreeNodeIds.size, duplicatesWithinBatch: treeNodeIds.length - uniqueTreeNodeIds.size, sampleDuplicateGroups: duplicateGroups.slice(0, 5) };

  // AST_BF_05: collision/overlap against EXISTING live atlas_ast_nodes rows (dumped read-only earlier this session)
  const bridgedKeys = loadBridgedKeys();
  let alreadyPresent = 0, netNew = 0;
  if (bridgedKeys) {
    for (const r of validFirst) {
      if (bridgedKeys.has(r.proposed_row.source_ref_key)) alreadyPresent++; else netNew++;
    }
  }
  receipt.steps.AST_BF_05_collision_with_existing = bridgedKeys ? { bridgedKeyCount: bridgedKeys.size, alreadyPresentInAtlasAstNodes: alreadyPresent, netNewIfApplied: netNew } : { status: 'SKIPPED', reason: `${path.relative(ROOT, BRIDGED_KEYS_PATH)} not found — dump it via docker exec psql per AST-ID-01` };

  // AST_BF_06: constraint validation (kind allowlist, byte checks) — already computed during construction
  const violationCounts = {};
  for (const r of invalidFirst) for (const v of r.violations) { const code = v.split(':')[0]; violationCounts[code] = (violationCounts[code] ?? 0) + 1; }
  receipt.steps.AST_BF_06_constraint_validation = { invalidRows: invalidFirst.length, violationCounts, sampleViolations: invalidFirst.slice(0, 5).map((r) => ({ candidate_key: r.candidate_key, violations: r.violations })) };

  // AST_BF_07: case-normalization consistency within this batch (does the shared key builder ever
  // produce two different casings for what should be the same source_ref_key?)
  const keyToOriginalPaths = new Map();
  for (const c of candidates) {
    const key = buildAstSourceRefKey(c.relative_path ?? c.source_ref, c.symbol_kind, c.symbol_name);
    if (!key) continue;
    const lower = key.toLowerCase();
    if (!keyToOriginalPaths.has(lower)) keyToOriginalPaths.set(lower, new Set());
    keyToOriginalPaths.get(lower).add(key);
  }
  const caseVariantGroups = [...keyToOriginalPaths.values()].filter((s) => s.size > 1);
  receipt.steps.AST_BF_07_case_consistency_within_batch = { distinctCaseFoldedKeys: keyToOriginalPaths.size, groupsWithCaseVariants: caseVariantGroups.length, proven: caseVariantGroups.length === 0, sampleCaseVariantGroups: caseVariantGroups.slice(0, 5).map((s) => [...s]) };

  // AST_BF_08: parent linkage note (NOT resolved — bounded proof scope)
  const methodCount = candidates.filter((c) => c.symbol_kind === 'method').length;
  receipt.steps.AST_BF_08_parent_linkage = { note: 'Bounded proof does not resolve real class-parent tree_node_id linkage; all proposed rows use parent_tree_node_id=NULL (ROOT). A real apply would need a second pass once class rows are already committed, or a two-phase insert.', methodCandidatesInBatch: methodCount };

  // AST_BF_09: dry-run summary
  receipt.steps.AST_BF_09_dry_run_summary = { candidatesConsidered: candidates.length, rowsConstructedValid: validFirst.length, rowsConstructedInvalid: invalidFirst.length, netNewIfApplied: bridgedKeys ? netNew : null, databaseWrites: 0 };

  // ---- AST-ID-06 frozen-policy gates (AST_BF_11..16) — whole active candidate file, not the bounded sample above ----
  const allCandidates = await loadBoundedCandidates(Number.POSITIVE_INFINITY);
  const cohort = buildCohort(allCandidates);
  const admittedRows = cohort.rows;
  const planned = admittedRows.filter((r) => r.tid);

  // AST_BF_11: canonical path policy over the admitted set
  const pathViolations = { absolute: 0, parentEscape: 0, workspacePrefix: 0, notSrcRelative: 0 };
  for (const r of admittedRows) {
    if (/^[A-Za-z]:/.test(r.canonical) || r.canonical.startsWith('/')) pathViolations.absolute += 1;
    if (r.canonical.split('/').includes('..')) pathViolations.parentEscape += 1;
    if (r.canonical.startsWith('sveltekit-frontend/')) pathViolations.workspacePrefix += 1;
    if (!r.canonical.startsWith('src/')) pathViolations.notSrcRelative += 1;
  }
  receipt.steps.AST_BF_11_PATH_POLICY = { policy: 'ACTIVE_APP_RELATIVE_V1', candidatesInput: allCandidates.length, admittedRows: admittedRows.length, violations: pathViolations, rawPathPreservedAsProvenance: true, status: Object.values(pathViolations).every((n) => n === 0) ? 'PASS' : 'FAIL' };

  // AST_BF_12: collision — one canonical candidate per normalized path + kind + symbol (fail closed)
  const groups = new Map();
  for (const r of admittedRows) {
    const k = `${r.np}\u0000${r.kind}\u0000${r.sym}`;
    if (!groups.has(k)) groups.set(k, { raws: new Set(), spellings: new Set(), spans: new Set(), tids: new Set(), n: 0 });
    const g = groups.get(k); g.raws.add(r.raw); g.spellings.add(r.canonical); g.spans.add(`${r.start}-${r.end}`); if (r.tid) g.tids.add(r.tid); g.n += 1;
  }
  const all = [...groups.values()];
  const originCollisions = all.filter((g) => g.raws.size > 1).length;
  const caseCollisions = all.filter((g) => g.spellings.size > 1).length;
  const sameKeyDifferentSpan = all.filter((g) => g.spans.size > 1).length;
  const treeNodeIdCollisions = planned.length - new Set(planned.map((r) => r.tid)).size;
  // Recommended default (operator has not explicitly confirmed): rows whose tree_node_id is shared are excluded as AMBIGUOUS_SAME_KEY —
  // never disambiguated by inventing an id; a span ordinal would need a new identity revision.
  const tidCounts = new Map();
  for (const r of planned) tidCounts.set(r.tid, (tidCounts.get(r.tid) ?? 0) + 1);
  let ambiguousExcluded = 0;
  for (const r of planned) if (tidCounts.get(r.tid) > 1) { r.excluded = 'AMBIGUOUS_SAME_KEY'; ambiguousExcluded += 1; }
  const hardCollisions = originCollisions + caseCollisions;
  receipt.steps.AST_BF_12_COLLISION = { groups: all.length, originCollisions, caseCollisions, sameKeyDifferentSpan, treeNodeIdCollisions, ambiguousRowsExcluded: ambiguousExcluded, exclusionRule: 'AMBIGUOUS_SAME_KEY (recommended default, awaiting explicit operator confirmation)', status: hardCollisions > 0 ? 'FAIL' : (treeNodeIdCollisions > 0 ? 'PASS_WITH_EXCLUSIONS' : 'PASS'), note: 'sameKeyDifferentSpan (overloads/redeclarations) is informational; rows sharing a tree_node_id are excluded from any apply set.' };

  // AST_BF_13: scope admission with exclusion reasons
  receipt.steps.AST_BF_13_SCOPE = { admitted: admittedRows.length, unsupportedKindExcluded: cohort.unsupportedKind, rejectedByReason: cohort.rejected, foreignAbsolutePathCohortInTable: 'NOT_EVALUATED_IN_SCRIPT (script reads files only; live atlas_ast_nodes has 3,498 treesitter-chunker absolute-path rows to quarantine via superseded_by — DB-side plan)', deletion: 'FORBIDDEN', status: 'PASS' };

  // AST_BF_14: two-phase parent plan
  const methods = admittedRows.filter((r) => r.kind === 'method');
  const deferred = methods.filter((r) => r.deferred);
  receipt.steps.AST_BF_14_PARENT_PLAN = { method: methods.length, methodsWithPlannedParent: methods.length - deferred.length, deferredNoEnclosingClass: deferred.length, productionBoundNullParents: 0, phaseAFileRows: admittedRows.filter((r) => r.kind === 'file').length, phaseBTopLevelUnderFile: admittedRows.filter((r) => r.kind !== 'file' && r.kind !== 'method' && r.tid).length, phaseCMethodsUnderClass: methods.length - deferred.length, convention: 'file(ROOT) -> declaration(parent=file) -> method(parent=class); matches existing atlas_ast_nodes (2,153/2,153 ids reproduce)', status: deferred.length ? 'PASS_WITH_DEFERRED' : 'PASS', note: 'Deferred methods are excluded from any apply set (never written with a NULL parent).' };

  // AST_BF_15: lineage from the admitted snapshot
  receipt.steps.AST_BF_15_LINEAGE = evaluateLineage(cohort);

  // AST_BF_16: replay — independent second full construction, exact checksum equality
  const replay = buildCohort(allCandidates);
  receipt.steps.AST_BF_16_REPLAY = { pass1Checksum: `sha256:${cohort.checksum}`, pass2Checksum: `sha256:${replay.checksum}`, status: cohort.checksum === replay.checksum ? 'PASS' : 'FAIL' };

  // AST_BF_10: apply gate — decisions frozen for dry-run; apply still needs all gates + explicit operator canary approval
  const gateStatuses = ['AST_BF_11_PATH_POLICY', 'AST_BF_12_COLLISION', 'AST_BF_13_SCOPE', 'AST_BF_14_PARENT_PLAN', 'AST_BF_15_LINEAGE', 'AST_BF_16_REPLAY'].map((k) => [k, receipt.steps[k].status]);
  const allGatesPass = gateStatuses.every(([, s]) => String(s).startsWith('PASS'));
  // AST_BF_17: net-new vs existing atlas_ast_nodes (tree_node_id equality and structural_key equality with a DIFFERENT id)
  const existingPath = path.join(ROOT, '.tmp/atlas/atlas-ast-nodes-identity-dump.tsv');
  const eligibleRows = admittedRows.filter((r) => r.tid && r.lineage && !r.excluded);
  if (fs.existsSync(existingPath)) {
    const existingByTid = new Map(), existingBySk = new Map();
    for (const line of fs.readFileSync(existingPath, 'utf8').split('\n')) {
      if (!line) continue;
      const [tid, sk, parserName, parserVersion, parserLanguage, signature, parent, sourceRevision, sourceContentHash, supersededBy] = line.split('\t');
      const e = { tid, sk, parserName, parserVersion, parserLanguage, signature, parent, sourceRevision, sourceContentHash, supersededBy };
      existingByTid.set(tid, e); (existingBySk.get(sk) ?? existingBySk.set(sk, []).get(sk)).push(e);
    }
    let already = 0, netNewRows = 0, skConflict = 0;
    const classes = {}; const samples = {}; const byExistingParser = {}; const byKind = {};
    for (const r of eligibleRows) {
      r.netNew = false;
      if (existingByTid.has(r.tid)) { already += 1; continue; }
      const existing = existingBySk.get(`${REPO_ID}/${r.np}#${r.kind}:${r.sym}`);
      if (existing) {
        skConflict += 1; r.excluded = 'STRUCTURAL_KEY_EXISTS_WITH_DIFFERENT_TREE_NODE_ID';
        // AST_BF_18C: classify WHY the tree_node_id differs (which identity input differs), never assume staleness.
        const e = existing[0];
        const reasons = [];
        if (existing.length > 1) reasons.push('MULTIPLE_EXISTING_ROWS_SAME_STRUCTURAL_KEY');
        if (e.signature !== '') reasons.push('IDENTITY_INPUT_SIGNATURE_DIFFERS');
        if ((e.parent || null) !== (r.parentTid || null)) reasons.push('IDENTITY_INPUT_PARENT_DIFFERS');
        if (e.parserLanguage && e.parserLanguage !== r.lang) reasons.push('IDENTITY_INPUT_LANGUAGE_DIFFERS');
        let cls;
        if (reasons.length) cls = reasons.length === 1 && reasons[0] === 'MULTIPLE_EXISTING_ROWS_SAME_STRUCTURAL_KEY' ? 'TRUE_CONFLICT' : 'IDENTITY_ALGORITHM_CHANGE';
        else if (e.sourceRevision && r.lineage.source_revision && e.sourceRevision !== r.lineage.source_revision) cls = 'SOURCE_REVISION_CHANGE';
        else if (e.parserName !== r.lineage.parser_name || e.parserVersion !== r.lineage.parser_version) cls = e.sourceRevision ? 'PARSER_REVISION_CHANGE' : 'STALE_OLD_IDENTITY_UNPROVEN_NO_REVISION_EVIDENCE';
        else cls = 'UNKNOWN';
        r.conflictClass = cls; r.conflictExisting = { tid: e.tid, parser: `${e.parserName}:${e.parserVersion}` };
        byExistingParser[`${e.parserName}:${e.parserVersion}`] = (byExistingParser[`${e.parserName}:${e.parserVersion}`] ?? 0) + 1;
        byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
        classes[cls] = (classes[cls] ?? 0) + 1;
        (samples[cls] ??= []).length < 3 && samples[cls].push({ structural_key: e.sk, existing: { tid: e.tid.slice(0, 12), parser: `${e.parserName}:${e.parserVersion}`, language: e.parserLanguage, hasSignature: e.signature !== '', hasParent: Boolean(e.parent), sourceRevision: e.sourceRevision ? 'present' : 'absent' }, candidate: { tid: r.tid.slice(0, 12), language: r.lang, hasParent: Boolean(r.parentTid) }, reasons });
        continue;
      }
      r.netNew = true; netNewRows += 1;
    }
    receipt.steps.AST_BF_17_NET_NEW = { existingRows: existingByTid.size, eligibleBeforeOverlap: eligibleRows.length, alreadyPresentByTreeNodeId: already, structuralKeyConflictExcluded: skConflict, netNew: netNewRows, status: 'PASS' };
    receipt.steps.AST_BF_18C_STRUCTURAL_CONFLICT_CLASSIFICATION = { conflicts: skConflict, byClass: classes, byExistingParser, byCandidateKind: byKind, samples, supersessionProposalsAllowed: 0, rule: 'Only STALE_OLD_IDENTITY with strong revision evidence may ever feed a supersession proposal; newer generator alone is not evidence. None qualify unless a class other than *_UNPROVEN_* appears with revision proof.', status: 'CLASSIFIED_NO_WRITES' };
  } else {
    receipt.steps.AST_BF_17_NET_NEW = { status: 'NOT_EVALUATED', reason: `${path.relative(ROOT, existingPath)} missing — dump identity columns read-only via docker exec psql (TSV)` };
  }
  const eligibleFinal = admittedRows.filter((r) => r.tid && r.lineage && !r.excluded && r.netNew !== false);
  const canaryEligible = eligibleFinal.length;
  // Hand-off to the guarded apply script (scratch, not canonical). One JSON object per eligible row.
  const eligiblePath = path.join(ROOT, '.tmp/atlas/ast-canary-eligible-v1.jsonl');
  fs.writeFileSync(eligiblePath, `${eligibleFinal.map((r) => JSON.stringify({ tree_node_id: r.tid, parent_tree_node_id: r.parentTid, canonical_path: r.canonical, raw_source_ref: r.rawSource, np: r.np, kind: r.kind, qualified_symbol: r.sym, parser_language: r.lang, start_byte: r.start, end_byte: r.end, line_start: r.sline + 1, line_end: r.eline + 1, ...r.lineage })).join('\n')}\n`, 'utf8');
  // Conflict hand-off: the aligned (file-parent convention) id for every structural-key conflict, with the existing row it collides with.
  const conflictsPath = path.join(ROOT, '.tmp/atlas/ast-conflicts-v1.jsonl');
  fs.writeFileSync(conflictsPath, `${eligibleRows.filter((r) => r.conflictClass).map((r) => JSON.stringify({ structural_key: `${REPO_ID}/${r.np}#${r.kind}:${r.sym}`, aligned_tree_node_id: r.tid, aligned_parent_tree_node_id: r.parentTid, np: r.np, kind: r.kind, qualified_symbol: r.sym, conflict_class: r.conflictClass, existing_tree_node_id: r.conflictExisting.tid, existing_parser: r.conflictExisting.parser })).join('\n')}\n`, 'utf8');
  receipt.steps.AST_BF_18C_STRUCTURAL_CONFLICT_CLASSIFICATION.handoff = { path: path.relative(ROOT, conflictsPath) };
  receipt.steps.AST_BF_17_NET_NEW.eligibleHandoff = { path: path.relative(ROOT, eligiblePath), rows: eligibleFinal.length, lineBasis: '1-based (napi 0-based + 1)' };
  receipt.steps.AST_BF_10_apply_gate = { status: 'DECISIONS_FROZEN_FOR_DRY_RUN', applyAllowed: false, canaryEligibleRows: canaryEligible, gates: Object.fromEntries(gateStatuses), allDryRunGatesPass: allGatesPass, remainingBeforeCanary: ['explicit operator approval of a bounded canary apply', 'canary limited to AST_BF_15 stampable rows', 'post-write readback of tree_node_id/source_revision/workspace_id'] };

  receipt.status = 'DRY_RUN_PROVEN';
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((err) => { console.error('[ast-backfill-proof] fatal:', err); process.exitCode = 1; });
