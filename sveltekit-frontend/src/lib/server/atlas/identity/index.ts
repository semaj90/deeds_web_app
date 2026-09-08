/**
 * Atlas Identity Builders — Canonical Packet Identity Construction
 *
 * Exports all utilities for deterministic identity derivation and immutability verification.
 * **All packet operations route through these builders.**
 *
 * Canonical Lineage:
 *   source_ref + tree_node_id + title_id → packet_key (immutable)
 *
 * NOTE (2026-09-07): `tree_node_id` above is NOT produced by this module — the live authority
 * is `TreeNodeIdentityAuthoritySchema` (src/lib/schemas/tree_node_identity_schema.js), consumed
 * via `enriched-tree-node-contract.ts`. A standalone `computeTreeNodeId()` implementation used
 * to be re-exported from here with zero real callers and a different, incompatible derivation
 * (file_path:line:col:node_type, unhashed); it was archived
 * (deeds_labs/archive/2026-09-07/tree-node-id-extractor.ts.dead-orphan.bak) rather than left
 * here implying it was the canonical producer. See
 * openspec/changes/parent-atlas-pass-fabric/tasks.md for the trace.
 */

export * from './packet-key-builder.js';
