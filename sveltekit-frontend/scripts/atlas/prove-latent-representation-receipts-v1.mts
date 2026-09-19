#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RepresentationArtifactV1Schema,
  assertPromotionReadyRepresentationArtifact,
  assertRepresentationFamilyRevisionBinding,
} from '../../src/lib/server/atlas/tensors/representation-artifact-v1.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const output = resolve(repoRoot, 'docs/reports/latent-representation-receipts-v1.json');
const sha = (value: string) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

const common = {
  schema: 'atlas.representation-artifact.v1' as const,
  representationFamily: 'nested-semantic-autoencoder',
  dtype: 'float32' as const,
  normalization: 'l2' as const,
  workspaceId: 'fixture-workspace',
  repositoryId: 'fixture-repository',
  sourceAuthorityStatus: 'UNPROVEN' as const,
  producerId: 'atlas-latent-producer',
  producerRevision: 'producer:fixture-v1',
  modelChecksum: 'a'.repeat(64),
  modelRevision: 'model:fixture-v1',
  parametersDigest: sha('parameters:v1'),
  transformPolicyRevision: 'nested-semantic-autoencoder:v1',
  inputDigest: sha('semantic-768-input'),
  inputPopulationChecksum: sha('population:fixture'),
  outputPopulationChecksum: sha('population:fixture'),
  rowCount: 2,
  eligibleCount: 2,
  processedCount: 2,
  writtenCount: 0,
  unchangedCount: 2,
  rejectedCount: 0,
  canonicalAuthority: false as const,
};

const latent128 = RepresentationArtifactV1Schema.parse({
  ...common,
  representationId: 'latent_128',
  representationRevision: 'latent_128:fixture-v1',
  dimensions: 128,
  inputRepresentationId: 'latent_256',
  inputRepresentationRevision: 'latent_256:fixture-v1',
  inputDigest: sha('latent-256-input'),
  outputDigest: sha('latent-128-output'),
  tensorDigest: sha('latent-128-tensor'),
  artifactDigest: sha('latent-128-artifact'),
});

const latent64 = RepresentationArtifactV1Schema.parse({
  ...common,
  representationId: 'latent_64',
  representationRevision: 'latent_64:fixture-v1',
  dimensions: 64,
  inputRepresentationId: 'latent_256',
  inputRepresentationRevision: 'latent_256:fixture-v1',
  inputDigest: sha('latent-256-input'),
  outputDigest: sha('latent-64-output'),
  tensorDigest: sha('latent-64-tensor'),
  artifactDigest: sha('latent-64-artifact'),
});

for (const artifact of [latent128, latent64]) assertPromotionReadyRepresentationArtifact(artifact);
assertRepresentationFamilyRevisionBinding([latent128, latent64]);

const report = {
  schema: 'ParentAtlasLatentRepresentationReceiptsProofV1',
  status: 'LATENT_RECEIPTS_REVISION_BOUND',
  evidenceClass: 'FIXTURE_ONLY',
  representations: [latent128, latent64].map((artifact) => ({
    representationId: artifact.representationId,
    dimensions: artifact.dimensions,
    representationRevision: artifact.representationRevision,
    inputRepresentationId: artifact.inputRepresentationId,
    inputRepresentationRevision: artifact.inputRepresentationRevision,
    artifactDigest: artifact.artifactDigest,
    outputPopulationChecksum: artifact.outputPopulationChecksum,
  })),
  familyRevisionBinding: true,
  independentArtifactReceipts: true,
  latent128Materialization: 'VIRTUAL_DERIVED_VIEW',
  latent64Materialization: 'PERSISTED_DERIVED_VIEW',
  canonicalAuthority: false,
  writesPerformed: false,
  promotionAuthorized: false,
  nextRequirement: 'CURRENT_LINEAGE_QUALIFIED_ARTIFACT_READBACK',
};

mkdirSync(resolve(repoRoot, 'docs/reports'), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, output, familyRevisionBinding: report.familyRevisionBinding }, null, 2));

