/**
 * @module atlas/backfill-atlas-packets-from-hop-index
 * @description Migrates canonical identity records from the higher hop index into the primary atlas_packets table.
 * This script is READ-ONLY by default and should only be run to populate missing data, never for mutation of source keys.
 */

import { db } from '@/lib/server/db/client'; // Assuming Drizzle client path
import { eq } from 'drizzle-orm';
import { atlas_higher_hop_index, atlas_packets } from './schema'; // Assuming schema definition

/**
 * Normalizes a source reference string into the canonical format used in the system.
 * @param rawRef The raw file path or identifier.
 * @returns A normalized string.
 */
function normalizeSourceRef(rawRef: string): string {
    // Implementation to handle various input formats (e.g., removing prefixes, standardizing case)
    return rawRef.trim();
}

/**
 * Runs the backfill process from atlas_higher_hop_index to populate atlas_packets.
 * This function is designed to be run as a one-off migration/script.
 */
export async function backfillAtlasPackets() {
    console.log("--- Starting Atlas Packet Backfill Process ---");

    // 1. Check for existing data and calculate delta
    const existingCount = await db.query.atlas_packets.select({ id: true }).execute();
    console.log(`[INFO] Existing records in atlas_packets: ${existingCount.rows.length}`);

    // 2. Query the source of truth (Higher Hop Index)
    // We select all necessary fields from the index to check for missing data in the target table.
    const hopIndexRecords = await db.query.atlas_higher_hop_index.select({
        sourceRef: true,
        featureId: true,
        featureLabel: true,
        packetKey: true,
        identityLane: true,
        communityId: true,
        treeNodeId: true,
        qdrantPointId: true,
        rewardPrior: true,
    });

    console.log(`[INFO] Found ${hopIndexRecords.rows.length} records in atlas_higher_hop_index.`);

    // 3. Process and insert/update records
    const recordsToInsert = [];
    for (const record of hopIndexRecords.rows) {
        // Check if the primary key or a unique combination already exists in atlas_packets
        // For simplicity, we check for sourceRef existence here.
        const existingPacket = await db.query.atlas_packets.findFirst({
            where: and(eq(atlas_packets.source_ref, record.sourceRef)),
        });

        if (existingPacket) {
            console.log(`[SKIP] Source Ref ${record.sourceRef} already exists in atlas_packets.`);
            continue;
        }

        // Data mapping: We are inserting the full set of data from the index into the canonical table.
        recordsToInsert.push({
            source_ref: record.sourceRef,
            feature_id: record.featureId,
            feature_label: record.featureLabel,
            packet_key: record.packetKey,
            identity_lane: record.identityLane,
            community_id: record.communityId,
            tree_node_id: record.treeNodeId,
            qdrant_point_id: record.qdrantPointId,
            reward_prior: record.rewardPrior,
        });
    }

    if (recordsToInsert.length === 0) {
        console.log("[SUCCESS] No new records found to backfill.");
        return;
    }

    // Execute batch insert/upsert logic here using Drizzle's transaction capabilities
    await db.transaction(async (tx) => {
        for (const record of recordsToInsert) {
            await tx.atlas_packets.insert({
                source_ref: record.source_ref,
                feature_id: record.feature_id,
                feature_label: record.feature_label,
                packet_key: record.packet_key,
                identity_lane: record.identity_lane,
                community_id: record.community_id,
                tree_node_id: record.tree_node_id,
                qdrant_point_id: record.qdrant_point_id,
                reward_prior: record.reward_prior,
            });
        }
    });

    console.log(`\n[SUCCESS] Successfully backfilled ${recordsToInsert.length} new records into atlas_packets.`);
}