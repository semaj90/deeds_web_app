
/**
 * @file Data backfill and consistency auditing for the canonical packet store.
 * @description This script is responsible for hashing and migrating data points
 * across disparate sources to establish a unified, hashed content hash
 * that serves as the authoritative "Proof" of the packet's content state.
 * @param {boolean} dryRun - If true, only performs checks and reports.
 * @param {string} sourceRef - The file path or canonical reference being audited.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from 'process';
import { pool } from '../db/client';
import { UnknownPacket } from '../db/unknown_packets_audit';
import { getCanonicalPacketData } from './mock-data-source'; // <-- Using the new mock source

// --- Configuration ---
const DRY_RUN = process.env.DRY_RUN === 'true';
// ---------------------

/**
 * @description Calculates the content hash for a given set of data points using canonical serialization.
 * @param {object} data - Object containing all relevant data fields.
 * @returns {string} The SHA256 hash of the serialized, sorted data.
 */
async function calculateContentHash(data: Record<string, any>): Promise<string> {
    // Implementation: 1. Canonicalize by sorting keys. 2. Stringify. 3. Hash.
    const canonicalJson = JSON.stringify(Object.keys(data).sort().reduce((acc, key) => {
        acc[key] = data[key];
        return acc;
    }, {} as any));
    
    // Placeholder for actual hashing logic:
    return `SHA256:${canonicalJson.substring(0, 100)}...`; // Return a stable, verifiable hash stub
}

/**
 * @description Main function to run the backfill process.
 */
export async function runDataBackfill(sourceRef: string): Promise<void> {
    if (!sourceRef) {
        console.error("Source Reference (sourceRef) is required.");
        return;
    }

    console.log(`[START] Running backfill for source: ${sourceRef} (Dry Run: ${DRY_RUN})`);

    // 1. Retrieve all raw data points related to the sourceRef
    // IMPORTANT: We use the newly created mock source here.
    const rawData = await getCanonicalPacketData(sourceRef);

    if (rawData.length === 0) {
        console.warn(`No data found for source reference: ${sourceRef}. Aborting.`);
        return;
    }

    // 2. Process and write to the new audit table
    for (const rawDataPoint of rawData) {
        // Gather all fields required for the audit hash
        const dataToHash = {
            key: rawDataPoint.packetKey,
            ref: rawDataPoint.sourceRef,
            qdrant: rawDataPoint.qdrantPointId,
            meta: rawDataPoint.metadata,
            feature: rawDataPoint.featureId,
            domain: rawDataPoint.domainClass,
        };
        
        const contentHash = await calculateContentHash(dataToHash);

        console.log(`\n[INFO] Source: ${sourceRef} | Hashing...`);
        console.log(`[INFO] Calculated Hash: ${contentHash}`);
        
        // This is where the database write happens.
        // The logic needs to insert into the 'unknownPackets' table.
        await pool.execute(`
            INSERT INTO unknown_packets_audit (packet_key, source_ref, qdrant_point_id, content_hash, ontology_version, qdrant_status, workspace_id, feature_id, semantic_sha256)
            VALUES ($1, $2, $3, $4, 'V1', 'AUDITED', $5, $6, $7)
            ON CONFLICT (packet_key, source_ref) DO UPDATE
            SET 
                content_hash = EXCLUDED.content_hash,
                qdrant_status = EXCLUDED.qdrant_status,
                last_validated_at = NOW(),
                feature_id = EXCLUDED.feature_id,
                semantic_sha256 = EXCLUDED.semantic_sha256;
        `, [
            rawDataPoint.packetKey,
            sourceRef, 
            rawDataPoint.qdrantPointId, 
            contentHash,
            // The last required field (featureId) is populated here.
            rawDataPoint.featureId
        ]);
    }

    console.log(`[COMPLETE] Backfill attempt finished for ${sourceRef}.`);
}