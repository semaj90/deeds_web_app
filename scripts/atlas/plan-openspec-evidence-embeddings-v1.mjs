import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const cardsPath = process.env.OPENSPEC_CARDS_PATH
  ? path.resolve(ROOT, process.env.OPENSPEC_CARDS_PATH)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-cards-v1.json');
const outputPath = process.env.OPENSPEC_EMBEDDING_PLAN_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_EMBEDDING_PLAN_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-embedding-plan-v1.json');
const dimension = Number(process.env.OPENSPEC_EMBEDDING_DIMENSION ?? 768);
const receiptPath = process.env.OPENSPEC_MODEL_RECEIPT_PATH
  ? path.resolve(ROOT, process.env.OPENSPEC_MODEL_RECEIPT_PATH)
  : path.join(ROOT, 'docs', 'reports', 'emb-prov-01-embedding-provenance-receipt.json');
const receiptMaxAgeHours = Number(process.env.OPENSPEC_MODEL_RECEIPT_MAX_AGE_HOURS ?? 168);

/**
 * ANALYSIS-MODEL-RECEIPT-01: bind the model identity to an EMB-PROV-01 receipt instead of free
 * environment strings. Explicit env values still win and are reported as `ENV_OVERRIDE`
 * (unproven). A receipt binds only when it is PROVEN, its on-disk artifact checksum matches the
 * recorded revision, both executors agreed, it is a 768-d L2-normalized lane, and it is fresh.
 * The receipt proves artifact identity at its generation time; it does not prove that the
 * executor is reachable now.
 */
