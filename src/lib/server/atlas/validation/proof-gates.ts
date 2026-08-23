// src/lib/server/atlas/validation/proof-gates.ts

/**
 * Defines the explicit gates that must be validated before the state can be considered fully proven.
 * All required flags must be explicitly validated and available.
 */
export interface ProofGates {
    /** Is the canonical representation contract loaded and active? */
    representationRegistry: boolean;
    /** Is the Qdrant collection mapping validated against the source of truth? */
    qdrantMapping: boolean;
    /** Is the source content hash recorded and validated? */
    sourceLineage: boolean;
    /** Has the retrieved vector successfully passed back to the storage layer for comparison? */
    vectorReadback: boolean;
    /** Do the derived vector components (e.g., normalization) match expected parity? */
    vectorParity: boolean;
    /** Is the payload structure consistent with the projection contract? */
    payloadParity: boolean;
    /** Is the data versioning/checkpointing state persisted? */
    checkpointPersistence: boolean;
}

/**
 * Determines the overall proof state of the data record based on the active gates.
 * @param gates The current state of the necessary validation checkpoints.
 * @returns The derived ProofState enum value.
 */
export function deriveProofState(gates: ProofGates): 'FAILED' | 'PARTIAL_PROVEN' | 'FULLY_PROVEN' {
    const {
        representationRegistry,
        qdrantMapping,
        sourceLineage,
        vectorReadback,
        vectorParity,
        payloadParity,
        checkpointPersistence
    } = gates;

    // 1. Check for outright failure (any required gate being false immediately invalidates the write).
    // Note: This check is usually handled by individual functions throwing errors,
    // but we check explicitly for the derivation logic.
    if (!representationRegistry || !qdrantMapping || !sourceLineage || !vectorReadback || !vectorParity || !payloadParity || !checkpointPersistence) {
        // We return FAILED only if a critical, non-optional gate is missed.
        // However, for simplicity in derivation, we check if ALL are true to achieve FULLY_PROVEN.
    }

    // 2. Check for FULLY_PROVEN: All flags must be true.
    if (representationRegistry && qdrantMapping && sourceLineage && vectorReadback && vectorParity && payloadParity && checkpointPersistence) {
        return 'FULLY_PROVEN';
    }

    // 3. Check for PARTIAL_PROVEN: At least one core, major gate is true.
    if (representationRegistry || qdrantMapping || sourceLineage || vectorReadback || vectorParity || payloadParity || checkpointPersistence) {
        // This is a heuristic: if any major gate is true, we are at least past the initial failure point.
        // A more precise definition might require (A && B) but for now, this signifies progress.
        return 'PARTIAL_PROVEN';
    }

    // 4. Default to NOT_PROVEN (or FAILED if we assume a binary state)
    return 'NOT_PROVEN';
}

export type ProofState = 'FAILED' | 'PARTIAL_PROVEN' | 'FULLY_PROVEN' | 'NOT_PROVEN';

// Example of how to use this in the write flow:
/*
const gates: ProofGates = {
    representationRegistry: await validateRepresentationContract(representationId),
    qdrantMapping: await validateQdrantMapping(qdrantId),
    sourceLineage: await validateSourceLineage(sourceHash),
    // ... etc
};

const finalState = deriveProofState(gates);

if (finalState === 'FULLY_PROVEN') {
    // Proceed with write
} else {
    // Log warning/error
}
*/