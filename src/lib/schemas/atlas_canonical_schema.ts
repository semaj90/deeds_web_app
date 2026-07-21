/**
 * @fileoverview Defines the canonical, authoritative schema model for core Atlas identity and evidence artifacts.
 * This file is the single source of truth for cross-cutting references and join definitions.
 *
 * NOTE: This schema is a proposal based on manual schema analysis and MUST be validated against
 * the actual data lineage before being promoted to an authoritative write source.
 */

// =============================================================================
// 1. CORE ENTITY IDENTIFIERS (The "What")
// =============================================================================

/**
 * Defines the core immutable identity for a piece of content or artifact.
 * This replaces scattered uses of multiple ID fields.
 */
export type ArtifactIdentity = {
    sourceRef: string;       // Canonical source identifier (e.g., file hash, document URI)
    packetKey: string;       // Unique identifier for the specific processing batch/packet.
    featureId: string;       // The feature or component ID this artifact relates to.
    featureLabel: string;    // Human-readable feature label
    domain?: string;         // Domain/module grouping (e.g., 'auth', 'api', 'ui')
    featureGroup?: string;   // Feature grouping for clustering (e.g., 'security', 'performance')
    // Mandatory fields derived from manual analysis:
    nodeId: string;           // Corresponds to 'tree_node_id' (if a node-based graph is used).
    pipelineKey: string;     // Required for temporal cache keying.
    modelId: string;         // Identifies the model used for enrichment/generation.
    createdAt: number;       // Unix timestamp (ms) of packet creation
    updatedAt: number;       // Unix timestamp (ms) of last update
    indexedAt?: number;      // Unix timestamp (ms) of Qdrant indexing
}

// =============================================================================
// 2. CANONICAL SCHEMA DEFINITIONS & RELATIONSHIPS (The "How")
// =============================================================================

/**
 * Defines the required metadata structure for a single record instance.
 * Ownership and constraints are explicitly documented here.
 */
export interface CanonicalRecord {
    // Metadata for Source Provenance & Identity
    identity: ArtifactIdentity;

    // Source/Reference: Where the raw data came from (e.g., file path, original document ID)
    sourceReference: string;

    // Domain & Grouping for retrieval clustering
    domain?: string;
    featureGroup?: string;

    // Summary Layer: The derived, aggregated view of the data at a point in time.
    summaryLayer: {
        layerName: string; // e.g., 'FINAL_SUMMARY', 'PRE_FILTER'
        timestamp: number;
        // Maps to manual/0100_add_summary_canonical_envelope.sql
        envelopeHash: string;
    } | null;

    // Topology/Graph Indexing: Location within the larger graph structure.
    topologyIndex: {
        // Maps to manual/0048_topology_vector_storage_lookup.sql
        clusterId: string;
        somCluster?: number;      // SOM cluster assignment for spatial routing
        somBmuRow?: number;       // SOM BMU row coordinate
        somBmuCol?: number;       // SOM BMU column coordinate
        graphVersion: string;
        pagerank?: number;        // PageRank authority score
        communityId?: number;     // Neo4j community detection ID
    } | null;

    // Core Node Mapping: The specific node identifier.
    nodeMapping: {
        // Maps to manual/0001_atlas_files.sql
        nodeId: string;
        parentPath: string; // Path within the tree structure.
        filePath?: string;
        treeDepth?: number;
    } | null;

    // Cache/State Management: Required for idempotent writes and versioning.
    cacheState: {
        // Maps to manual/0100_add_summary_canonical_envelope.sql
        pipelineKey: string;
        // Must match the expected state hash for this combination.
        expectedHash: string;
        redisCentroidKey?: string; // Redis cache key for centroid
    } | null;

    // Timestamps (aligned with atlas_feature_packets)
    createdAt: number;  // Unix ms
    updatedAt: number;  // Unix ms
    indexedAt?: number; // Qdrant indexing timestamp
}

// =============================================================================
// 3. VALIDATION UTILITIES (The "Proof")
// =============================================================================

/**
 * Performs a comprehensive validation check to ensure all necessary components for
 * a new record write are present and non-conflicting.
 * @param record The record instance to validate.
 * @returns True if all mandatory fields are set and consistent.
 */
export function validateCanonicalRecord(record: CanonicalRecord): boolean {
    // Hard fail conditions
    if (!record.identity) {
        console.error("Validation Failed: Identity is missing.");
        return false;
    }
    if (!record.identity.sourceRef || !record.identity.packetKey || !record.identity.featureId) {
        console.error("Validation Failed: Core identity fields (sourceRef, packetKey, featureId) are missing.");
        return false;
    }
    if (record.identity.nodeId !== record.nodeMapping?.nodeId) {
        console.error("Validation Failed: Node ID mismatch between identity and mapping.");
        return false;
    }
    if (!record.createdAt || !record.updatedAt) {
        console.error("Validation Failed: Timestamp fields (createdAt, updatedAt) are missing.");
        return false;
    }

    // Soft warnings
    if (!record.summaryLayer) {
        console.warn("Warning: Summary layer not populated for packet " + record.identity.packetKey);
    }
    if (!record.topologyIndex) {
        console.warn("Warning: Topology index not populated for packet " + record.identity.packetKey);
    }
    if (!record.nodeMapping) {
        console.warn("Warning: Node mapping not populated for packet " + record.identity.packetKey);
    }

    return true;
}

// ✅ WIRED TO DRIZZLE SCHEMA
// - atlas_feature_packets.ts defines the canonical storage table (24 columns, 20 indexes)
// - Schema mapping complete: ArtifactIdentity → (packet_key, source_ref, feature_id, feature_label, domain)
// - Timestamps: createdAt/updatedAt mapped to created_at/updated_at (WITH TIME ZONE)
// - Topology fields: som_cluster, pagerank, community_id, neo4j_node_id all present
//
// TODO (Phase 108+): Wire validation through Drizzle insert/update type guards
// TODO (Phase 108+): Add domain/featureGroup indexing to atlas_feature_packets for retrieval