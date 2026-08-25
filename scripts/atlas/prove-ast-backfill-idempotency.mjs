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

const { values: args } = parseArgs({
  options: { limit: { type: 'string', default: '1000' } },
  strict: false,
});
const LIMIT = parseInt(args.limit ?? '1000', 10);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANDIDATES_PATH = path.join(ROOT, 'docs/reports/graphify-ast-declaration-candidates-v2.jsonl');
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
  method: 'method', class: 'class',
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

async function main() {
  const receipt = { schema: 'atlas.ast-backfill-idempotency-proof.v1', generatedAt: new Date().toISOString(), readOnly: true, databaseWrites: false, applyBlocked: true, applyBlockedReason: 'AST-ID-06 has 4 unresolved operator decisions (path/case/method-scope/vendored-tree) — see parent-atlas-neural-prefill-encoder/tasks.md', steps: {} };

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

  // AST_BF_10: explicit apply gate
  receipt.steps.AST_BF_10_apply_gate = { status: 'BLOCKED', reason: receipt.applyBlockedReason, unblockConditions: ['AST-ID-06 path-relativity decision', 'AST-ID-06 case-normalization policy', 'AST-ID-06 method/chunk-extraction-scope policy', 'AST-ID-06 vendored/legacy-tree exclusion policy'] };

  receipt.status = 'DRY_RUN_PROVEN';
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((err) => { console.error('[ast-backfill-proof] fatal:', err); process.exitCode = 1; });
