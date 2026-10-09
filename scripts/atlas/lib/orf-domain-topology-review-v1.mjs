import crypto from 'node:crypto';
import {
  ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1,
  buildOrfAstFeatureRegistryProposalEnvelopeV1,
} from './orf-ast-feature-definition-proposal-v1.mjs';
import {
  ORF_AST_PREFILL_NODE_KIND_TO_SYMBOL_KIND_V1,
  ORF_AST_PREFILL_UNMAPPED_NODE_KINDS_V1,
  mapAstGrepDeclarationToOrfKindV1,
} from './orf-ast-kind-crosswalk-v1.mjs';

/**
 * Domain-to-Ontology mapping table.
 * Explicitly bridges classifier label names to formal ontology IDs.
 * Unresolved or ambiguous terms must map to null (abstention).
 */
export const DOMAIN_CLASSIFIER_TO_ONTOLOGY_MAPPING_V1 = Object.freeze({
  auth: 'ontology:domain:auth',
  ui: 'ontology:domain:ui',
  retrieval: 'ontology:domain:retrieval',
  network: 'ontology:domain:network',
  database: 'ontology:domain:database',
  cache: 'ontology:domain:cache',
  agent: 'ontology:domain:agent',
  graph: 'ontology:domain:graph',
  ml: 'ontology:domain:ml',
});

/**
 * Maps a domain classifier label to its formal ontology ID, with explicit abstention.
 * @param {string} label
 * @returns {string|null}
 */
export function mapClassifierDomainToOntologyV1(label) {
  if (typeof label !== 'string') return null;
  const normalized = label.trim().toLowerCase();
  return DOMAIN_CLASSIFIER_TO_ONTOLOGY_MAPPING_V1[normalized] ?? null;
}

/**
 * Reviews ORF feature definitions, AST mappings, domain taxonomy mappings, and 4D topology invariants.
 *
 * @param {object} input
 * @param {object} [input.topologyCandidate]
 * @returns {object}
 */
export function reviewOrfDomainTopologyAlignmentV1(input = {}) {
  // 1. ORF Registry proposals & checksums
  const registryMock = input.registry ?? {
    registry_revision: 'proposal:fixture',
    registry_checksum: crypto.createHash('sha256').update(JSON.stringify(ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1)).digest('hex'),
    definitions: ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1,
  };
  const orfEnvelope = buildOrfAstFeatureRegistryProposalEnvelopeV1(registryMock, input.definitions ?? ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1);
  const featureCount = orfEnvelope.ast_grep_mappings.length;

  // 2. Check AST producer mappings and missing/unmapped node kinds
  const unmappedAstKinds = [...ORF_AST_PREFILL_UNMAPPED_NODE_KINDS_V1];
  const allEmittedNodeKinds = Object.keys(ORF_AST_PREFILL_NODE_KIND_TO_SYMBOL_KIND_V1);
  const producerMappingsCoverage = allEmittedNodeKinds.map((nodeKind) => {
    const orfKind = mapAstGrepDeclarationToOrfKindV1(nodeKind);
    return {
      nodeKind,
      mappedOrfKind: orfKind,
      isExplicitlyUnmapped: unmappedAstKinds.includes(nodeKind),
    };
  });

  // 3. Domain alias resolution and abstention check
  const domainChecks = [
    { label: 'retrieval', expected: 'ontology:domain:retrieval' },
    { label: 'cache', expected: 'ontology:domain:cache' },
    { label: 'unknown_service', expected: null },
    { label: 'unresolved_legacy_alias', expected: null },
  ].map((item) => ({
    label: item.label,
    resolvedOntologyId: mapClassifierDomainToOntologyV1(item.label),
    matchesExpected: mapClassifierDomainToOntologyV1(item.label) === item.expected,
  }));

  // 4. Verify 4D topology non-authoritative boundary
  const topologyCandidate = input.topologyCandidate ?? null;
  const topologyIsNonAuthoritative =
    topologyCandidate === null ||
    (topologyCandidate.canonicalAuthority === false &&
      (topologyCandidate.projectionState === 'CHALLENGER_ONLY' ||
        topologyCandidate.projectionState === 'PROJECTION_ONLY'));

  const status =
    featureCount === 5 &&
    topologyIsNonAuthoritative &&
    domainChecks.every((c) => c.matchesExpected)
      ? 'REVIEW_ALIGNED'
      : 'REVIEW_MISALIGNED';

  const digest = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        status,
        orfRegistryChecksum: orfEnvelope.registryChecksum,
        unmappedAstKinds,
        topologyIsNonAuthoritative,
      })
    )
    .digest('hex');

  return {
    status,
    digest,
    orfEnvelope,
    producerMappingsCoverage,
    unmappedAstKinds,
    domainChecks,
    topologyIsNonAuthoritative,
  };
}
