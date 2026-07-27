/**
 * @file Mock data source for backfilling canonical packet data.
 * @description This module simulates the retrieval of raw data points that need hashing
 * and validation against the new schema structure.
 */

export type RawDataPoint = {
    packetKey: string;
    sourceRef: string;
    qdrantPointId: string;
    // Include all fields that should be part of the canonical "truth" for hashing
    metadata: Record<string, any>;
    // Add other necessary fields here
    featureId: string | null;
    domainClass: string | null;
};

/**
 * @description Retrieves a set of simulated, raw data points for a given source reference.
 * @param {string} sourceRef - The reference to audit (e.g., file path).
 * @returns {Promise<RawDataPoint[]>} Array of raw data points ready for hashing.
 */
export async function getCanonicalPacketData(sourceRef: string): Promise<RawDataPoint[]> {
    console.log(`[MOCK] Simulating data retrieval for: ${sourceRef}`);

    if (sourceRef.includes('test-failure')) {
        return [];
    }

    // Simulation: Returning two mock points for a successful audit
    return [
        {
            packetKey: `KEY_123_${sourceRef.replace(/[^a-zA-Z0-9]/g, '')}`,
            sourceRef: sourceRef,
            qdrantPointId: `mock_qdrant_id_A_${Date.now()}`,
            metadata: {
                summary: "The first test summary.",
                title: "Test Title A",
                content: "This is the canonical text content.",
            },
            featureId: "F_TEST_A",
            domainClass: "D_CORE",
        },
        {
            packetKey: `KEY_456_${sourceRef.replace(/[^a-zA-Z0-9]/g, '')}`,
            sourceRef: sourceRef,
            qdrantPointId: `mock_qdrant_id_B_${Date.now()}`,
            metadata: {
                summary: "The second test summary.",
                title: "Test Title B",
                content: "This is the second canonical text content.",
            },
            featureId: "F_TEST_B",
            domainClass: "D_CORE",
        },
    ];
}