export function buildOkfGroundedNlpAlignmentV1({ okfSchema, okfIndex, pydanticSchema }) {
  const contract = okfSchema?.capability_card_contract;
  const envelope = contract?.envelope;
  const cardProperties = envelope?.properties;
  const factProperties = pydanticSchema?.properties;
  const cardRequired = new Set(envelope?.required ?? []);
  const factRequired = new Set(pydanticSchema?.required ?? []);
  const sharedBindings = [
    ['source_ref', 'sourceRef'],
    ['source_revision', 'sourceRevision'],
    ['workspace_revision', 'workspaceRevision'],
  ].map(([cardField, factField]) => ({
    cardField,
    factField,
    cardRequired: cardRequired.has(cardField),
    factRequired: factRequired.has(factField),
    bothRequired: cardRequired.has(cardField) && factRequired.has(factField),
    cardType: cardProperties?.[cardField]?.type ?? null,
    factType: factProperties?.[factField]?.type ?? null,
  }));

  const cardAuthority = cardProperties?.authority?.properties?.canonical_authority;
  const factAuthority = factProperties?.canonicalAuthority;
  const authorityAligned = contract?.canonical_authority === false
    && okfIndex?.canonical_authority === false
    && cardAuthority?.const === false
    && factAuthority?.const === false;
  const sourceBindingsAligned = sharedBindings.every((binding) => binding.bothRequired
    && binding.cardType === 'string' && binding.factType === 'string');
  const evidenceShape = {
    cardEvidenceRefsRequired: cardRequired.has('evidence_refs'),
    factEvidenceKeyRequired: factRequired.has('evidenceKey'),
    factEvidenceSpanRequired: factRequired.has('evidenceSpan'),
    cardChecksumRequired: cardRequired.has('checksum'),
    factChecksumFieldPresent: Object.hasOwn(factProperties ?? {}, 'checksum'),
    equivalenceClaimed: false,
  };

  const mismatches = [];
  if (!contract || contract.design_only !== true || contract.runtime_enforced !== false) mismatches.push('OKF_CARD_NOT_DECLARED_DOCUMENTATION_ONLY');
  if (!sourceBindingsAligned) mismatches.push('SHARED_SOURCE_REVISION_FIELDS_NOT_REQUIRED_ON_BOTH');
  if (!authorityAligned) mismatches.push('NON_AUTHORITY_CONSTRAINT_NOT_SHARED');

  return {
    schema: 'atlas.okf-grounded-nlp-alignment.v1',
    status: mismatches.length ? 'REJECTED' : 'SHARED_GUARDS_ALIGNED_SHAPE_REVIEW_REQUIRED',
    okfRole: 'DOCUMENTATION_CARD_PROJECTION',
    pydanticRole: 'STRICT_GROUNDED_FACT_TRANSPORT',
    sharedBindings,
    authorityAligned,
    evidenceShape,
    semanticCrosswalks: {
      cardProducerRevisionToFactExtractorRevision: 'REVIEW_REQUIRED_NOT_ASSUMED_EQUIVALENT',
      cardEvidenceRefsToFactEvidenceKeyAndSpan: 'DIFFERENT_SHAPES_NOT_EQUIVALENT',
      cardChecksumToFactChecksum: 'NO_FACT_LEVEL_CHECKSUM_FIELD',
      cardCanonicalIdAndPacketKeyToFactIdentity: 'FACT_DOES_NOT_MINT_CARD_OR_PACKET_IDENTITY',
    },
    mismatches,
    canonicalAuthority: false,
    runtimeAdmission: false,
    persistentStoreWritesPerformed: false,
  };
}
