#!/usr/bin/env node
/**
 * Import enriched cluster summaries from Colab
 * Input: enriched-clusters.jsonl
 * Updates: cluster_cards table with structured enrichment
 */

import fs from "fs";
import readline from "readline";
import pg from "pg";

const { Pool } = pg;
const args = process.argv.slice(2);
const INPUT_FILE = args[0] || "enriched-clusters.jsonl";
const APPLY = args.includes("--apply");
const DRY_RUN = args.includes("--dry-run") || !APPLY;

const pool = new Pool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: process.env.DB_PORT || 5434,
  user: process.env.DB_USER || "legal_admin",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "legal_ai_db",
});

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Import Enriched Cluster Summaries                            ║
╚════════════════════════════════════════════════════════════════╝

Input: ${INPUT_FILE}
Mode: ${DRY_RUN ? "DRY-RUN" : "APPLY"}
`);

  // Check file
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ File not found: ${INPUT_FILE}`);
    console.error("   Download enriched-clusters.jsonl from Colab first");
    process.exit(1);
  }

  // Read clusters
  console.log("📖 Reading enriched clusters...");
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

  console.log(`✓ Loaded ${clusters.length} enriched clusters`);

  if (DRY_RUN) {
    console.log(`\n[DRY-RUN] Would update:`);
    console.log(`  - ${clusters.length} cluster cards`);
    console.log(`  - Columns: cluster_title, summary, entities, actions, risks, tags, ontology_text`);
    if (clusters.length > 0) {
      console.log(`\nSample cluster 0:`);
      console.log(JSON.stringify(clusters[0], null, 2).substring(0, 400) + "...");
    }
    return;
  }

  // Import
  console.log(`\n💾 Importing to Postgres...`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];

    try {
      await pool.query(
        `
        UPDATE cluster_cards
        SET
          cluster_title = $1,
          summary = $2,
          domain = $3,
          feature_label = $4,
          entities = $5,
          actions = $6,
          inputs = $7,
          outputs = $8,
          risks = $9,
          tags = $10,
          ontology_text = $11,
          kag_edges = $12,
          metadata = jsonb_set(
            COALESCE(metadata, '{}'),
            '{enriched_by}',
            '"colab-gemma4-e4b"'
          ),
          status = 'enriched',
          updated_at = NOW()
        WHERE cluster_id = $13
        `,
        [
          cluster.cluster_title,
          cluster.summary,
          cluster.domain,
          cluster.feature_label,
          JSON.stringify(cluster.entities),
          JSON.stringify(cluster.actions),
          JSON.stringify(cluster.inputs),
          JSON.stringify(cluster.outputs),
          JSON.stringify(cluster.risks),
          JSON.stringify(cluster.tags),
          cluster.ontology_text,
          JSON.stringify(cluster.kag_edges || []),
          cluster.cluster_id,
        ]
      );

      successCount++;

      if ((i + 1) % 10 === 0) {
        console.log(`  [${i + 1}/${clusters.length}] imported`);
      }
    } catch (err) {
      errorCount++;
      if (errorCount < 5) {
        console.warn(`  ⚠️ Error on ${cluster.cluster_id}: ${String(err).substring(0, 60)}`);
      }
    }
  }

  await pool.end();

  console.log(`
✅ IMPORT COMPLETE

📊 Results:
  Success: ${successCount}
  Errors: ${errorCount}
  Success rate: ${((successCount / clusters.length) * 100).toFixed(1)}%

💾 Updated cluster_cards table with:
  ✓ cluster_title (structured title)
  ✓ summary (enriched description)
  ✓ entities (extracted concepts)
  ✓ actions (extracted actions)
  ✓ risks (identified risks)
  ✓ tags (semantic tags)
  ✓ ontology_text (space-separated concepts for embedding)
  ✓ kag_edges (Neo4j edge suggestions)

🔄 Next Steps:
  1. npm run worker:embedding:batch:apply
     (Embeds ontology_text via EmbeddingGemma → Qdrant ontology_vector)

  2. npm run atlas:kag:ingest-from-clusters
     (Create Neo4j KAG edges from entities/actions)

  3. Ready for ACE/KAG/DAG agent workflows

📊 Cluster Cards now in Postgres:
  - cluster_cards.cluster_title
  - cluster_cards.summary
  - cluster_cards.ontology_text ← ready for embedding
  - cluster_cards.kag_edges ← ready for Neo4j import

Next: Embed summaries and ontology_text for Qdrant multivectors.
`);
}

main().catch(console.error);
