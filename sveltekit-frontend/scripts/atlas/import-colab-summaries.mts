#!/usr/bin/env npx tsx
/**
 * Import Colab-generated summaries back into Postgres
 * Reads summaries.jsonl from colab-export/ directory
 * Updates atlas_summary_layers and analysis_pass_results
 */

import fs from "fs/promises";
import path from "path";
import readline from "readline";
import { db } from "../../src/lib/server/db/client.js";
import { atlasPackets, atlasSummaryLayers, analysisPassResults } from "../../src/lib/server/db/schema-postgres.js";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const EXPORT_DIR = path.join(process.cwd(), "colab-export");
const SUMMARIES_FILE = path.join(EXPORT_DIR, "summaries.jsonl");
const DRY_RUN = process.argv.includes("--dry-run");

interface ColabSummary {
  packet_key: string;
  summary: string;
  model?: string;
  timestamp?: number;
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Import Colab Summaries                                       ║
╚════════════════════════════════════════════════════════════════╝

Summaries File: ${SUMMARIES_FILE}
Mode: ${DRY_RUN ? "DRY-RUN" : "APPLY"}
`);

  // Check if file exists
  try {
    await fs.stat(SUMMARIES_FILE);
  } catch {
    console.error(`❌ File not found: ${SUMMARIES_FILE}`);
    console.error(`   Download summaries.jsonl from Colab and save to colab-export/ directory`);
    process.exit(1);
  }

  // Read summaries
  console.log("📖 Reading summaries from JSONL...");
  const summaries: ColabSummary[] = [];
  const rl = readline.createInterface({
    input: await fs.open(SUMMARIES_FILE).then((f) => f.createReadStream()),
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        summaries.push(JSON.parse(line));
      } catch (err) {
        console.warn(`  ⚠️ Skipped malformed line: ${line.substring(0, 60)}...`);
      }
    }
  }

  console.log(`✓ Loaded ${summaries.length} summaries`);

  if (DRY_RUN) {
    console.log("\n[DRY-RUN] Would update:");
    console.log(`  - ${summaries.length} packets in atlas_packets`);
    console.log(`  - ${summaries.length} rows in analysis_pass_results`);
    console.log(`  - ${summaries.length} rows in atlas_summary_layers`);

    // Show sample
    if (summaries.length > 0) {
      console.log(`\nSample first 3:`);
      for (let i = 0; i < Math.min(3, summaries.length); i++) {
        console.log(`  [${i + 1}] ${summaries[i].packet_key}`);
        console.log(`      "${summaries[i].summary.substring(0, 80)}..."`);
      }
    }
    return;
  }

  // Import
  console.log(`\n📝 Importing ${summaries.length} summaries...`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < summaries.length; i++) {
    const { packet_key, summary } = summaries[i];

    try {
      // 1. Update atlas_packets with summary
      await db
        .update(atlasPackets)
        .set({ summary })
        .where(eq(atlasPackets.packet_key, packet_key));

      // 2. Log to analysis_pass_results
      await db.insert(analysisPassResults).values({
        pass_key: `colab-import-${Date.now()}`,
        pass_type: "summarization",
        status: "success",
        packet_key,
        packet_source_ref: null,
        output: {
          summary,
          source: "google-colab",
          import_batch: true,
        },
        scores: null,
        index_push: false,
        provenance: {
          method: "colab-gemma4-export",
          retry_count: 0,
          cached_at: new Date().toISOString(),
        },
      } as any);

      // 3. Write to atlas_summary_layers
      await db
        .insert(atlasSummaryLayers)
        .values({
          packet_key,
          layer_id: 0,
          layer_name: "colab_summaries",
          summary,
          summaries: [summary],
          metadata: {
            source: "google-colab",
            model: "gemma4",
          } as any,
        })
        .onConflictDoUpdate({
          target: [atlasSummaryLayers.packet_key, atlasSummaryLayers.layer_id],
          set: { summary, summaries: [summary] },
        });

      successCount++;

      if ((i + 1) % 1000 === 0) {
        console.log(`  [${i + 1}/${summaries.length}] imported`);
      }
    } catch (err) {
      console.warn(`  ⚠️ Error importing ${packet_key}: ${String(err).substring(0, 80)}`);
      errorCount++;
    }
  }

  // Summary
  console.log(`
✅ IMPORT COMPLETE

📊 Results:
  Success: ${successCount}
  Errors: ${errorCount}
  Success rate: ${((successCount / summaries.length) * 100).toFixed(1)}%

✓ Updated atlas_packets.summary
✓ Logged to analysis_pass_results (pass_type='summarization')
✓ Wrote to atlas_summary_layers (layer_id=0)

Next: npm run phase-b:progress
`);
}

main().catch(console.error);
