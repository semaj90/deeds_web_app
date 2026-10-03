import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const cardsPath = path.join(ROOT, 'docs', 'reports', 'openspec-evidence-cards-v1.json');
const graphPath = path.join(ROOT, 'docs', 'reports', 'openspec-dependency-graph-v1.json');
const embeddingPath = path.join(ROOT, 'docs', 'reports', 'openspec-evidence-embedding-plan-v1.json');
const outputPath = process.env.OPENSPEC_LOW_RANK_PLAN_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_LOW_RANK_PLAN_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-low-rank-plan-v1.json');

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

function main() {
  const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const embedding = JSON.parse(fs.readFileSync(embeddingPath, 'utf8'));
  const stateFeatures = ['claim_only', 'partial', 'proven', 'blocked', 'failed', 'stale'];
  const unsigned = {
    schema: 'atlas.openspec-evidence-low-rank-plan.v1',
    mode: 'READ_ONLY_ROUTING_FEATURE_PLAN',
    status: embedding.status === 'INPUTS_READY_NO_EMBEDDINGS' ? 'LOW_RANK_INPUTS_READY_NO_PROJECTION' : 'BLOCKED_EMBEDDING_ARTIFACT_GATE',
    source: { cards: relative(cardsPath), graph: relative(graphPath), embeddingPlan: relative(embeddingPath), workspaceRevision: cards.source.workspaceRevision },
    featureSchema: { semanticDimensions: 128, graphDimensions: 64, evidenceStateFeatures: stateFeatures, recencyFeatures: ['age_days', 'source_revision_age'], breadthFeatures: ['dependency_in_degree', 'dependency_out_degree', 'receipt_count'], costFeatures: ['estimated_tokens', 'estimated_bytes'], outputDimensions: 64 },
    counts: { taskCards: cards.cards.length, graphNodes: graph.summary?.nodeCount ?? null, graphEdges: graph.summary?.edgeCount ?? null, latentRowsPlanned: cards.cards.length },
    projection: { name: 'LOW_RANK_PROJECT', output: 'latent64', modelArtifactRequired: true, modelCallExecuted: false, proofAuthority: false, retrievalVote: false },
    policy: { routingOnly: true, prioritizationOnly: true, identityCreation: false, proofPromotion: false, taskMutation: false, writesPerformed: false },
    likely_cause: 'Low-rank features can reduce routing cost, but they must remain derived from evidence-qualified identity and never become proof or a retrieval vote.',
    evidence: [relative(cardsPath), relative(graphPath), relative(embeddingPath)],
    patch_targets: ['scripts/atlas/plan-openspec-evidence-low-rank-v1.mjs'],
    safe_next_command: 'node scripts/atlas/plan-openspec-evidence-embeddings-v1.mjs',
    smoke_command: 'node --check scripts/atlas/plan-openspec-evidence-low-rank-v1.mjs',
    report_path: relative(outputPath),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, outputDimensions: report.featureSchema.outputDimensions, retrievalVote: report.projection.retrievalVote, writesPerformed: false, output: outputPath }, null, 2));
}

main();
