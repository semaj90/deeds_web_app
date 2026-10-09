import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPORTS = path.join(ROOT, 'docs', 'reports');
const outputPath = process.env.OPENSPEC_EVIDENCE_WORKBOARD_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_EVIDENCE_WORKBOARD_OUTPUT)
  : path.join(REPORTS, 'openspec-evidence-workboard-projection-v1.json');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function latestCensusPath() {
  if (process.env.OPENSPEC_CENSUS_PATH) return path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH);
  const scopedRoot = path.join(REPORTS, 'openspec-evidence');
  const candidates = fs.existsSync(scopedRoot)
    ? fs.readdirSync(scopedRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(scopedRoot, entry.name, 'census-v1.json'))
      .filter((filePath) => fs.existsSync(filePath))
    : [];
  if (candidates.length) return candidates.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
  return path.join(REPORTS, 'openspec-evidence-portfolio-census-v2.json');
}

function proofState(card) {
  return card?.proofState ?? 'CLAIM_ONLY';
}

function projectionState(task, card) {
  const state = proofState(card);
  if (state === 'PROVEN') return task.declaredChecked ? 'PROVEN_CLAIM' : 'PROOF_READY_NOT_CHECKED';
  if (state === 'STALE') return 'STALE_EVIDENCE';
  if (state === 'FAILED') return 'FAILED_CLAIM';
  if (state === 'BLOCKED' || (card?.blockers?.length ?? 0) > 0) return 'BLOCKED';
  if (state === 'PARTIAL') return 'PARTIAL_EVIDENCE';
  return task.declaredChecked ? 'CLAIM_ONLY_CHECKED' : 'CLAIM_ONLY_OPEN';
}

function compactRow(task, card) {
  const claim = String(task.taskText ?? '');
  const row = {
    taskRef: task.taskRef,
    taskId: task.canonicalTaskRef,
    changeId: task.changeId,
    authorityScope: task.authorityScope,
    archived: task.archived,
    taskIdStatus: task.taskIdStatus,
    claim: claim.length > 320 ? `${claim.slice(0, 317)}...` : claim,
    claimTruncated: claim.length > 320,
    taskRevision: task.taskHash,
    sourceRevision: task.sourceFileRevision ?? null,
    declaredChecked: task.declaredChecked,
    projectionState: projectionState(task, card),
    proofState: proofState(card),
    evidenceIds: card?.receiptRefs ?? [],
    blockers: card?.blockers ?? [],
    contradictions: card?.contradictions ?? [],
    dependencies: card?.dependencyRefs ?? task.resolvedDependencyTaskKeys ?? [],
    cardChecksum: card?.checksum ?? null,
  };
  for (const key of ['evidenceIds', 'blockers', 'contradictions', 'dependencies']) {
    if (Array.isArray(row[key]) && row[key].length === 0) delete row[key];
  }
  return row;
}

