/**
 * Current packet qualification is an exact source-revision/workspace binding,
 * not equality between atlas_packets.content_hash and the source-byte digest.
 * The SQL census additionally requires one packet key and non-empty binding
 * provenance before it supplies this count.
 */
export function currentRevisionQualifiedPacketCountV1(joinCounts) {
	const count = joinCounts?.packet_full_canonical_identity_matches ?? joinCounts?.packet_revision_workspace_binding_matches;
	return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}
