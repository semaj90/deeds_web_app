import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reviewOrfDomainTopologyAlignmentV1,
  mapClassifierDomainToOntologyV1,
  DOMAIN_CLASSIFIER_TO_ONTOLOGY_MAPPING_V1,
} from './orf-domain-topology-review-v1.mjs';
import { ORF_AST_PREFILL_UNMAPPED_NODE_KINDS_V1 } from './orf-ast-kind-crosswalk-v1.mjs';

test('reviewOrfDomainTopologyAlignmentV1 returns deterministic aligned review', () => {
  const res1 = reviewOrfDomainTopologyAlignmentV1();
  const res2 = reviewOrfDomainTopologyAlignmentV1();

  assert.equal(res1.status, 'REVIEW_ALIGNED');
  assert.equal(res1.digest, res2.digest);
  assert.equal(res1.orfEnvelope.ast_grep_mappings.length, 5);
  assert.equal(res1.topologyIsNonAuthoritative, true);
});

test('ORF AST producer mappings explicitly isolate unmapped kinds (enum_declaration)', () => {
  const res = reviewOrfDomainTopologyAlignmentV1();
  assert.deepEqual(res.unmappedAstKinds, ['enum_declaration']);

  const enumMapping = res.producerMappingsCoverage.find((m) => m.nodeKind === 'enum_declaration');
  assert.ok(enumMapping);
  assert.equal(enumMapping.mappedOrfKind, null);
  assert.equal(enumMapping.isExplicitlyUnmapped, true);

  const fnMapping = res.producerMappingsCoverage.find((m) => m.nodeKind === 'function_declaration');
  assert.ok(fnMapping);
  assert.equal(fnMapping.mappedOrfKind, 'FUNCTION_DECL');
  assert.equal(fnMapping.isExplicitlyUnmapped, false);
});

test('Domain taxonomy mapping enforces explicit ontology IDs and abstains on unmapped/legacy aliases', () => {
  assert.equal(mapClassifierDomainToOntologyV1('retrieval'), 'ontology:domain:retrieval');
  assert.equal(mapClassifierDomainToOntologyV1('cache'), 'ontology:domain:cache');
  assert.equal(mapClassifierDomainToOntologyV1('AUTH'), 'ontology:domain:auth');
  assert.equal(mapClassifierDomainToOntologyV1('unknown_domain'), null);
  assert.equal(mapClassifierDomainToOntologyV1('legacy_alias_not_promoted'), null);
  assert.equal(mapClassifierDomainToOntologyV1(''), null);
  assert.equal(mapClassifierDomainToOntologyV1(null), null);
});

test('Topology candidates with canonicalAuthority: true are rejected as authoritative', () => {
  const invalidTopologyCandidate = {
    canonicalAuthority: true,
    projectionState: 'AUTHORITATIVE',
  };

  const res = reviewOrfDomainTopologyAlignmentV1({
    topologyCandidate: invalidTopologyCandidate,
  });

  assert.equal(res.topologyIsNonAuthoritative, false);
  assert.equal(res.status, 'REVIEW_MISALIGNED');
});

test('Topology candidates with canonicalAuthority: false and CHALLENGER_ONLY pass review', () => {
  const validTopologyCandidate = {
    canonicalAuthority: false,
    projectionState: 'CHALLENGER_ONLY',
  };

  const res = reviewOrfDomainTopologyAlignmentV1({
    topologyCandidate: validTopologyCandidate,
  });

  assert.equal(res.topologyIsNonAuthoritative, true);
  assert.equal(res.status, 'REVIEW_ALIGNED');
});
