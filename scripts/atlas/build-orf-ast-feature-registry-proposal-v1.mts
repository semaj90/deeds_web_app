import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildObservationFeatureRegistry,
  observationFeatureChecksum,
} from '../../packages/parent-atlas/src/core/observation-feature-compiler.ts';
import {
  ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1,
  buildOrfAstFeatureRegistryProposalEnvelopeV1,
} from './lib/orf-ast-feature-definition-proposal-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requestedOutput = process.argv[2] ?? '.tmp/atlas/orf-ast-feature-registry-proposal-v1.json';
const outputPath = path.resolve(repoRoot, requestedOutput);
const scratchRoot = path.join(repoRoot, '.tmp', 'atlas') + path.sep;
if (!outputPath.startsWith(scratchRoot)) throw new Error('OUTPUT_MUST_BE_UNDER_TMP_ATLAS');

const definitions = ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1.map(({ feature_id, family, value_kind, description, evidence_requirements, missing_value_policy }) => ({
  feature_id,
  family,
  value_kind,
  description,
  evidence_requirements,
  missing_value_policy,
}));
const registryRevision = `proposal:sha256:${observationFeatureChecksum(definitions)}`;
const registry = buildObservationFeatureRegistry({ registryRevision, definitions });
const envelope = buildOrfAstFeatureRegistryProposalEnvelopeV1(registry);
const serialized = `${JSON.stringify(envelope, null, 2)}\n`;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, serialized, { encoding: 'utf8', flag: 'wx' });

const readback = fs.readFileSync(outputPath, 'utf8');
const parsed = JSON.parse(readback);
if (observationFeatureChecksum(parsed.registry) !== observationFeatureChecksum(registry)) {
  throw new Error('REGISTRY_READBACK_CHECKSUM_MISMATCH');
}
const readbackEnvelope = buildOrfAstFeatureRegistryProposalEnvelopeV1(parsed.registry);
if (readbackEnvelope.proposal_checksum !== parsed.proposal_checksum) {
  throw new Error('PROPOSAL_READBACK_CHECKSUM_MISMATCH');
}
console.log(JSON.stringify({
  status: envelope.status,
  runtimeEligible: envelope.runtime_eligible,
  registryRevision,
  registryChecksum: registry.registry_checksum,
  proposalRevision: envelope.proposal_revision,
  proposalChecksum: envelope.proposal_checksum,
  definitionCount: registry.definitions.length,
  denseOrdinals: registry.definitions.every((definition, index) => definition.ordinal === index),
  independentReadback: 'MATCH',
  outputPath: path.relative(repoRoot, outputPath),
  canonicalAuthority: false,
  persistentStoreWritesPerformed: false,
}, null, 2));
