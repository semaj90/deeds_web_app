#!/usr/bin/env tsx
// Independent readback for SourceClassSplitV1. Recomputes everything from the frozen inputs and
// the classified-rows file; does not trust the builder's aggregates or in-memory state.
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { canonicalInventorySha256, matchRules, SOURCE_CLASSES, EMBEDDING_POLICIES, type InventoryRow, type SourceClass } from './lib/source-class-split-v1.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const receiptArg = process.argv[2];
if (!receiptArg) throw new Error('RECEIPT_PATH_REQUIRED');
const receiptFile = path.resolve(root, receiptArg);
const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
const runDir = path.dirname(receiptFile);
const checks: Record<string, boolean> = {};
const failures: string[] = [];
const warnings: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  checks[name] = ok;
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
};

const sha256File = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const sha256Stream = (file: string): Promise<string> => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  createReadStream(file).on('data', (c) => hash.update(c)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
});

async function* lines(file: string): AsyncGenerator<string> {
  const rl = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) if (line) yield line;
}

async function main() {
  // 1. Frozen inputs still match the receipt's bound checksums.
  check('inventory_sha', sha256File(path.join(root, receipt.inputs.inventoryPath)) === receipt.inputs.inventorySha256);
  const inventoryJson = JSON.parse(readFileSync(path.join(root, receipt.inputs.inventoryPath), 'utf8'));
  const canonicalInventoryDigest = canonicalInventorySha256(inventoryJson);
  check('inventory_canonical_sha', canonicalInventoryDigest !== null
    && canonicalInventoryDigest === receipt.inputs.inventorySha256Recorded
    && canonicalInventoryDigest === inventoryJson.inventorySha256);
  if (receipt.inputs.inventoryChecksumReproduced !== true && canonicalInventoryDigest !== null) {
    warnings.push('HISTORICAL_RECEIPT_FLAG_FALSE_BUT_CANONICAL_INVENTORY_DIGEST_REPRODUCES');
  }
  check('paths_sha', (await sha256Stream(path.join(root, receipt.inputs.pathsPath))) === receipt.inputs.pathsSha256);
  check('census_sha', (await sha256Stream(path.join(root, receipt.inputs.censusPath))) === receipt.inputs.censusSha256);

  // 2. Output artifacts match their recorded checksums.
  const rowsPath = path.join(root, receipt.outputs.classifiedRows.path);
  const aggregatesPath = path.join(root, receipt.outputs.aggregates.path);
  const candidatesPath = path.join(root, receipt.outputs.phaseBCandidates.path);
  const handoffPath = path.join(root, receipt.outputs.handoff.path);
  check('rows_sha', (await sha256Stream(rowsPath)) === receipt.outputs.classifiedRows.sha256);
  check('aggregates_sha', sha256File(aggregatesPath) === receipt.outputs.aggregates.sha256);
  check('candidates_sha', sha256File(candidatesPath) === receipt.outputs.phaseBCandidates.sha256);
  check('handoff_sha', sha256File(handoffPath) === receipt.outputs.handoff.sha256);
  check('receipt_is_exclusive_scratch', path.basename(runDir).startsWith('source-class-split-v1-'));

  // 3. Row-level lockstep with the frozen path inventory: ordinal, path, kind, bytes.
  const pathsFile = path.join(root, receipt.inputs.pathsPath);
  const pathsIter = lines(pathsFile)[Symbol.asyncIterator]();
  const rowsIter = lines(rowsPath)[Symbol.asyncIterator]();
  const totals: Record<string, { files: number; bytes: number }> = Object.fromEntries(SOURCE_CLASSES.map((c) => [c, { files: 0, bytes: 0 }]));
  const eligibility: Record<string, number> = {};
  let independentFileBytes = 0;
  let independentFiles = 0;
  let entryNonFile = 0;
  let rowCount = 0;
  let mismatches = 0;
  let classNullNotDir = 0;
  let invariantViolations = 0;
  let admissionFieldsPresent = false;
  const sampleStride = 997;
  let ruleReplayChecked = 0;
  let ruleReplayMismatch = 0;
  const kindFor = (row: InventoryRow) => (row.entryKind === 'FILE' ? 'F' : row.entryKind === 'DIRECTORY' ? 'D' : 'L');
  const mismatchSamples: string[] = [];

  for (;;) {
    const p = await pathsIter.next();
    const q = await rowsIter.next();
    if (p.done || q.done) {
      if (p.done !== q.done) mismatches++;
      break;
    }
    const inv = JSON.parse(p.value) as InventoryRow;
    const out = JSON.parse(q.value);
    if (out.o !== rowCount) mismatches++;
    if (out.p !== inv.relativePath || out.k !== kindFor(inv)) {
      mismatches++;
      if (mismatchSamples.length < 10) mismatchSamples.push(`${rowCount}:${out.p}`);
    }
    if (out.b !== (inv.entryKind === 'FILE' ? inv.sizeBytes ?? 0 : 0)) mismatches++;
    if (inv.entryKind === 'DIRECTORY') { if (out.c !== null) classNullNotDir++; }
    else if (out.c === null) classNullNotDir++;
    if ('admission' in out || 'workspaceRevision' in out || 'sourceRevision' in out) admissionFieldsPresent = true;

    if (inv.entryKind !== 'FILE') entryNonFile++;
    if (inv.entryKind === 'FILE') {
      independentFiles++;
      independentFileBytes += inv.sizeBytes ?? 0;
      totals[out.c].files += 1;
      totals[out.c].bytes += out.b;
      eligibility[out.e] = (eligibility[out.e] ?? 0) + 1;
      // Policy/class invariants on every file row.
      const clsOk = !(out.c === 'MODEL_ARTIFACT' && out.e !== 'EXCLUDED_DEFAULT' && out.e !== 'EXCLUDED_GITIGNORED' && out.e !== 'EXCLUDED_DUPLICATE_OR_SCRATCH')
        && !(out.c === 'FIRST_PARTY_SOURCE' && out.e === 'SELECTED_API_SURFACE_ONLY')
        && !(out.c === 'UNKNOWN' && out.e !== 'EXCLUDED_UNCLASSIFIED' && out.e !== 'EXCLUDED_GITIGNORED' && out.e !== 'EXCLUDED_DUPLICATE_OR_SCRATCH')
        && EMBEDDING_POLICIES.includes(out.e);
      if (!clsOk) invariantViolations++;
      if (out.e.startsWith('PRIORITY') && !(out.t === 1 && (out.c === 'FIRST_PARTY_SOURCE' || out.c === 'OPENSPEC_REQUIREMENTS'))) invariantViolations++;
    }

    if (rowCount % sampleStride === 0 && inv.entryKind === 'FILE') {
      ruleReplayChecked++;
      const hits = matchRules(inv, out.v);
      const replayClass: SourceClass = hits[0]?.sourceClass ?? 'UNKNOWN';
      if (replayClass !== out.c || (hits[0]?.id ?? null) !== out.r) ruleReplayMismatch++;
    }
    rowCount++;
  }
  check('row_count', rowCount === receipt.outputs.classifiedRows.rows && rowCount === 1_367_300, `rows=${rowCount}`);
  check('row_lockstep_with_inventory', mismatches === 0, `mismatches=${mismatches} samples=${mismatchSamples.join(' | ')}`);
  check('class_present_for_every_non_directory_row', classNullNotDir === 0, `violations=${classNullNotDir}`);
  check('no_admission_fields_on_rows', !admissionFieldsPresent);
  check('policy_class_invariants', invariantViolations === 0, `violations=${invariantViolations}`);
  check('rule_replay_on_sample', ruleReplayMismatch === 0, `checked=${ruleReplayChecked} mismatches=${ruleReplayMismatch}`);

  // 4. Byte and count reconciliation recomputed from the output rows and the independent path stream.
  const classBytes = SOURCE_CLASSES.reduce((s, c) => s + totals[c].bytes, 0);
  const classFiles = SOURCE_CLASSES.reduce((s, c) => s + totals[c].files, 0);
  check('byte_total_reconciles', classBytes === independentFileBytes && independentFileBytes === receipt.reconciliation.independentFileBytes, `class=${classBytes} independent=${independentFileBytes}`);
  check('file_count_reconciles', classFiles === independentFiles && independentFiles === receipt.reconciliation.independentFileCount, `class=${classFiles} independent=${independentFiles}`);
  check('entry_kinds_sum_to_rows', independentFiles + entryNonFile === rowCount, `files=${independentFiles} nonFile=${entryNonFile} rows=${rowCount}`);

  // 5. Aggregates and handoff match the recomputed values.
  const aggregates = JSON.parse(readFileSync(aggregatesPath, 'utf8'));
  for (const c of SOURCE_CLASSES) {
    check(`aggregate_${c}`, aggregates.classCounts[c].files === totals[c].files && aggregates.classCounts[c].bytes === totals[c].bytes);
  }
  const eligibilityAgrees = Object.entries(eligibility).every(([k, v]) => aggregates.byEligibility[k]?.rows === v)
    && Object.keys(aggregates.byEligibility).length === Object.keys(eligibility).length;
  check('aggregate_eligibility', eligibilityAgrees);
  const candidateLines = readFileSync(candidatesPath, 'utf8').split('\n').filter(Boolean);
  const handoff = JSON.parse(readFileSync(handoffPath, 'utf8'));
  check('candidate_count_matches_handoff', candidateLines.length === handoff.inputs.candidateCount);
  check('candidates_only_first_party_or_openspec', candidateLines.every((line) => {
    const c = JSON.parse(line);
    return (c.c === 'FIRST_PARTY_SOURCE' || c.c === 'OPENSPEC_REQUIREMENTS')
      && (c.e === 'PRIORITY_CANDIDATE_REVISION_PENDING' || c.e === 'SECONDARY_CANDIDATE_UNTRACKED_REVISION_PENDING');
  }));
  check('handoff_not_admission', handoff.sourceAdmission === 'NOT_ADMITTED_NO_WORKSPACE_REVISION' && handoff.canonicalAuthority === false);
  check('receipt_no_writes', receipt.writesPerformed === false && receipt.databaseWrites === 0 && receipt.embeddingsGenerated === 0);

  const verdict = failures.length === 0 ? 'AUDIT_PASS' : 'AUDIT_FAIL';
  console.log(JSON.stringify({
    verdict,
    receiptVerdict: receipt.sourceClassSplitVerdict,
    rowsReadBack: rowCount,
    failures,
    warnings,
    checks,
    classTotalsRecomputed: totals,
    eligibilityRecomputed: eligibility,
  }, null, 2));
  if (verdict !== 'AUDIT_PASS') process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