function main() {
  const censusPath = latestCensusPath();
  const bindingsPath = process.env.OPENSPEC_EVIDENCE_BINDINGS_PATH
    ? path.resolve(ROOT, process.env.OPENSPEC_EVIDENCE_BINDINGS_PATH)
    : path.join(REPORTS, 'openspec-task-evidence-bindings-v1.json');
  const cardsPath = process.env.OPENSPEC_EVIDENCE_CARDS_PATH
    ? path.resolve(ROOT, process.env.OPENSPEC_EVIDENCE_CARDS_PATH)
    : path.join(REPORTS, 'openspec-evidence-cards-v1.json');
  const census = readJson(censusPath);
  const bindings = readJson(bindingsPath);
  const cardsReport = readJson(cardsPath);
  if (census.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('CENSUS_SCHEMA_UNSUPPORTED');
  if (bindings.schema !== 'atlas.openspec-task-evidence-bindings.v1') throw new Error('BINDINGS_SCHEMA_UNSUPPORTED');
  if (cardsReport.schema !== 'atlas.openspec-evidence-cards.v1') throw new Error('CARDS_SCHEMA_UNSUPPORTED');
  const expectedRunId = process.env.OPENSPEC_EVIDENCE_RUN_ID ?? census.runId ?? null;
  if (expectedRunId && (bindings.runId !== expectedRunId || cardsReport.runId !== expectedRunId || census.runId !== expectedRunId)) {
    throw new Error('WORKBOARD_INPUT_RUN_ID_MISMATCH');
  }
  const workspaceRevision = census.source?.workspaceRevision ?? null;
  if (!workspaceRevision || bindings.source?.workspaceRevision !== workspaceRevision || cardsReport.source?.workspaceRevision !== workspaceRevision) {
    throw new Error('WORKBOARD_INPUT_REVISION_MISMATCH');
  }

  const cardsByRef = new Map((cardsReport.cards ?? []).map((card) => [card.taskIdentity?.taskRef, card]));
  const rows = (census.tasks ?? []).map((task) => compactRow(task, cardsByRef.get(task.taskRef)));
  const stateCounts = Object.fromEntries(rows.reduce((counts, row) => {
    counts.set(row.projectionState, (counts.get(row.projectionState) ?? 0) + 1);
    return counts;
  }, new Map()));
  const proofCounts = Object.fromEntries(rows.reduce((counts, row) => {
    counts.set(row.proofState, (counts.get(row.proofState) ?? 0) + 1);
    return counts;
  }, new Map()));
  const missingCards = rows.filter((row) => !row.cardChecksum).length;
  const unsigned = {
    schema: 'atlas.openspec-evidence-workboard-projection.v1',
    runId: expectedRunId,
    milestone: 'EVF-19',
    mode: 'DERIVED_READ_ONLY_WORKBOARD_PROJECTION',
    status: 'DERIVED_PROJECTION_NOT_PROMOTABLE',
    source: {
      census: relative(censusPath),
      bindings: relative(bindingsPath),
      cards: relative(cardsPath),
      workspaceRevision,
      taskAuthority: 'openspec/changes/*/tasks.md',
      proofAuthority: 'revision-bound evidence receipts',
    },
    summary: {
      taskCount: rows.length,
      cardCount: cardsReport.cards?.length ?? 0,
      missingCardCount: missingCards,
      projectionStateCounts: stateCounts,
      proofStateCounts: proofCounts,
      checkedCount: rows.filter((row) => row.declaredChecked).length,
      checkedWithoutProvenCount: rows.filter((row) => row.declaredChecked && row.proofState !== 'PROVEN').length,
      uncheckedButProvenCount: rows.filter((row) => !row.declaredChecked && row.proofState === 'PROVEN').length,
    },
    rows,
    contract: {
      taskIdentity: 'census canonicalTaskRef and exact taskRef',
      claimLedger: 'tasks.md remains the claim source',
      evidenceLedger: 'receipts determine proof state; cards only project it',
      claimText: 'bounded 320-character preview; taskRef remains the source locator',
      predicateDetail: 'retained in the task-evidence binding report, not duplicated here',
      sharedWorkboardOverwritten: false,
      taskCheckboxesMutated: false,
      persistentStoresMutated: false,
      promotionEligible: false,
    },
    likely_cause: 'A complete derived board must cover both OpenSpec roots while preserving tasks.md claims and evidence-receipt proof authority.',
    evidence: [relative(censusPath), relative(bindingsPath), relative(cardsPath)],
    patch_targets: ['scripts/atlas/build-openspec-evidence-workboard-projection-v1.mjs'],
    safe_next_command: 'node scripts/atlas/build-openspec-evidence-workboard-projection-v1.mjs',
    smoke_command: 'node --check scripts/atlas/build-openspec-evidence-workboard-projection-v1.mjs',
    report_path: relative(outputPath),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, summary: report.summary, writesPerformed: false, output: outputPath }, null, 2));
}

main();
