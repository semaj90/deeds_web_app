
// scripts/atlas/wire-bifrost-packet-mirror.mjs

import { Pool } from 'pg';
import redisClient from '../utils/redis_client.js'; // Assuming a utility for Redis connection

/**
 * Mirrors Bifrost packet data from the Postgres atlas_higher_hop_index table to Redis/Valkey cache keys.
 * 
 * CORE RULE: This script is read-only and non-destructive. It only reads from Postgres
 * and writes to Redis/Valkey as a hot mirror for consumption by other services.
 * DO NOT run this in production without first reviewing the SQL query and key generation logic.
 */

// --- Configuration ---
const PG_CONN_STRING = process.env.DATABASE_URL; // Use environment variable for connection string
const REDIS_CLIENT = redisClient(); 

/**
 * Connects to Postgres, reads data from atlas_higher_hop_index, and mirrors the Bifrost packet information to Redis.
 */
async function mirrorBifrostData() {
    console.log("Starting Bifrost Packet Data Mirroring process...");

    // 1. Establish connection (assuming a utility handles this)
    const pool = new Pool({ connectionString: PG_CONN_STRING });
    await pool.connect();
    console.log("Successfully connected to Postgres.");

    try {
        // 2. Query the source data from Postgres
        const queryText = `
            SELECT 
                packet_key, 
                feature_id, 
                community_id, 
                som_cluster, 
                qdrant_payload_key
            FROM 
                atlas_higher_hop_index
            WHERE 
                -- Add filtering logic here if needed (e.g., WHERE updated_at > $1)
                TRUE;
        `;

        console.log("Executing read-only query on atlas_higher_hop_index...");
        const result = await pool.query(queryText);
        const records = result.rows;

        if (records.length === 0) {
            console.warn("No records found in atlas_higher_hop_index. Nothing to mirror.");
            return;
        }

        console.log(\`Found \${records.length} records to process.\`);

        // 3. Process and write data to Redis/Valkey
        for (const record of records) {
            const { packet_key, feature_id, community_id, som_cluster, qdrant_payload_key } = record;

            if (!community_id || !feature_id || !som_cluster) {
                console.warn(\`Skipping record for packet \${packet_key}: Missing required fields.\`);
                continue;
            }

            // --- Redis Key Generation Logic ---
            const redisKey = `bifrost:packet:${packet_key}`; // Primary key based on packet_key
            const valueJson = JSON.stringify({
                feature_id: feature_id,
                community_id: community_id,
                som_cluster: som_cluster,
                qdrant_payload_key: qdrant_payload_key,
                last_updated: new Date().toISOString(),
            });

            // 4. Execute the write operation (SET key value)
            await REDIS_CLIENT.set(redisKey, valueJson);
            console.log(\`[SUCCESS] Mirrored Bifrost data for packet \${packet_key} to key: \${redisKey}\`);
        }

        console.log("Bifrost Packet Data Mirroring completed successfully.");

    } catch (error) {
        console.error("An error occurred during the mirroring process:", error);
    } finally {
        pool.release();
    }
}

// Execute the main function
mirrorBifrostData();
