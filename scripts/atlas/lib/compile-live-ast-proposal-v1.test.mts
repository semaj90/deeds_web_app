import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { observationFeatureChecksum } from '../../../packages/parent-atlas/src/core/observation-feature-compiler.ts';
import { compileLiveAstObservationProposalV1 } from './compile-live-ast-proposal-v1.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const registryProposal = JSON.parse(readFileSync(path.join(ROOT, 'docs/.okf/registries/orf-ast-feature-registry-proposal-v1.json'), 'utf8'));

function fixture() {
  const payload = {
    schema: 'atlas.live-packet-symbol-ast-observation-proof.v1',
    status: 'READ_ONLY_SOURCE_AND_AST_OBSERVATION_MATCH',
    spanMismatchCount: 0,
    canonicalAuthority: false,
    persistentStoreWritesPerformed: false,
    exactBinding: {
      packetKey: 'packet:live-fixture',
      symbolVersionId: 'symbol-version:fixture-r1',
      sourceRef: 'src/example.ts',
      sourceRevision: `sha256:${'a'.repeat(64)}`,
      workspaceRevision: `sha256:${'b'.repeat(64)}`,
      byteStart: 0,
      byteEnd: 12,
      sourceBytesChecksum: `sha256:${'a'.repeat(64)}`,
      spanChecksum: 'c'.repeat(64),
      admissionStatus: 'PROPOSAL_ONLY',
      canonicalAuthority: false,
      astObservation: {
        schema: 'atlas.ast-grep-observation.v1',
        observation_id: 'ast-grep:fixture',
        rule_id: 'fixture:function',
        source_ref: 'src/example.ts',
        source_revision: `sha256:${'a'.repeat(64)}`,
        byte_start: 0,
        byte_end: 12,
        matched_text_hash: 'c'.repeat(64),
        captures: { name: 'example' },
        observation_kind: 'FUNCTION_DECL',
        confidence: 1,
        extractor_revision: 'fixture:extractor-v1',
        canonical_authority: false,
      },
    },
  };
  return { ...payload, checksum: createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex') };
}

test('compiles a receipt-shaped AST observation without granting runtime eligibility', () => {
  const result = compileLiveAstObservationProposalV1(fixture(), undefined, registryProposal);
  assert.deepEqual(result.featureIds, ['ast.function_decl']);
  assert.deepEqual(result.featureOrdinals, [1]);
  assert.deepEqual(result.observationRefs, ['ast-grep:fixture']);
  assert.equal(result.featureRowStatus, 'PROPOSAL_ONLY');
  assert.equal(result.compiledFeatureRowProposal.canonical_authority, false);
  assert.equal(result.compiledFeatureRowProposal.ast_features[0].feature_id, 'ast.function_decl');
  assert.equal(result.compiledFeatureRowChecksum, observationFeatureChecksum(result.compiledFeatureRowProposal));
  assert.equal(result.registryApproval, 'REQUIRED_NOT_PRESENT');
  assert.equal(result.featureRegistryProposalRevision, registryProposal.proposal_revision);
  assert.equal(result.featureRegistryProposalChecksum, registryProposal.proposal_checksum);
  assert.equal(result.runtimeEligible, false);
  assert.equal(result.canonicalAuthority, false);
});

test('compiles the exact root observation and binds its checksum', () => {
  const proof = fixture();
  const result = compileLiveAstObservationProposalV1(proof, structuredClone(proof.exactBinding.astObservation), registryProposal);
  assert.equal(result.rootObservationChecksum, createHash('sha256')
    .update(JSON.stringify(proof.exactBinding.astObservation), 'utf8').digest('hex'));
  assert.equal(result.featureRowStatus, 'PROPOSAL_ONLY');
});

test('rejects a root observation that differs from the verified symbol proof', () => {
  const proof = fixture();
  const rootObservation = structuredClone(proof.exactBinding.astObservation);
  rootObservation.extractor_revision = 'different:revision';
  assert.throws(() => compileLiveAstObservationProposalV1(proof, rootObservation, registryProposal), /ROOT_OBSERVATION_PROOF_MISMATCH/);
});

test('allows unrelated cohort mismatches when the selected binding remains exact', () => {
  const proof = fixture();
  const { checksum: _checksum, ...payload } = proof;
  payload.spanMismatchCount = 4;
  const resealed = { ...payload, checksum: createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex') };
  const result = compileLiveAstObservationProposalV1(resealed, undefined, registryProposal);
  assert.deepEqual(result.featureIds, ['ast.function_decl']);
});

test('rejects a selected observation whose byte span differs from its binding', () => {
  const proof = fixture();
  proof.exactBinding.astObservation.byte_end = 11;
  const { checksum: _checksum, ...payload } = proof;
  proof.checksum = createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
  assert.throws(() => compileLiveAstObservationProposalV1(proof, undefined, registryProposal), /LIVE_AST_BINDING_NOT_QUALIFIED/);
});

test('rejects AST evidence whose source revision differs from the live binding', () => {
  const proof = fixture();
  proof.exactBinding.astObservation.source_revision = `sha256:${'d'.repeat(64)}`;
  const { checksum: _checksum, ...payload } = proof;
  proof.checksum = createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
  assert.throws(() => compileLiveAstObservationProposalV1(proof, undefined, registryProposal), /LIVE_AST_BINDING_NOT_QUALIFIED/);
});

test('rejects a registry artifact that differs from the checked-in proposal', () => {
  const altered = structuredClone(registryProposal);
  altered.registry.registry_checksum = 'f'.repeat(64);
  assert.throws(() => compileLiveAstObservationProposalV1(fixture(), undefined, altered), /ORF_REGISTRY_PROPOSAL_ARTIFACT_MISMATCH/);
});

test('requires the frozen registry artifact instead of silently rebuilding an unbound registry', () => {
  assert.throws(() => compileLiveAstObservationProposalV1(fixture()), /ORF_REGISTRY_PROPOSAL_ARTIFACT_MISMATCH/);
});
