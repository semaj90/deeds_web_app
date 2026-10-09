import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  buildObservationFeatureRegistry,
  compileObservationFeatures,
  observationFeatureChecksum,
} from '../../../packages/parent-atlas/src/core/observation-feature-compiler.ts';
import { ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1 } from './orf-ast-feature-definition-proposal-v1.mjs';

function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function compileLiveAstObservationProposalV1(proof: Record<string, any>, rootObservation?: Record<string, any>) {
  const { checksum, ...payload } = proof;
  if (proof.schema !== 'atlas.live-packet-symbol-ast-observation-proof.v1'
    || proof.status !== 'READ_ONLY_SOURCE_AND_AST_OBSERVATION_MATCH'
    || typeof checksum !== 'string'
    || sha256Json(payload) !== checksum
    || !Number.isInteger(proof.spanMismatchCount) || proof.spanMismatchCount < 0
    || proof.canonicalAuthority !== false
    || proof.persistentStoreWritesPerformed !== false) {
    throw new Error('LIVE_AST_PROOF_NOT_VERIFIED');
  }

  const binding = proof.exactBinding;
  if (!binding || binding.admissionStatus !== 'PROPOSAL_ONLY'
    || binding.canonicalAuthority !== false
    || !binding.packetKey || !binding.symbolVersionId || !binding.sourceRef
    || !binding.sourceRevision || !binding.workspaceRevision
    || !Number.isInteger(binding.byteStart) || binding.byteStart < 0
    || !Number.isInteger(binding.byteEnd) || binding.byteEnd <= binding.byteStart
    || binding.sourceBytesChecksum !== binding.sourceRevision
    || !/^[a-f0-9]{64}$/.test(String(binding.spanChecksum ?? ''))
    || !binding.astObservation || binding.astObservation.canonical_authority !== false
    || binding.astObservation.source_ref !== binding.sourceRef
    || binding.astObservation.source_revision !== binding.sourceRevision
    || binding.astObservation.byte_start !== binding.byteStart
    || binding.astObservation.byte_end !== binding.byteEnd) {
    throw new Error('LIVE_AST_BINDING_NOT_QUALIFIED');
  }

  if (rootObservation && !isDeepStrictEqual(rootObservation, binding.astObservation)) {
    throw new Error('ROOT_OBSERVATION_PROOF_MISMATCH');
  }
  const astObservation = rootObservation ?? binding.astObservation;

  const definitions = ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1.map(({ feature_id, family, value_kind, description, evidence_requirements, missing_value_policy }) => ({
    feature_id, family, value_kind, description, evidence_requirements, missing_value_policy,
  }));
  const registryRevision = `proposal:sha256:${observationFeatureChecksum(definitions)}`;
  const registry = buildObservationFeatureRegistry({ registryRevision, definitions });
  const row = compileObservationFeatures({
    candidateId: binding.packetKey,
    rowOrdinal: 0,
    sourceRef: binding.sourceRef,
    sourceRevision: binding.sourceRevision,
    workspaceRevision: binding.workspaceRevision,
    rowIdentityChecksum: observationFeatureChecksum({
      packetKey: binding.packetKey,
      symbolVersionId: binding.symbolVersionId,
      sourceRef: binding.sourceRef,
      sourceRevision: binding.sourceRevision,
      workspaceRevision: binding.workspaceRevision,
    }),
    registry,
    astObservations: [astObservation],
  });

  return {
    schema: 'atlas.orf-live-ast-proposal-compile-proof.v1',
    status: 'PROPOSAL_COMPILE_PROVEN',
    inputProofChecksum: checksum,
    packetKey: binding.packetKey,
    symbolVersionId: binding.symbolVersionId,
    sourceRef: binding.sourceRef,
    sourceRevision: binding.sourceRevision,
    workspaceRevision: binding.workspaceRevision,
    observationId: binding.astObservation.observation_id,
    rootObservationChecksum: rootObservation ? sha256Json(rootObservation) : null,
    featureRegistryRevision: registry.registry_revision,
    featureRegistryChecksum: registry.registry_checksum,
    featureIds: row.ast_features.map((feature) => feature.feature_id),
    featureOrdinals: row.ast_features.map((feature) => feature.feature_ordinal),
    observationRefs: row.observation_refs,
    compiledFeatureRowProposal: row,
    compiledFeatureRowChecksum: observationFeatureChecksum(row),
    featureRowStatus: 'PROPOSAL_ONLY',
    rowOrdinalScope: 'SINGLE_PROOF_LOCAL_ONLY',
    registryApproval: 'REQUIRED_NOT_PRESENT',
    runtimeEligible: false,
    canonicalAuthority: false,
    persistentStoreWritesPerformed: false,
  };
}
