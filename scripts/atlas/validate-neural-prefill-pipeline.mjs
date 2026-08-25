#!/usr/bin/env node

/**
 * Read-only validation gate for the Parent Atlas neural prefill pipeline.
 * It validates contracts and rebuildable dry-run receipts only. It does not
 * start Graphify, train adapters, or write any store.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const files = {
  embeddingContract: 'sveltekit-frontend/src/lib/server/atlas/embedding/embeddinggemma-task-representation-v1.ts',
  parameterContract: 'sveltekit-frontend/src/lib/server/atlas/contracts/parameter-artifact-lookup-v1.ts',
  qloraGate: 'sveltekit-frontend/src/lib/server/atlas/neural/qlora-training-gate.ts',
  lowRank: 'python/atlas_compute/low_rank.py',
  shortlistReceipt: 'docs/reports/atlas-candidate-shortlist-receipt-v1.json',
  dailyReceipt: 'docs/reports/atlas-graphify-nlp-prefill-dry-v1.json',
  aggregateReceipt: 'docs/reports/atlas-observation-feature-aggregation-v1.json',
  domainBaselineReceipt: 'docs/reports/ast-domain-baselines-dry-v1.json',
  materializationReceipt: 'docs/reports/observation-feature-row-materialization.json',
  indexingAudit: 'docs/reports/atlas-indexing-surfaces-v1.json',
};

const checks = [];
const read = async (relative) => fs.readFile(path.join(root, relative), 'utf8');
const exists = async (relative) => {
  try { await fs.access(path.join(root, relative)); return true; } catch { return false; }
};
const add = (id, status, evidence, next) => checks.push({ id, status, evidence, next });

const embedding = await read(files.embeddingContract).catch(() => '');
add('EMBEDDING_GEOMETRY', embedding.includes('EMBEDDINGGEMMA_NATIVE_DIMENSION') && embedding.includes('projectEmbeddingGemmaMrlV1') && embedding.includes('norm') ? 'PASS' : 'BLOCKED',
  'EmbeddingGemma representation contract is present with revision and L2 geometry fields.',
  'Run the MRL corpus benchmark before promotion.');

const parameter = await read(files.parameterContract).catch(() => '');
add('PARAMETER_LOOKUP', parameter.includes('ParameterArtifactLookupV1Schema') && parameter.includes('matchesParameterArtifactLookupV1') ? 'PASS' : 'BLOCKED',
  'Revision-aware model/artifact lookup and compatibility gate are present.',
  'Add a durable registry only after contract adoption is approved.');

const qlora = await read(files.qloraGate).catch(() => '');
add('QLORA_BOUNDARY', qlora.includes('onlineTrainingAllowed: z.literal(false)') && qlora.includes('canonicalWritesAllowed: z.literal(false)') ? 'PASS' : 'BLOCKED',
  'QLoRA gate forbids online training and canonical writes.',
  'Require verified tournament tuples and held-out shadow metrics.');

const lowRank = await read(files.lowRank).catch(() => '');
const shortlist = JSON.parse(await read(files.shortlistReceipt).catch(() => '{}'));
const shortlistExecuted = shortlist.status === 'EXECUTED_UNPROVEN'
  && shortlist.inputCount === 512
  && shortlist.targetCount === 96
  && Array.isArray(shortlist.candidateOrdinals)
  && shortlist.candidateOrdinals.length === 96
  && typeof shortlist.ordinalMapChecksum === 'string';
const exactRerankExecuted = shortlist.quality?.exactRerank === 'EXECUTED'
  && typeof shortlist.quality?.recallAt24 === 'number';
add('LOW_RANK_POLICY', shortlistExecuted ? 'DEGRADED' : lowRank.length > 0 ? 'DEGRADED' : 'BLOCKED',
  shortlistExecuted
    ? exactRerankExecuted
      ? `Read-only 512-to-96 receipt and exact semantic_768 rerank executed; oracle Recall@24=${shortlist.quality.recallAt24.toFixed(3)}. No labeled relevance proof yet.`
      : 'Read-only 512-to-96 shortlist receipt preserves CandidateOrdinals and an ordinal-map checksum; exact quality is not proven.'
    : lowRank.length > 0 ? 'Low-rank primitive exists; Tang-style length-square sampling is not claimed.' : 'Low-rank primitive is missing.',
  shortlistExecuted
    ? exactRerankExecuted ? 'Add labeled relevance/RRF evaluation and repeat on held-out query groups.' : 'Run exact semantic_768 rerank and Recall/NDCG comparison.'
    : 'Run a live 512-to-96 receipt joined to CandidateOrdinal.');

const aggregate = JSON.parse(await read(files.aggregateReceipt).catch(() => '{}'));
const materialization = JSON.parse(await read(files.materializationReceipt).catch(() => '{}'));
const materializationPassed = materialization.mode === 'APPLY'
  && materialization.planRows > 0
  && materialization.rowsMaterialized === materialization.planRows
  && Array.isArray(materialization.validationErrors)
  && materialization.validationErrors.length === 0;
add('PACKET_AGGREGATION', materializationPassed
  ? 'PASS'
  : aggregate.outputProjectionRows > 0 && aggregate.writes === false ? 'DEGRADED' : 'BLOCKED',
  materializationPassed
    ? `${materialization.rowsMaterialized} packet-level ORF rows materialized from ${materialization.planRows} plans with zero validation errors.`
    : `${aggregate.outputProjectionRows ?? 0} packet-level review rows emitted without a verified materialization receipt.`,
  materializationPassed
    ? 'Expand beyond the reviewed snapshot during full daily adoption.'
    : 'Review aggregation and ORF materialization before promotion.');

const daily = JSON.parse(await read(files.dailyReceipt).catch(() => '{}'));
add('DAILY_NLP_PREFILL', daily.status === 'PASS' ? 'PASS' : daily.status ? 'DEGRADED' : 'PENDING',
  daily.status ? `Bounded daily dry receipt status: ${daily.status}.` : 'No daily dry receipt found.',
  'A failure must leave the existing Graphify receipt intact and continue in degraded mode.');

const domainBaseline = JSON.parse(await read(files.domainBaselineReceipt).catch(() => '{}'));
const baselineValid = domainBaseline.schema === 'atlas.ast-domain-baselines-dry.v1'
  && domainBaseline.readOnly === true
  && domainBaseline.databaseWrites === false
  && domainBaseline.canonicalWrites === false
  && domainBaseline.status === 'PASS_READ_ONLY_BASELINES'
  && typeof domainBaseline.models?.naiveBayes?.macroF1 === 'number'
  && typeof domainBaseline.models?.logisticRegression?.macroF1 === 'number'
  && Number(domainBaseline.dataset?.astGrepRows ?? 0) > 0;
add('AST_DOMAIN_BASELINES', baselineValid ? 'PASS' : 'BLOCKED',
  baselineValid
    ? `AST-grep/NLP baseline receipt covers ${domainBaseline.dataset.selected} labeled rows; logistic macro-F1=${domainBaseline.models.logisticRegression.macroF1.toFixed(3)}, Naive Bayes macro-F1=${domainBaseline.models.naiveBayes.macroF1.toFixed(3)}. Candidate labels remain non-promotional.`
    : 'AST-domain baseline receipt is missing, malformed, or not read-only.',
  baselineValid
    ? 'Replace candidate labels with reviewed ground truth before model promotion.'
    : 'Run atlas:ast-domain:baselines:dry and inspect its receipt.');

const indexing = JSON.parse(await read(files.indexingAudit).catch(() => '{}'));
add('INDEX_METADATA', await exists(files.indexingAudit) ? 'DEGRADED' : 'PENDING',
  indexing.lexicalOwner ?? 'Indexing ownership audit exists; live metadata/extension state remains environment-dependent.',
  'Keep Postgres typed columns and JSONB GIN as separate ownership layers.');

const blocked = checks.filter((check) => check.status === 'BLOCKED').length;
const pending = checks.filter((check) => check.status === 'PENDING').length;
const status = blocked > 0 ? 'BLOCKED' : pending > 0 ? 'DEGRADED' : 'PASS';
const report = {
  schema: 'atlas.neural-prefill-validation-receipt.v1',
  generatedAt: new Date().toISOString(),
  status,
  readinessPercent: status === 'PASS' ? 70 : status === 'DEGRADED' ? 60 : 40,
  readOnly: true,
  databaseWrites: false,
  qdrantWrites: false,
  valkeyWrites: false,
  trainingStarted: false,
  gracefulFallback: {
    enabledByPolicy: true,
    behavior: 'CONTINUE_WITH_EXISTING_GRAPHIFY_RECEIPT',
    canonicalMutation: false,
  },
  checks,
};
const output = path.join(root, 'docs/reports/atlas-neural-prefill-validation-v1.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
process.exitCode = status === 'BLOCKED' ? 2 : 0;
