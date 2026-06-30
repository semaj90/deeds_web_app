#!/usr/bin/env node
/**
 * Export cluster summary batches for Colab
 * Input: cluster-cards.jsonl (from graphify:cluster-cards:generate)
 * Output: colab-cluster-summary-batches.jsonl (structured for Colab enrichment)
 */

import fs from "fs";
import path from "path";
import readline from "readline";

const args = process.argv.slice(2);
const inputIdx = args.indexOf("--input");
const outputIdx = args.indexOf("--output");

const INPUT_FILE = inputIdx >= 0 ? args[inputIdx + 1] : "memory/cluster-cards/cluster-cards.jsonl";
const OUTPUT_FILE = outputIdx >= 0 ? args[outputIdx + 1] : "colab-cluster-summary-batches.jsonl";

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Export Cluster Summary Batches for Colab                     ║
╚════════════════════════════════════════════════════════════════╝

Input:  ${INPUT_FILE}
Output: ${OUTPUT_FILE}
`);

  // Check input file
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Input file not found: ${INPUT_FILE}`);
    console.error("   Run: npm run graphify:cluster-cards:generate");
    process.exit(1);
  }

  // Read cluster cards
  console.log("📖 Reading cluster cards...");
  const clusters = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT_FILE),
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        clusters.push(JSON.parse(line));
      } catch {
        console.warn("  ⚠️ Skipped malformed line");
      }
    }
  }

  console.log(`✓ Loaded ${clusters.length} cluster cards`);

  // Transform for Colab
  console.log("\n📝 Transforming for Colab...");
  const batches = clusters.map((cluster) => ({
    cluster_id: cluster.cluster_id || `cluster:${cluster.name || "unknown"}`,
    member_packet_ids: cluster.members || [],
    source_refs: cluster.source_refs || [],
    directory_paths: cluster.directories || [cluster.directory || "unknown"],
    feature_ids: cluster.feature_ids || [cluster.feature_id || ""],
    domain: cluster.domain || "general",
    ontology_terms: cluster.ontology_terms || cluster.tags || [],
    sample_texts: cluster.sample_texts || [],
    existing_tags: cluster.tags || [],
    member_count: cluster.members?.length || 0,
  }));

  // Write output
  console.log(`\n💾 Writing ${batches.length} batches...`);
  const lines = batches.map((b) => JSON.stringify(b));
  fs.writeFileSync(OUTPUT_FILE, lines.join("\n"));
  console.log(`✓ Wrote ${OUTPUT_FILE}`);

  console.log(`
✅ EXPORT READY FOR COLAB

📊 Summary:
  Clusters: ${batches.length}
  Total member packets: ${batches.reduce((s, b) => s + b.member_count, 0)}
  File size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)}MB

📤 Upload to Colab:
  1. Upload ${OUTPUT_FILE}
  2. Upload colab-enrich-clusters.py
  3. Run: python colab-enrich-clusters.py
  4. Download: enriched-clusters.jsonl
  5. Run locally: node scripts/atlas/import-cluster-summaries.mjs enriched-clusters.jsonl --apply

⏱️ Expected time on T4:
  ${Math.ceil(batches.length / 3)}-${Math.ceil(batches.length)} minutes (${batches.length} clusters)
`);
}

main().catch(console.error);
