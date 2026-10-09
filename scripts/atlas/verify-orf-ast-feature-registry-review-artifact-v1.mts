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
const artifactPath = path.join(repoRoot, 'docs/.okf/registries/orf-ast-feature-registry-proposal-v1.json');

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

if (!fs.existsSync(artifactPath)) throw new Error('ORF_REGISTRY_REVIEW_ARTIFACT_MISSING');

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
const expected = buildOrfAstFeatureRegistryProposalEnvelopeV1(registry);
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

if (canonicalJson(artifact) !== canonicalJson(expected)) throw new Error('ORF_REGISTRY_REVIEW_ARTIFACT_SOURCE_DRIFT');
if (artifact.status !== 'PROPOSAL_ONLY_REQUIRES_REVIEW'
  || artifact.runtime_eligible !== false
  || artifact.canonical_authority !== false
  || artifact.persistent_store_writes_performed !== false
  || artifact.reviewer_id !== null
  || artifact.review_receipt !== null) {
  throw new Error('ORF_REGISTRY_PROPOSAL_AUTHORITY_BOUNDARY_INVALID');
}

process.stdout.write(`${JSON.stringify({
  status: 'REVIEW_ARTIFACT_MATCH_REQUIRES_TRUSTED_REVIEW',
  artifactPath: path.relative(repoRoot, artifactPath).replaceAll('\\', '/'),
  registryRevision,
  registryChecksum: registry.registry_checksum,
  proposalRevision: expected.proposal_revision,
  proposalChecksum: expected.proposal_checksum,
  definitionCount: registry.definitions.length,
  denseOrdinals: registry.definitions.every((definition, index) => definition.ordinal === index),
  reviewerReceiptPresent: false,
  runtimeEligible: false,
  canonicalAuthority: false,
  writesPerformed: false,
}, null, 2)}\n`);
