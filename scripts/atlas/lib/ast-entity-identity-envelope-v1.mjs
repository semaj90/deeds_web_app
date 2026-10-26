export function buildAstEntityPrefillIdentityFieldsV1({ packetTreeNodeId, occurrenceId }) {
  if (typeof occurrenceId !== 'string' || occurrenceId.length === 0) {
    throw new Error('TREE_NODE_OCCURRENCE_ID_REQUIRED');
  }
  return {
    tree_node_occurrence_id: occurrenceId,
    packet_tree_node_id: packetTreeNodeId ?? null,
  };
}

export function buildAstEntityPrefillIdentityEnvelopeV1(packet, occurrenceId) {
  const { tree_node_id: packetTreeNodeId, ...packetFields } = packet;
  return {
    ...packetFields,
    ...buildAstEntityPrefillIdentityFieldsV1({ packetTreeNodeId, occurrenceId }),
  };
}

export function buildAstEntityIdentityRowV1(candidate, packetIdentity) {
  const candidateWithoutAmbiguousTreeNodeId = Object.fromEntries(
    Object.entries(candidate).filter(([key]) => key !== 'tree_node_id'),
  );
  return {
    ...candidateWithoutAmbiguousTreeNodeId,
    packet_key: packetIdentity?.packet_key ?? null,
    feature_id: packetIdentity?.feature_id ?? null,
    title_id: packetIdentity?.title_id ?? null,
    packet_tree_node_id: packetIdentity?.tree_node_id ?? candidate.packet_tree_node_id ?? null,
    tree_node_occurrence_id: candidate.tree_node_occurrence_id ?? null,
    identity_status: packetIdentity?.packet_key ? 'RESOLVED_CANDIDATE' : 'UNRESOLVED_CANDIDATE',
    source_revision: candidate.source_revision ?? null,
  };
}
