// File: src/lib/server/atlas/contracts/validation-result-v1.ts

/**
 * @file ValidationResultV1 (LOCKED)
 * @description Canonical, immutable data contract defining the required output structure
 * for a successful cross-store packet identity proof. This structure is the single source of truth
 * for how an 'atlas' view is represented internally.
 *
 * NOTE: This file MUST only be updated through the established 'opencode' contract update process.
 * Any direct edits risk breaking the core data model.
 */

export type StoreType = 'postgres' | 'qdrant' | 'redis' | 'hyperrag_rpc' | 'ace' | 'neo4j';

/**
 * @typedef {Object} ProjectionSnapshot
 * @description Holds the materialized view/projection for a single source of truth layer.
 * A 'null' or 'undefined' value indicates the data was not present, which must be
 * handled by the calling function (e.g., assuming optionality or non-existence).
 * @property {?string} packetKey - The key extracted from the source (e.g., from the primary source).
 * @property {?string} sourceRef - The file path or source identifier where this data was derived.
 * @property {?string} treeNodeId - The derived or explicitly provided node ID.
 * @property {?string} contentHash - SHA256 hash of the content at the time of projection.
 * @property {?string} workspaceRevision - The specific revision ID used for this data point.
 * @property {?string} ontologyId - Canonical ID used by the graph/ontology layer.
 * @property {?string} ontologyVersion - Version of the ontology used.
 * @property {?string} featureId - The specific feature ID associated with this packet.
 * @property {?string} domainClass - The class or domain categorization.
 * @property {?string[]} featureIds - List of feature IDs associated with this data point.
 * @property {?string[]} evidencePacketKeys - List of related packet keys.
 */
export type ProjectionSnapshot = {
    ?packetKey: string;
    ?sourceRef: string;
    ?treeNodeId: string;
    ?contentHash: string;
    ?workspaceRevision: string;
    ?ontologyId: string;
    ?ontologyVersion: string;
    ?featureId: string;
    ?domainClass: string;
    ?featureIds: string[];
    ?evidencePacketKeys: string[];
};


/**
 * @typedef {Object} ValidationViolation
 * @description Standardized codes for identifying data integrity issues.
 * This object holds the details of why a comparison failed.
 * @property {'BLOCK' | 'WARN' | 'INFO'} severity - The severity of the failure.
 * @property {string} code - The specific failure code (e.g., 'CONTENT_HASH_MISMATCH').
 * @property {string} path - The field or component where the violation was found.
 * @property {string} message - Descriptive error message.
 */
export interface ValidationViolation {
    severity: 'BLOCK' | 'WARN' | 'INFO';
    code: string;
    path: string;
    message: string;
}

/**
 * @enum {string} CORE_ISSUE
 * @description Standardized codes for identifying data integrity issues.
 */
export enum CORE_ISSUE {
    // --- Identity Failures (BLOCKING) ---
    PACKET_KEY_MISSING = 'PACKET_KEY_MISSING', // Primary key missing in source
    SOURCE_REF_MISMATCH = 'SOURCE_REF_MISMATCH', // Expected source ref doesn't match
    FEATURE_ID_MISMATCH = 'FEATURE_ID_MISMATCH', // Feature ID does not align across stores
    // --- Content Integrity Failures (BLOCKING) ---
    CONTENT_HASH_MISMATCH = 'CONTENT_HASH_MISMATCH', // Data content changed without update
    // --- System/Layer Failures (BLOCKING) ---
    PROJECTION_MISSING = 'PROJECTION_MISSING', // An expected layer failed to return a projection
    // --- Soft Warnings (Non-blocking) ---
    CONTENT_HASH_UNAVAILABLE = 'CONTENT_HASH_UNAVAILABLE', // Data available, but no hash was generated/found
}

/**
 * @typedef {Object} ProofInputs
 * @description The mandatory inputs required to run the full proof matrix comparison.
 * This is the structure that the caller must populate from the primary source material.
 * @property {?string} authorityPacketKey - The authoritative key from Postgres (the ultimate source).
 * @property {?string} authoritySourceRef - The authoritative source reference.
 * @property {?string} authorityContentHash - The authoritative hash.
 * @property {?string} authorityFeatureId - The authoritative feature ID.
 * @property {?string} authorityConceptId - The canonical concept ID.
 * @property {?string} authorityWorkspaceRevision - The revision used for the data.
 */
export interface ProofInputs {
    authorityPacketKey?: string;
    authoritySourceRef?: string;
    authorityContentHash?: string;
    authorityFeatureId?: string;
    authorityConceptId?: string;
    authorityWorkspaceRevision?: string;
}

/**
 * @typedef {Object} ValidationResultV1
 * @description The canonical, immutable data contract defining the required output structure
 * for a successful cross-store packet identity proof. This object is the *result* of the
 * proof, synthesizing data from all sources.
 * @property {?ProjectionSnapshot} postgres - The source of truth data (canonical input).
 * @property {?ProjectionSnapshot} qdrant - The Qdrant cache projection.
 * @property {?ProjectionSnapshot} redis - The Redis cache projection.
 * @property {?ProjectionSnapshot} hyperrag_rpc - The result from the HyperRAG retrieval pipeline.
 * @property {?ProjectionSnapshot} ace - The ACE context projection.
 * @property {?ProjectionSnapshot} neo4j - The Neo4j topology projection.
 * @property {?string} canonicalId - A derived, non-source-specific ID used for cross-system referencing.
 * @property {?string} computedContentHash - The final, computed hash used for all comparisons.
 * @property {?boolean} isCrossStoreProven - Flag set only after successful reconciliation across all sources.
 * @property {?ValidationViolation} violations - Aggregated list of all found discrepancies.
 */
export interface ValidationResultV1 {
    postgres?: ProjectionSnapshot;
    qdrant?: ProjectionSnapshot;
    redis?: ProjectionSnapshot;
    hyperrag_rpc?: ProjectionSnapshot;
    ace?: ProjectionSnapshot;
    neo4j?: ProjectionSnapshot;
    canonicalId?: string;
    computedContentHash?: string;
    isCrossStoreProven?: boolean;
    violations?: ValidationViolation;
}

// --- Helper Functions (STUBS) ---

/**
 * @function getCanonicalProofInputs
 * @description Retrieves the authoritative packet details from the primary data source (Postgres).
 * @param {ProofInputs} inputs - The inputs gathered from the primary source.
 * @returns {Promise<ProofInputs>} A promise resolving to the canonical input set.
 */
export async function getCanonicalProofInputs(inputs: ProofInputs): Promise<ProofInputs> {
    // Implementation to query Postgres/Primary Source and populate required fields.
    return inputs;
}

/**
 * @function validateProjection
 * @description Compares the data from a secondary source projection against the canonical
 * input to check for consistency violations.
 * @param {ProofInputs} canonicalInputs - The authoritative set of inputs.
 * @param {StoreType} storeType - The source of the projection (e.g., 'qdrant').
 * @param {ProjectionSnapshot} projection - The snapshot retrieved from the store.
 * @returns {ValidationResultV1} The updated result structure.
 */
export function validateProjection(canonicalInputs: ProofInputs, storeType: StoreType, projection: ProjectionSnapshot): ValidationResultV1 {
    // Logic to compare projection.contentHash against canonicalInputs.authorityContentHash
    // and populate the corresponding field in the result.
    return {};
}