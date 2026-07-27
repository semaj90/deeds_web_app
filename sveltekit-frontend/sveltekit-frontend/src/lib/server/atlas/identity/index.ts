/**
 * Atlas Identity Builders — Canonical Packet Identity Construction (CORRECTED)
 *
 * IDENTITY POLICY:
 * - packet_key (STABLE LOGICAL): hash(workspace_id + normalized_source_ref + semantic_anchor)
 *   - Immutable after creation
 *   - Same packet_key survives structural refactoring, moves, renames
 *
 * - tree_node_id (MUTABLE LINEAGE): hash(sourceRef + language + nodeKind + qualifiedName + signatureHash)
 *   - Changes when code structure changes
 *   - Does NOT affect packet_key
 *   - Used for audit trail and structural change detection
 *
 * - content_hash: hash(current content)
 *   - Tracks version of actual packet content
 *   - Separate from identity; used for caching/freshness
 *
 * Exports all utilities for deterministic identity derivation and immutability verification.
 * **All packet operations route through these builders.**
 */

export * from './packet-key-builder.js';
