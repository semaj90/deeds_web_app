import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const contextPath = path.join(ROOT, 'docs', 'reports', 'openspec-evidence-context-manifest-v1.json');
const outputPath = process.env.OPENSPEC_SYNTHESIS_PLAN_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_SYNTHESIS_PLAN_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-synthesis-plan-v1.json');
const jobTypes = ['SUMMARIZE', 'EXPLAIN_BLOCKER', 'RECOMMEND_NEXT'];

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
  const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
  const jobs = (context.cards ?? []).flatMap((card) => jobTypes.map((jobType) => ({
    jobId: `openspec-synthesis:${checksum({ taskId: card.ConceptID, jobType }).slice(7, 39)}`,
    jobType,
    taskId: card.ConceptID,
    sourceRef: card.sourceRef,
    cardChecksum: card.cardChecksum,
    contextManifestChecksum: context.checksum,
    outputClass: 'MODEL_SYNTHESIS_ONLY',
    proposalOnly: true,
  })));
  const unsigned = {
    schema: 'atlas.openspec-evidence-synthesis-plan.v1',
    mode: 'READ_ONLY_BOUNDED_JOB_PLAN',
    status: context.status === 'CONTEXT_MANIFEST_READY_NO_REDIS_WRITE' ? 'SYNTHESIS_JOBS_READY_NO_MODEL_CALL' : 'BLOCKED_CONTEXT_GATE',
    source: { contextManifest: relative(contextPath), workspaceRevision: context.source?.workspaceRevision ?? null },
    model: { owner: 'llama-server', expectedModelFamily: 'ornith-1.5', endpointFromEnv: 'LLAMA_SERVER_URL', modelFromEnv: 'LLAMA_SERVER_MODEL', liveCallExecuted: false },
    jobTypes,
    jobs,
    policy: { modelSynthesisOnly: true, proposalOnly: true, proofStatePromotion: false, taskMutation: false, rawRetrievalInjection: false, redisWrites: false, boundedJobCount: jobs.length },
    writesPerformed: false,
    likely_cause: 'Ornith may summarize resolved cards or explain blockers, but it must never promote evidence or mutate task claims.',
    evidence: [relative(contextPath), 'llama-server', 'ornith-1.5'],
    patch_targets: ['scripts/atlas/plan-openspec-evidence-synthesis-v1.mjs'],
    safe_next_command: 'node scripts/atlas/compile-openspec-evidence-context-manifest-v1.mjs',
    smoke_command: 'node --check scripts/atlas/plan-openspec-evidence-synthesis-v1.mjs',
    report_path: relative(outputPath),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, jobCount: jobs.length, writesPerformed: false, output: outputPath }, null, 2));
}

main();
