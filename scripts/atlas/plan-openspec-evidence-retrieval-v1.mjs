import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const embeddingPath = path.join(ROOT, 'docs', 'reports', 'openspec-evidence-embedding-plan-v1.json');
const migrationPath = path.join(ROOT, 'docs', 'reports', 'openspec-evidence-migration-dry-run-v1.json');
const outputPath = process.env.OPENSPEC_RETRIEVAL_PLAN_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_RETRIEVAL_PLAN_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-retrieval-plan-v1.json');

const exactSqlOracle = `
WITH exact_candidates AS (
  SELECT
    chunk.chunk_id,
    chunk.canonical_id,
    chunk.change_id,
    chunk.task_id,
    chunk.evidence_id,
    chunk.workspace_revision,
    chunk.source_revision,
    chunk.representation_revision,
    1 - (chunk.embedding <=> $1::vector) AS cosine_similarity
  FROM public.openspec_evidence_chunks AS chunk
  WHERE chunk.representation_revision = 'semantic_768'
    AND chunk.workspace_revision = $2
    AND chunk.embedding IS NOT NULL
  ORDER BY chunk.embedding <=> $1::vector, chunk.chunk_id
  LIMIT $3
)
SELECT
  candidate.*,
  current_task.proof_state,
  current_task.declared_checked
FROM exact_candidates AS candidate
LEFT JOIN public.openspec_task_current AS current_task
  ON current_task.change_id = candidate.change_id
 AND current_task.task_id = candidate.task_id
 AND current_task.workspace_revision = candidate.workspace_revision
ORDER BY candidate.cosine_similarity DESC, candidate.chunk_id;
`.trim();

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

function main() {
  const embedding = readJson(embeddingPath);
  const migration = readJson(migrationPath);
  const unsigned = {
    schema: 'atlas.openspec-evidence-retrieval-plan.v1',
    mode: 'READ_ONLY_SQL_ORACLE_DESIGN',
    status: migration.checks?.retrievalMetadataIndexes && migration.checks?.trigramAndFtsIndexes && embedding.representation?.dimension === 768
      ? 'ORACLE_DESIGNED_UNAPPLIED'
      : 'ORACLE_DESIGN_BLOCKED',
    source: { embeddingPlan: relative(embeddingPath), migrationDryRun: relative(migrationPath), workspaceRevision: embedding.source?.workspaceRevision ?? null },
    canonicalLane: { representation: 'semantic_768', dimension: 768, distance: 'cosine', owner: 'PostgreSQL' },
    exactSqlOracle,
    parameters: { '$1': 'canonical semantic_768 query vector', '$2': 'workspace revision', '$3': 'bounded candidate limit' },
    checks: {
      canonical768: embedding.representation?.canonicalName === 'semantic_768' && embedding.representation?.dimension === 768,
      hnswCosineDesign: migration.checks?.hnswCosineIndex === true,
      metadataIndexDesign: migration.checks?.retrievalMetadataIndexes === true,
      lexicalIndexDesign: migration.checks?.trigramAndFtsIndexes === true,
      exactPromotionJoin: true,
      liveQueryExecuted: false,
    },
    policy: {
      projectionWrites: false,
      qdrantWrites: false,
      cuvsWrites: false,
      turbovecWrites: false,
      exactPromotionRequired: true,
      proofStateFromRetrieval: false,
      canonicalTaskIdentityFromVector: false,
    },
    writesPerformed: false,
    likely_cause: 'Semantic retrieval needs a deterministic PostgreSQL oracle and revision-qualified identity join before any approximate projection can be compared or promoted.',
    evidence: [relative(embeddingPath), relative(migrationPath), 'semantic_768', 'public.openspec_task_current'],
    patch_targets: ['scripts/atlas/plan-openspec-evidence-retrieval-v1.mjs', 'sveltekit-frontend/drizzle/manual/20261001_openspec_evidence_retrieval_v1.sql'],
    safe_next_command: 'node scripts/atlas/audit-openspec-evidence-migration-v1.mjs',
    smoke_command: 'node --check scripts/atlas/plan-openspec-evidence-retrieval-v1.mjs',
    report_path: relative(outputPath),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, checks: report.checks, writesPerformed: report.writesPerformed, output: outputPath }, null, 2));
}

main();
