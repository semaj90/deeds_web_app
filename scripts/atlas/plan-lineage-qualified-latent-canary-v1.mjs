import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAP = path.join(ROOT, 'docs', 'reports', 'lineage-qualified-candidate-map-v1.json');
const LATENT_AUDIT = path.join(ROOT, 'docs', 'reports', 'lineage-latent-cohort-v1.json');
const REPORT = path.join(ROOT, 'docs', 'reports', 'lineage-qualified-latent-canary-plan-v1.json');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function main() {
  const map = await readJson(MAP);
  const latent = await readJson(LATENT_AUDIT);
  const candidates = (map.candidates ?? []).map((candidate, candidateOrdinal) => ({
    candidateOrdinal,
    packetKey: candidate.packetKey,
    sourceRef: candidate.sourceRef,
    sourceRevision: candidate.sourceRevision,
    workspaceRevision: map.lineage?.workspaceRevision ?? null,
    inputRepresentationId: 'semantic_768',
    outputRepresentationId: 'ae_latent_64',
    status: 'PLAN_ONLY',
  }));

  const report = {
    schema: 'atlas.lineage-qualified-latent-canary-plan.v1',
    readOnly: true,
    writes: { postgresWrites: false, qdrantWrites: false, valkeyWrites: false, fileArtifactWrites: false },
    candidateMap: {
      rowCount: candidates.length,
      workspaceRevision: map.lineage?.workspaceRevision ?? null,
      candidateSnapshotRevision: map.map?.candidateSnapshotRevision ?? null,
      ordinalMapChecksum: map.map?.ordinalMapChecksum ?? null,
    },
    requiredArtifact: {
      schema: 'atlas.representation-artifact.v1',
      inputRepresentationId: 'semantic_768',
      outputRepresentationId: 'ae_latent_64',
      dimensions: 64,
      exactChunkBindingRequired: true,
      modelRevisionRequired: true,
      producerRevisionRequired: true,
      parametersDigestRequired: true,
      inputDigestRequired: true,
      outputDigestRequired: true,
      atomicReadbackRequired: true,
    },
    latentAudit: {
      candidateCount: latent.candidateCount,
      rowsFound: latent.rowsFound,
      counts: latent.counts,
      promotionEligible: latent.promotionEligible,
    },
    candidates,
    status: latent.promotionEligible && candidates.length > 0
      ? 'READY_FOR_EXPLICIT_PRODUCER_REVIEW'
      : 'BLOCKED_LEGACY_LATENT_PROVENANCE',
    nextGate: 'REPAIR_LATENT_PRODUCER_BEFORE_ANY_APPLY',
  };

  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    schema: report.schema,
    readOnly: true,
    status: report.status,
    candidateCount: candidates.length,
    nextGate: report.nextGate,
    report: REPORT,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[latent-canary-plan] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
