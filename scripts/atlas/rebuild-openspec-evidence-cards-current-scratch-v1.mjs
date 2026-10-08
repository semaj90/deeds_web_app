import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPortfolioCensus, computeOpenSpecWorkspaceRevisionV1 } from './audit-openspec-evidence-fabric-v1.mjs';
import { buildOpenSpecTaskEvidenceBindingsV1 } from './resolve-openspec-predicates-v1.mjs';
import { compileOpenSpecEvidenceCardsV1 } from './compile-openspec-evidence-cards-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runId = new Date().toISOString().replace(/\D/g, '').slice(0, 17);
const scratchRunId = `scratch-current-${runId}-${process.pid}`;
const defaultOutput = path.join('.tmp', 'openspec-evidence-current', `${runId}-cards-v1.json`);
const outputPath = path.resolve(ROOT, process.env.OPENSPEC_CURRENT_CARDS_OUTPUT ?? defaultOutput);
const scratchRoot = path.resolve(ROOT, '.tmp');

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function checksumMatches(value) {
  const { checksum, ...unsigned } = value;
  const expected = `sha256:${crypto.createHash('sha256').update(canonicalJson(unsigned), 'utf8').digest('hex')}`;
  return checksum === expected;
}

function assertScratchOutput(filePath) {
  const relativePath = path.relative(scratchRoot, filePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('OUTPUT_MUST_BE_WITHIN_REPO_TMP');
  }
}

assertScratchOutput(outputPath);
const beforeRevision = computeOpenSpecWorkspaceRevisionV1(ROOT);
const census = buildPortfolioCensus(ROOT);
if (census.source?.workspaceRevision !== beforeRevision) throw new Error('CENSUS_REVISION_CHANGED_DURING_CAPTURE');
census.runId = scratchRunId;

const bindings = buildOpenSpecTaskEvidenceBindingsV1(census);
const cards = compileOpenSpecEvidenceCardsV1(bindings, census, {
  census: 'IN_MEMORY_CURRENT_CENSUS',
  bindings: 'IN_MEMORY_CURRENT_BINDINGS',
});
const afterRevision = computeOpenSpecWorkspaceRevisionV1(ROOT);
if (afterRevision !== beforeRevision) throw new Error('WORKSPACE_REVISION_CHANGED_DURING_PROJECTION');
if (cards.source?.workspaceRevision !== beforeRevision || cards.runId !== bindings.runId) {
  throw new Error('CURRENT_PROJECTION_BINDING_MISMATCH');
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const fd = fs.openSync(outputPath, 'wx');
try {
  fs.writeFileSync(fd, `${JSON.stringify(cards, null, 2)}\n`, 'utf8');
} finally {
  fs.closeSync(fd);
}

const readback = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
if (!checksumMatches(readback)
  || readback.checksum !== cards.checksum
  || readback.summary?.cardCount !== bindings.bindings.length
  || readback.cards.some((card) => !checksumMatches(card))) {
  throw new Error('SCRATCH_CARD_READBACK_MISMATCH');
}

const receiptQualifiedMatches = census.proofEligibleReceiptMatches ?? [];
const qualifiedReceiptRefs = new Set(receiptQualifiedMatches.map((match) => match.evidenceId).filter(Boolean));
const cardsWithQualifiedReceipt = readback.cards.filter((card) => card.receiptRefs.some((evidenceId) => qualifiedReceiptRefs.has(evidenceId)));

console.log(JSON.stringify({
  schema: cards.schema,
  runId: cards.runId,
  workspaceRevision: cards.source.workspaceRevision,
  bindingChecksum: bindings.checksum,
  cardChecksum: cards.checksum,
  summary: cards.summary,
  qualifiedReceiptMatchCount: receiptQualifiedMatches.length,
  cardsWithQualifiedReceiptCount: cardsWithQualifiedReceipt.length,
  qualifiedReceiptCardsByProofState: Object.fromEntries([...new Set(cardsWithQualifiedReceipt.map((card) => card.proofState))]
    .sort().map((state) => [state, cardsWithQualifiedReceipt.filter((card) => card.proofState === state).length])),
  canonicalAuthority: cards.source.canonicalAuthority,
  persistentStoreWrites: cards.sideEffects.persistentStoresMutated,
  output: relative(outputPath),
}, null, 2));
