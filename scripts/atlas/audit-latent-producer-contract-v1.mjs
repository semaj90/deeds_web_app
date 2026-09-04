import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WRITER = path.join(ROOT, 'scripts', 'atlas', 'latent256-revision-qualified-wrapper.mts');
const LEGACY_WRITER = path.join(ROOT, 'scripts', 'atlas', 'backfill-latent-vectors.mjs');
const REPORT = path.join(ROOT, 'docs', 'reports', 'latent-producer-contract-v1.json');

const required = {
  computes768To64: /(?=[\s\S]*semantic_768)(?=[\s\S]*latent_256)(?=[\s\S]*latent_64)/,
  delegatesToProducer: /backfill_latent_256\.py/,
  declaresLatent64: /representationId:\s*['"]latent_64['"]|latent_64/,
  bindsSemanticInput: /inputRepresentationId:\s*['"]semantic_768['"]|semantic_768/,
  bindsModelDigest: /modelChecksum|parametersDigest|checkpointHash/,
  bindsProducerRevision: /producerRevision/,
  bindsCandidateSnapshot: /candidateSnapshotRevision|candidate-snapshot-revision|loadAndVerifyCorpusBundle/,
  bindsOrdinalChecksum: /ordinalMapChecksum|ordinal-map-checksum|inputPopulationChecksum/,
  requiresWorkspaceRevision: /workspace-revision|workspaceRevision/,
  requiresSourceRevision: /source-revision-set-checksum|sourceRevisionSetChecksum|sourceRevisionDigest/,
  hasExactChunkBinding: /chunk(?:Id|_id| identity)|codebase_chunk_index/,
  blocksOrdinaryApply: /legacy-unsafe-apply[\s\S]{0,180}never|never[\s\S]{0,180}legacy-unsafe-apply/,
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
    writer: 'scripts/atlas/latent256-revision-qualified-wrapper.mts',
    legacyWriter: 'scripts/atlas/backfill-latent-vectors.mjs',
    legacyWriterRole: 'compatibility-only; not a promotion producer',
    observedPipeline: 'semantic_768 → latent_256 → latent_128/latent_64 derived views',
    observedEncoding: 'wrapper-qualified producer output; legacy storage may be FP32 bytea',
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
