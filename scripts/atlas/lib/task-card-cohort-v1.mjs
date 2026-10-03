// WB-TASKCARD-OWNER-01 boundary: a frozen, revision/checksum-bound cohort of admitted task cards.
//
//   task-card selector (lifecycle admission)  ->  cohort  ->  ranker (scoring + execution gating)
//
// The cohort is the ONLY thing the ranker takes from the task-card corpus: it does not redefine which
// cards are eligible. `buildTaskCardCohortV1` is the reference implementation of the output contract;
// the selector owner (scripts/atlas/lib/openspec-report-manifest-v1.mjs::selectOpenSpecTaskCardsV1)
// should emit this shape or adopt this exporter. It adds no selection rules of its own: the caller
// states which `retrievalState`s and card `state`s are admitted, and both are recorded in the cohort.
import { createHash } from 'node:crypto';

export const COHORT_SCHEMA = 'atlas.task-card-cohort.v1';
const sha256 = (text) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const locatorKey = (sourcePath, sourceLine) => `${sourcePath}#${sourceLine}`;

/** @param taskCardCorpus an `atlas.openspec-task-card-corpus.v1` document ({ source, cards }) */
export function buildTaskCardCohortV1(taskCardCorpus, { retrievalStates = ['CURRENT'], states = ['OPEN'] } = {}) {
  const cards = taskCardCorpus?.cards;
  const source = taskCardCorpus?.source;
  if (!Array.isArray(cards) || !source?.taskFileHashes) throw new Error('COHORT_CORPUS_INVALID');
  const retrieval = new Set(retrievalStates);
  const lifecycle = new Set(states);
  const locators = cards
    .filter((card) => retrieval.has(card.retrievalState) && lifecycle.has(card.state))
    .map((card) => ({ stableKey: card.stableKey, sourcePath: card.sourcePath, sourceLine: card.sourceLine, taskRevision: card.taskRevision }))
    .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.sourceLine - b.sourceLine || a.stableKey.localeCompare(b.stableKey));
  const unsigned = {
    schema: COHORT_SCHEMA,
    corpusSchema: taskCardCorpus.schema ?? null,
    workspaceHead: source.workspaceHead ?? null,
    workspaceRevision: source.workspaceRevision ?? null,
    sourcePopulationChecksum: source.sourcePopulationChecksum ?? null,
    taskFileHashes: source.taskFileHashes,
    selection: { retrievalStates: [...retrieval].sort(), states: [...lifecycle].sort() },
    count: locators.length,
    locators,
    canonicalAuthority: false,
    mutationAuthorized: false,
    writesPerformed: false
  };
  return { ...unsigned, checksum: sha256(canonicalJson(unsigned)) };
}

export function verifyCohortChecksumV1(cohort) {
  if (cohort?.schema !== COHORT_SCHEMA) return false;
  const { checksum, ...unsigned } = cohort;
  return checksum === sha256(canonicalJson(unsigned));
}

/**
 * Fail-closed binding of a cohort to a Workboard ledger. A cohort locator is a (file, line) pair, so it
 * is only meaningful for the exact bytes of its file: any file whose hash differs between the cohort
 * and the ledger is STALE and none of its locators may be used.
 */
export function bindCohortToLedgerV1(cohort, ledger) {
  if (!verifyCohortChecksumV1(cohort)) throw new Error('COHORT_INVALID_OR_TAMPERED');
  const ledgerHashes = ledger?.sourceFileHashes ?? {};
  const files = new Set(cohort.locators.map((l) => l.sourcePath));
  const staleFiles = new Set();
  const missingFiles = new Set();
  for (const file of files) {
    const ledgerHash = ledgerHashes[file];
    if (!ledgerHash) missingFiles.add(file);
    else if (ledgerHash !== cohort.taskFileHashes[file]) staleFiles.add(file);
  }
  return {
    locatorKeys: new Set(cohort.locators.filter((l) => !staleFiles.has(l.sourcePath) && !missingFiles.has(l.sourcePath)).map((l) => locatorKey(l.sourcePath, l.sourceLine))),
    staleFiles: [...staleFiles].sort(),
    missingFiles: [...missingFiles].sort(),
    cohortChecksum: cohort.checksum,
    cohortWorkspaceRevision: cohort.workspaceRevision
  };
}
