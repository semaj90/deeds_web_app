// ============================================================================
// EvidenceResolver: Responsible for gathering and normalizing evidence from all sources.
// Adheres to the Evidence Authority Order.
// ============================================================================

import { z } from "zod";
import { EvidenceObject, EvidenceSourceKind, EvidenceObjectSchema } from "../../../contracts/contradiction-examination";
import { RedisClient } from "./redis"; // Placeholder for actual Redis connection
import { QdrantClient } from "./qdrant"; // Placeholder
import { PostgresClient } from "./postgres"; // Placeholder
import { WebResearchClient } from "./web-research"; // Placeholder

/**
 * @class EvidenceResolver
 * @classDescription Orchestrates the retrieval of evidence from all canonical, non-canonical,
 * and external sources based on the required authority order. It handles deduplication
 * and normalization into the EvidenceObject structure.
 */
export class EvidenceResolver {

    private readonly redis: RedisClient;
    private readonly qdrantClient: QdrantClient;
    private readonly pgClient: PostgresClient;
    private readonly webResearchClient: WebResearchClient;

    constructor() {
        this.redis = new RedisClient();
        this.qdrantClient = new QdrantClient();
        this.pgClient = new PostgresClient();
        this.webResearchClient = new WebResearchClient();
    }

    /**
     * Orchestrates the multi-source retrieval pipeline.
     * @param claimInput - The input data containing task context.
     * @param examId - The ID of the current examination session.
     * @returns A Promise resolving to an array of all resolved, normalized EvidenceObject instances.
     */
    public async resolveEvidence(claimInput: any, examId: string): Promise<EvidenceObject[]> {
        console.log(`[EvidenceResolver] Starting evidence resolution for Exam ID: ${examId}`);
        let evidenceArray: EvidenceObject[] = [];

        // 1. Canonical Source (Highest Priority)
        console.log("[EvidenceResolver] 1. Querying canonical PostgreSQL records...");
        const pgEvidence = await this.pgClient.queryCanonicalEvidence(claimInput, examId);
        evidenceArray.push(...pgEvidence);

        // 2. Retrieval Sources (Mirror/Projection)
        console.log("[EvidenceResolver] 2. Querying Qdrant/Neo4j/Redis mirrors...");
        const qdrantEvidence = await this.qdrantClient.queryEvidence(claimInput, examId);
        evidenceArray.push(...qdrantEvidence);

        // 3. External/Non-Canonical Sources
        console.log("[EvidenceResolver] 3. Checking external sources (Web/Logs)...");
        const webEvidence = await this.webResearchClient.search(claimInput, examId);
        evidenceArray.push(...webEvidence);

        // 4. Final Deduplication and Normalization
        console.log("[EvidenceResolver] 4. Deduplicating and finalizing evidence objects...");
        const { resolved: finalEvidence, warnings } = this.deduplicateAndNormalize(evidenceArray, examId);

        if (warnings.length > 0) {
            console.warn("Evidence resolution warnings:", warnings);
        }

        console.log(`[EvidenceResolver] Successfully resolved ${finalEvidence.length} unique evidence objects.`);
        return finalEvidence;
    }

    /**
     * Implements logic to deduplicate records based on sourceRef + contentHash,
     * while preserving the highest authority source.
     * @param candidates - Array of raw evidence objects from all sources.
     * @param examId - Current examination ID.
     * @returns An object containing the final, unique evidence array and any warnings.
     */
    private deduplicateAndNormalize(candidates: EvidenceObject[], examId: string): { resolved: EvidenceObject[]; warnings: string[] } {
        const canonicalMap = new Map<string, EvidenceObject>();
        const warnings: string[] = [];

        for (const candidate of candidates) {
            const uniqueKey = `${candidate.sourceRef}:${candidate.contentHash}`;

            if (canonicalMap.has(uniqueKey)) {
                // Already processed this unique piece of content/source pair
                continue;
            }

            // Simple logic: The first one seen (if it passed the canonical check) wins,
            // or we can check for a higher authority marker.
            canonicalMap.set(uniqueKey, candidate);
        }

        const finalEvidence = Array.from(canonicalMap.values());
        return { resolved: finalEvidence, warnings: warnings };
    }
}
export { EvidenceResolver;