import crypto from 'node:crypto';

export const ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1 = Object.freeze([
  {
    feature_id: 'ast.class_decl',
    family: 'AST_BINARY',
    value_kind: 'BINARY',
    description: 'An AST-grep observation classified as a class declaration.',
    producer_mapping: ['class_declaration'],
    symbol_kind_hints: ['class'],
    evidence_requirements: ['OBSERVATION_ID', 'SOURCE_REF', 'SOURCE_REVISION', 'BYTE_SPAN', 'PRODUCER_REVISION', 'EVIDENCE_CHECKSUM'],
    missing_value_policy: 'UNAVAILABLE_NOT_ZERO',
    review_state: 'REVIEW_REQUIRED',
  },
  {
    feature_id: 'ast.function_decl',
    family: 'AST_BINARY',
    value_kind: 'BINARY',
    description: 'An AST-grep observation classified as a function or method declaration.',
    producer_mapping: ['function_declaration', 'method_definition'],
    symbol_kind_hints: ['function', 'method'],
    evidence_requirements: ['OBSERVATION_ID', 'SOURCE_REF', 'SOURCE_REVISION', 'BYTE_SPAN', 'PRODUCER_REVISION', 'EVIDENCE_CHECKSUM'],
    missing_value_policy: 'UNAVAILABLE_NOT_ZERO',
    review_state: 'REVIEW_REQUIRED',
  },
  {
    feature_id: 'ast.interface_decl',
    family: 'AST_BINARY',
    value_kind: 'BINARY',
    description: 'An AST-grep observation classified as an interface declaration.',
    producer_mapping: ['interface_declaration'],
    symbol_kind_hints: ['interface'],
    evidence_requirements: ['OBSERVATION_ID', 'SOURCE_REF', 'SOURCE_REVISION', 'BYTE_SPAN', 'PRODUCER_REVISION', 'EVIDENCE_CHECKSUM'],
    missing_value_policy: 'UNAVAILABLE_NOT_ZERO',
    review_state: 'REVIEW_REQUIRED',
  },
  {
    feature_id: 'ast.type_alias',
    family: 'AST_BINARY',
    value_kind: 'BINARY',
    description: 'An AST-grep observation classified as a type alias declaration.',
    producer_mapping: ['type_alias_declaration'],
    symbol_kind_hints: ['type'],
    evidence_requirements: ['OBSERVATION_ID', 'SOURCE_REF', 'SOURCE_REVISION', 'BYTE_SPAN', 'PRODUCER_REVISION', 'EVIDENCE_CHECKSUM'],
    missing_value_policy: 'UNAVAILABLE_NOT_ZERO',
    review_state: 'REVIEW_REQUIRED',
  },
  {
    feature_id: 'ast.variable_decl',
    family: 'AST_BINARY',
    value_kind: 'BINARY',
    description: 'An AST-grep observation classified as a variable binding declaration.',
    producer_mapping: ['variable_declarator'],
    symbol_kind_hints: ['variable'],
    evidence_requirements: ['OBSERVATION_ID', 'SOURCE_REF', 'SOURCE_REVISION', 'BYTE_SPAN', 'PRODUCER_REVISION', 'EVIDENCE_CHECKSUM'],
    missing_value_policy: 'UNAVAILABLE_NOT_ZERO',
    review_state: 'REVIEW_REQUIRED',
  },
]);

export function buildOrfAstFeatureRegistryProposalEnvelopeV1(registry, definitions = ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1) {
  const astGrepMappings = definitions.map(({ feature_id, producer_mapping, review_state }) => ({
    feature_id,
    ast_kinds: producer_mapping,
    review_state,
  }));
  const symbolKindHints = definitions.map(({ feature_id, symbol_kind_hints, review_state }) => ({
    feature_id,
    symbol_kinds: symbol_kind_hints,
    review_state,
  }));
  const proposalInput = {
    schema: 'atlas.orf-ast-feature-registry-proposal.v1',
    registry,
    ast_grep_mappings: astGrepMappings,
    symbol_kind_hints: symbolKindHints,
  };
  const proposalChecksum = crypto.createHash('sha256').update(JSON.stringify(proposalInput), 'utf8').digest('hex');
  return {
    ...proposalInput,
    status: 'PROPOSAL_ONLY_REQUIRES_REVIEW',
    proposal_revision: `proposal:sha256:${proposalChecksum}`,
    proposal_checksum: proposalChecksum,
    reviewer_id: null,
    review_receipt: null,
    runtime_eligible: false,
    canonical_authority: false,
    persistent_store_writes_performed: false,
  };
}
