import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WRITER = path.join(ROOT, 'scripts', 'atlas', 'backfill-latent-vectors.mjs');
const REPORT = path.join(ROOT, 'docs', 'reports', 'latent-producer-contract-v1.json');

const required = {
  computes768To64: /768\s*[→>-]+\s*128\s*[→>-]+\s*64/,
  writesFloat32Bytea: /Float32Array\(entry\.latent_64\)/,
  declaresLatent64: /representationId:\s*['"]latent_64['"]|latent_64\s*=\s*bytea/,
  bindsSemanticInput: /sourceRepresentation(?:Id|Revision)|semantic_768/,
  bindsModelDigest: /model(?:Revision|Hash)|parametersDigest|checkpointHash/,
  bindsProducerRevision: /producerRevision/,
  bindsCandidateSnapshot: /candidateSnapshotRevision/,
  bindsOrdinalChecksum: /ordinalMapChecksum/,
  requiresWorkspaceRevision: /workspaceRevision[^\n]*required|workspace_revision[^\n]*IS NOT NULL/,
  requiresSourceRevision: /sourceRevision[^\n]*required|source_revision[^\n]*IS NOT NULL/,
  hasExactChunkBinding: /chunk(?:Id|_id| identity)|codebase_chunk_index/,
  blocksOrdinaryApply: /LATENT_LEGACY_WRITER_APPLY_BLOCKED|legacy-unsafe-apply/,
};

async function main() {
  const source = await readFile(WRITER, 'utf8');
  const checks = Object.fromEntries(
    Object.entries(required).map(([key, pattern]) => [key, pattern.test(source)]),
  );
  const missing = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([key]) => key);

  const report = {
    schema: 'atlas.latent-producer-contract.v1',
    readOnly: true,
    writer: 'scripts/atlas/backfill-latent-vectors.mjs',
    observedPipeline: 'semantic_768 → hidden_128 → latent_64',
    observedEncoding: 'FP32 bytea',
    checks,
    missing,
    status: missing.length === 0 ? 'PRODUCER_CONTRACT_READY_FOR_REVIEW' : 'PRODUCER_CONTRACT_INCOMPLETE',
    legacyApplyGuard: checks.blocksOrdinaryApply ? 'PROVEN' : 'MISSING',
    promotionEligible: missing.length === 0,
    nextGate: missing.length === 0
      ? 'INDEPENDENT_LATENT_CANARY_READBACK'
      : 'REPAIR_LATENT_WRITER_AND_ADD_ATOMIC_READBACK',
    writesPerformed: false,
  };

  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    schema: report.schema,
    readOnly: true,
    status: report.status,
    missing: report.missing,
    promotionEligible: report.promotionEligible,
    report: REPORT,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[latent-producer-contract] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