export function resolveModelBinding({ env = {}, receipt = null, now = Date.now(), maxAgeHours = 168 } = {}) {
  if (env.modelId && env.modelArtifactRevision) {
    return { modelId: env.modelId, modelArtifactRevision: env.modelArtifactRevision, source: 'ENV_OVERRIDE', proven: false, reason: 'ENV_VALUES_ARE_NOT_A_RECEIPT' };
  }
  if (!receipt) return { modelId: null, modelArtifactRevision: null, source: 'NONE', proven: false, reason: 'RECEIPT_MISSING' };
  const artifact = receipt.artifact ?? {};
  const parity = receipt.crossExecutorParity ?? {};
  const generated = Date.parse(receipt.generatedAt ?? '');
  const ageHours = Number.isFinite(generated) ? (now - generated) / 3_600_000 : Infinity;
  const checks = {
    statusProven: receipt.status === 'EMB_PROV_01_PROVEN',
    artifactChecksumMatches: artifact.artifactChecksumMatchesRevision === true && artifact.artifactChecksumMatchesGgufVar === true,
    revisionIsSha256: /^[0-9a-f]{64}$/.test(String(artifact.recordedModelArtifactRevision ?? '')),
    executorsAgree: parity.executorsAgree === true,
    dimension768: parity.parity?.dim === 768,
    provenanceFieldsRecorded: Boolean(receipt.provenanceFields?.tokenizerRevision && receipt.provenanceFields?.inputPolicyRevision),
    runtimeLoadedArtifactMatches: receipt.runtimeLoadedArtifact?.loadedMatchesArtifact === true,
    fresh: ageHours <= maxAgeHours
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  const base = String(artifact.modelPath ?? '').split(/[\\/]/).pop()?.replace(/\.gguf$/i, '') || null;
  return {
    modelId: failed.length ? null : base,
    modelArtifactRevision: failed.length ? null : artifact.recordedModelArtifactRevision,
    source: 'EMB_PROV_01_RECEIPT',
    proven: failed.length === 0,
    modelIdDerivedFromArtifactFilename: true,
    provenance: failed.length ? null : {
      artifactBytes: artifact.artifactBytes ?? null,
      tokenizerRevision: receipt.provenanceFields.tokenizerRevision,
      tokenizerSha256: receipt.provenanceFields.tokenizerSha256 ?? null,
      inputPolicyRevision: receipt.provenanceFields.inputPolicyRevision
    },
    receipt: { schema: receipt.schema ?? null, status: receipt.status ?? null, generatedAt: receipt.generatedAt ?? null, ageHours: Number.isFinite(ageHours) ? Math.round(ageHours) : null, maxAgeHours },
    checks,
    reason: failed.length ? `RECEIPT_CHECKS_FAILED:${failed.join(',')}` : null
  };
}

function readReceipt() {
  try {
    return JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  } catch {
    return null;
  }
}

const binding = resolveModelBinding({
  env: { modelId: process.env.OPENSPEC_EMBEDDING_MODEL_ID, modelArtifactRevision: process.env.OPENSPEC_EMBEDDING_MODEL_REVISION },
  receipt: readReceipt(),
  maxAgeHours: receiptMaxAgeHours
});
const modelId = binding.proven ? binding.modelId : null;
const modelArtifactRevision = binding.proven ? binding.modelArtifactRevision : null;
const representations = ['TASK_CLAIM_768', 'EVIDENCE_CARD_768', 'PREDICATE_768', 'BLOCKER_768', 'SUMMARY_768'];

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

function readCards() {
  if (!fs.existsSync(cardsPath)) throw new Error(`MISSING_CARDS:${cardsPath}`);
  const report = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
  if (report.schema !== 'atlas.openspec-evidence-cards.v1') throw new Error('CARDS_SCHEMA_UNSUPPORTED');
  if (!Array.isArray(report.cards)) throw new Error('CARDS_ARRAY_MISSING');
  return report;
}

function main() {
  const cards = readCards();
  const cardChecksums = cards.cards.map((card) => card.checksum).sort();
  const inputRevision = checksum({ workspaceRevision: cards.source.workspaceRevision, cardChecksums });
  const rowsByRepresentation = Object.fromEntries(representations.map((representation) => [representation, cards.cards.length]));
  const unsigned = {
    schema: 'atlas.openspec-evidence-embedding-plan.v1',
    mode: 'READ_ONLY_INPUT_MANIFEST',
    status: modelId && modelArtifactRevision ? 'INPUTS_READY_NO_EMBEDDINGS' : 'MODEL_ARTIFACT_UNPROVEN',
    source: { cards: relative(cardsPath), workspaceRevision: cards.source.workspaceRevision, cardsChecksum: cards.checksum },
    representation: { names: representations, canonicalName: 'semantic_768', dimension, inputRevision },
    model: { modelId, modelArtifactRevision, modelReceiptRequired: true, binding },
    counts: { cards: cards.cards.length, plannedInputs: cards.cards.length * representations.length, rowsByRepresentation },
    sampleInputs: cards.cards.slice(0, 5).flatMap((card) => representations.map((representation) => ({ representation, taskId: card.taskId, cardChecksum: card.checksum, inputRevision }))),
    policy: {
      canonicalDenseOwner: 'PostgreSQL after authorized ledger admission',
      vectorWrites: false,
      qdrantWrites: false,
      cuvsWrites: false,
      turbovecWrites: false,
      exactInputIdentityRequired: true,
      legacy384Allowed: false,
      proofStateCreatedByEmbedding: false,
    },
    writesPerformed: false,
    likely_cause: 'Embedding work must bind to immutable EvidenceCard inputs and an exact model artifact before any vector is treated as canonical or projected.',
    evidence: [relative(cardsPath), 'semantic_768', 'EvidenceCard checksum list'],
    patch_targets: ['scripts/atlas/plan-openspec-evidence-embeddings-v1.mjs'],
    safe_next_command: 'node scripts/atlas/plan-openspec-evidence-ledger-import-v1.mjs',
    smoke_command: 'node --check scripts/atlas/plan-openspec-evidence-embeddings-v1.mjs',
    report_path: relative(outputPath),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, dimension, plannedInputs: report.counts.plannedInputs, writesPerformed: report.writesPerformed, output: outputPath }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
