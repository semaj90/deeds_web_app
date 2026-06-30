#!/usr/bin/env npx tsx
/**
 * Qdrant Payload Enrichment
 * Write packet_key/source_ref/feature_id back into Qdrant payload
 * for matched points so GPU k-means can filter/rerank
 */

import { db } from "../../src/lib/server/db/client.js";
import { sql } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");

interface QdrantPoint {
  id: string;
  payload: Record<string, any>;
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Qdrant Payload Enrichment (Add packet metadata)              ║
╚════════════════════════════════════════════════════════════════╝

Mode: ${DRY_RUN ? "DRY-RUN" : "APPLY"}
Verbose: ${VERBOSE ? "YES" : "NO"}

Goal: Write packet_key/source_ref/feature_id into Qdrant payload
so GPU k-means can filter by source_ref and track lineage.
`);

  // Fetch Qdrant collection stats
  console.log("📊 Fetching Qdrant collection info...");
  try {
    const qdrantUrl = process.env.QDRANT_URL || "http://127.0.0.1:6333";
    const resp = await fetch(`${qdrantUrl}/collections/codebase_chunks_768`);
    const colInfo = await resp.json();
    const totalPoints = colInfo.result?.points_count || 0;
    console.log(`✓ codebase_chunks_768: ${totalPoints} total points`);
  } catch (err) {
    console.warn(`⚠️ Could not fetch Qdrant stats: ${String(err).substring(0, 60)}`);
  }

  // Fetch packets with qdrant_point_id
  console.log("\n📦 Fetching packets with Qdrant IDs from Postgres...");
  const result = await db.execute(sql`
    SELECT
      qdrant_point_id,
      packet_key,
      source_ref,
      feature_id,
      feature_label,
      directory_path
    FROM atlas_packets
    WHERE qdrant_point_id IS NOT NULL
    LIMIT 999999
  `) as any;

  const packets = result.rows || [];
  console.log(`✓ Found ${packets.length} packets with qdrant_point_id`);

  if (DRY_RUN) {
    console.log(`\n[DRY-RUN] Would enrich ${packets.length} Qdrant points with:`);
    console.log("  - packet_key");
    console.log("  - source_ref");
    console.log("  - feature_id");
    console.log("  - feature_label");
    console.log("  - directory_path");

    if (packets.length > 0) {
      console.log(`\nSample point enrichment:`);
      const p = packets[0];
      console.log(JSON.stringify(
        {
          qdrant_point_id: p.qdrant_point_id,
          payload: {
            packet_key: p.packet_key,
            source_ref: p.source_ref,
            feature_id: p.feature_id,
            feature_label: p.feature_label,
            directory_path: p.directory_path,
          },
        },
        null,
        2
      ));
    }
    return;
  }

  // Enrich Qdrant payloads
  console.log(`\n🔄 Enriching Qdrant payloads...`);

  const qdrantUrl = process.env.QDRANT_URL || "http://127.0.0.1:6333";
  const collection = "codebase_chunks_768";

  let successCount = 0;
  let errorCount = 0;

  // Batch updates using Qdrant set_payload API
  const batchSize = 100;
  for (let i = 0; i < packets.length; i += batchSize) {
    const batch = packets.slice(i, i + batchSize);

    try {
      // Qdrant set_payload API: POST /collections/{collection_name}/points/payload
      const response = await fetch(
        `${qdrantUrl}/collections/${collection}/points/payload`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: batch.map((p: any) => ({
              id: p.qdrant_point_id,
              payload: {
                packet_key: p.packet_key,
                source_ref: p.source_ref,
                feature_id: p.feature_id,
                feature_label: p.feature_label,
                directory_path: p.directory_path,
              },
            })),
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
      }

      successCount += batch.length;

      if (VERBOSE || ((i + batchSize) % 500 === 0)) {
        console.log(`  [${Math.min(i + batchSize, packets.length)}/${packets.length}] enriched`);
      }
    } catch (err) {
      errorCount += batch.length;
      console.warn(`  ⚠️ Batch error: ${String(err).substring(0, 80)}`);
    }
  }

  console.log(`
✅ ENRICHMENT COMPLETE

📊 Results:
  Success: ${successCount}
  Errors: ${errorCount}
  Success rate: ${((successCount / packets.length) * 100).toFixed(1)}%

📝 Qdrant payload now includes:
  ✓ packet_key (direct lookup)
  ✓ source_ref (file/module identity)
  ✓ feature_id (semantic grouping)
  ✓ feature_label (human-readable)
  ✓ directory_path (topological path)

🔄 Next: Re-run GPU k-means with larger limit
  npm run gpu:kmeans:dry --limit=2905
  npm run gpu:kmeans:apply --limit=2905

This enables GPU k-means to:
  ✓ Filter by source_ref during clustering
  ✓ Track lineage (point → packet → source file)
  ✓ Validate cluster membership against Postgres truth
  ✓ Generate enriched cluster cards with packet identity
`);
}

main().catch(console.error);
