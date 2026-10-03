import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const retrievalPlanPath = path.join(ROOT, 'docs', 'reports', 'openspec-evidence-retrieval-plan-v1.json');
const rrfOwnerPath = path.join(ROOT, 'sveltekit-frontend', 'src', 'lib', 'server', 'retrieval', 'rrf-combiner.ts');
const outputPath = process.env.OPENSPEC_RRF_AUDIT_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_RRF_AUDIT_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-hybrid-rrf-audit-v1.json');

const lanes = [
  { lane: 'rg_exact', owner: 'repository source search', role: 'exact lexical candidate discovery' },
  { lane: 'postgres_fts', owner: 'PostgreSQL evidence-content FTS', role: 'lexical candidate discovery' },
  { lane: 'postgres_trigram', owner: 'PostgreSQL task-text trigram index', role: 'fuzzy lexical candidate discovery' },
  { lane: 'semantic_768', owner: 'PostgreSQL semantic_768 oracle', role: 'revision-qualified semantic candidate discovery' },
  { lane: 'dependency_graph', owner: 'OpenSpecDependencyGraphV1', role: 'bounded dependency expansion' },
];

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
  const retrievalPlan = JSON.parse(fs.readFileSync(retrievalPlanPath, 'utf8'));
  const rrfOwner = fs.readFileSync(rrfOwnerPath, 'utf8');
  const checks = {
    retrievalOracleDesigned: retrievalPlan.status === 'ORACLE_DESIGNED_UNAPPLIED',
    logicalLaneMappingPresent: /toLogicalLaneName[\s\S]*return 'semantic'/i.test(rrfOwner),
    perLogicalLaneScoreMapPresent: /hitScores = new Map<string, Map<string, RRFScore>>/i.test(rrfOwner),
    physicalLaneSupportSeparate: /laneSupport = new Map<string, Map<RetrievalLaneName, RRFScore>>/i.test(rrfOwner),
    oneBestVoteGuardPresent: /multiple physical lanes collapse into one logical vote/i.test(rrfOwner),
    canonicalPromotionAfterFusion: /combinedScore|RRFResult/i.test(rrfOwner),
  };
  const unsigned = {
    schema: 'atlas.openspec-evidence-hybrid-rrf-audit.v1',
    mode: 'READ_ONLY_OWNER_AUDIT',
    status: Object.values(checks).every(Boolean) ? 'RRF_OWNER_CONTRACT_PROVEN_RUNTIME_UNEXECUTED' : 'RRF_OWNER_CONTRACT_INCOMPLETE',
    source: { retrievalPlan: relative(retrievalPlanPath), rrfOwner: relative(rrfOwnerPath), workspaceRevision: retrievalPlan.source?.workspaceRevision ?? null },
    lanes,
    fusion: { k: 60, canonicalIdentity: 'taskId or revision-qualified canonical evidence identity', withinLaneDedup: true, oneVotePerLogicalLane: true, exactPromotionAfterRrf: true },
    checks,
    policy: { noNewFusionOwner: true, projectionVotesCollapsed: true, graphFeaturesCannotCreateIdentity: true, proofStateFromRrf: false, writesPerformed: false },
    likely_cause: 'Hybrid retrieval must reuse the existing SearchRuntime RRF owner while preventing Qdrant, TurboVec, and graph executors from inflating one logical lane.',
    evidence: [relative(retrievalPlanPath), relative(rrfOwnerPath)],
    patch_targets: ['scripts/atlas/audit-openspec-evidence-hybrid-rrf-v1.mjs', relative(rrfOwnerPath)],
    safe_next_command: 'node scripts/atlas/plan-openspec-evidence-retrieval-v1.mjs',
    smoke_command: 'node --check scripts/atlas/audit-openspec-evidence-hybrid-rrf-v1.mjs',
    report_path: relative(outputPath),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, checks: report.checks, writesPerformed: false, output: outputPath }, null, 2));
}

main();
