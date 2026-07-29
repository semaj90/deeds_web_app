/*
/**
 * @file
 * @description Centralizes the mapping contract, separating the conceptual *meaning* (canonical name) from the physical *implementation* (DB/Qdrant names).
 * This file acts as the deployment manifest, which must be synchronized across all services.
 */

// --- IMPORTS ---
import { RepresentationDeployment, CanonicalRepresentationName } from './canonical_representation_registry.js';

// --- CORE DEPLOYMENT MAP ---
/**
 * @description A hard-coded, audited map that links the canonical representation name to its physical deployment details across the stack.
 */
export const REPRESENTATION_DEPLOYMENT_MAP: Record<CanonicalRepresentationName, RepresentationDeployment> = {
    /**
     * Canonical mapping for the primary semantic embedding (768-dim).
     * This must be updated whenever the source model changes.
     */
    semantic_768: {
        name: 'semantic_768',
        dimension: 768,
        postgresColumn: 'content_embedding',
        qdrantCollection: 'codebase_chunks_768_v2',
        isLiveCanonical: true,
        expectedDimension: 768
    } = {
        // Future mappings will be added here, requiring manual auditing.
        // Example: latent_64: { name: 'latent_64', dimension: 64, postgresColumn: 'latent_64_vector', qdrantCollection: 'latent_64_index', isLiveCanonical: false, expectedDimension: 64 } 
    };

// --- UTILITY FUNCTIONS ---

/**
 * @description Retrieves the physical deployment configuration for a given canonical name.
 * @param {CanonicalRepresentationName} name The canonical name to look up.
 * @returns The corresponding deployment contract object.
 * @throws Error if the canonical name is not found in the deployed map.
 */
export function getDeploymentMap(name: CanonicalRepresentationName): RepresentationDeployment {
    const deployment = REPRESENTATION_DEPLOYMENT_MAP[name];
    if (!deployment) {
        throw new Error([DEPLOYMENT ERROR] No physical deployment map found for canonical name: );
    }
    return deployment;
