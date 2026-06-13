/**
 * @module opencode-retrieval-contract
 * @description Defines the authoritative contract for source reference resolution and placeholder creation policy enforcement within OpenCode.
 */

// --- 1. Core Data Structures (Source Reference Result) ---

/**
 * Represents the result of a single retrieval lane check.
 * @typedef {object} SourceRefResult
 * @property {boolean} found - Whether a relevant source reference was found in this specific lane.
 * @property {string | null} sourceRef - The authoritative, canonical source reference (e.g., "file:path/to/file.ts").
 * @property {string} [laneName] - The name of the retrieval lane that ran (e.g., "atlas_packets", "qdrant").
 * @property {string | null} [evidenceSummary] - A brief summary of why this source was considered relevant.
 */

/**
 * Represents the final decision on whether a placeholder file should be created.
 * @typedef {object} PlaceholderDecision
 * @property {boolean} allow_create - True if no authoritative sources were found, allowing creation.
 * @property {string | null} reason - A detailed explanation for the decision (e.g., "Found multiple conflicting sources" or "No existing source evidence").
 */

// --- 2. Function Signatures ---

/**
 * Checks all canonical retrieval lanes to find an authoritative source reference for a given query.
 * This function must be called before any write operation that assumes the existence of code/data.
 * @param {string} query - The natural language or technical query describing the feature/concept.
 * @returns {Promise<{found: boolean, sourceRef: string | null, evidenceSummary?: string}>} A promise resolving to the authoritative source reference details.
 */
export async function resolveSourceRef(query) {
    // Implementation will sequentially call and aggregate results from all 6 lanes here.
    throw new Error("Not implemented: Must implement sequential checking of all retrieval lanes.");
}

/**
 * Enforces the No Placeholder Policy by calling resolveSourceRef() to determine if creating a placeholder is safe.
 * @param {string} query - The natural language or technical query describing the feature/concept.
 * @returns {Promise<PlaceholderDecision>} A promise resolving to the creation decision object.
 */
export async function enforceNoPlaceholderPolicy(query) {
    // Implementation calls resolveSourceRef() and applies business logic based on results.
    throw new Error("Not implemented: Must implement policy enforcement logic.");
}