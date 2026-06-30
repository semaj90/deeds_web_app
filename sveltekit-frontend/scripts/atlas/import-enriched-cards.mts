#!/usr/bin/env npx tsx
/**
 * Import enriched cards from Colab
 * Stores structured annotations in Postgres JSONB
 * Prepares for EmbeddingGemma multivector indexing
 */

import fs from "fs/promises";
import path from "path";
import readline from "readline";
import { db } from "../../src/lib/server/db/client.js";
import { sql } from "drizzle-orm";

const CARDS_FILE = "colab-export-cards/enriched-cards.jsonl";
const DRY_RUN = process.argv.includes("--dry-run");

interface EnrichedCard {
  packet_id: string;
  summary: string;
  entities: string[];
  actions: string[];
  risks: string[];
  tags: string[];
  ontology_text?: string;
  error?: string;
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Import Enriched Cards from Colab                             ║
╚════════════════════════════════════════════════════════════════╝

Cards File: ${CARDS_FILE}
Mode: ${DRY_RUN ? "DRY-RUN" : "APPLY"}
`);

  // Check file exists
  try {
    await fs.stat(CARDS_FILE);
  } catch {
    console.error(`❌ File not found: ${CARDS_FILE}`);
    console.error("   Download enriched-cards.jsonl from Colab first");
    process.exit(1);
  }

  // Read cards
  console.log("📖 Reading enriched cards...");
  const cards: EnrichedCard[] = [];
  const rl = readline.createInterface({
    input: await fs.open(CARDS_FILE).then((f) => f.createReadStream()),
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        cards.push(JSON.parse(line));
      } catch {
        console.warn(`  ⚠️ Skipped malformed line`);
      }
    }
  }

  console.log(`✓ Loaded ${cards.length} enriched cards`);

  if (DRY_RUN) {
    console.log(`\n[DRY-RUN] Would update:`);
    console.log(`  - ${cards.length} packets with structured enrichment`);
    console.log(`  - Postgres JSONB columns: summary, entities, actions, risks, tags`);
    if (cards.length > 0) {
      console.log(`\nSample card 0:`);
      console.log(JSON.stringify(cards[0], null, 2).substring(0, 300) + "...");
    }
    return;
  }

  // Import
  console.log(`\n💾 Importing to Postgres...`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];

    try {
      // Update atlas_packets with structured enrichment
      await db.execute(
        sql`
          UPDATE atlas_packets
          SET
            summary = ${card.summary},
            payload = jsonb_set(
              COALESCE(payload, '{}'::jsonb),
              '{enrichment}',
              ${JSON.stringify({
                entities: card.entities,
                actions: card.actions,
                risks: card.risks,
                tags: card.tags,
                ontology_text: card.ontology_text,
                source: "colab-enrichment",
                timestamp: new Date().toISOString(),
              })}::jsonb
            )
          WHERE packet_key = ${card.packet_id}
        `
      );

      // Also update/insert into analysis_pass_results for provenance
      await db.execute(sql`
        INSERT INTO analysis_pass_results (
          pass_key, pass_type, status, packet_key,
          output, scores, provenance
        )
        VALUES (
          ${`colab-enrichment-${Date.now()}`},
          'enrichment',
          'success',
          ${card.packet_id},
          ${JSON.stringify({
            summary: card.summary,
            entities: card.entities,
            actions: card.actions,
            risks: card.risks,
            tags: card.tags,
          })},
          NULL,
          ${JSON.stringify({
            method: "colab-gemma4-e4b",
            entities_count: card.entities.length,
            actions_count: card.actions.length,
            risks_count: card.risks.length,
            tags_count: card.tags.length,
          })}
        )
        ON CONFLICT DO NOTHING
      `);

      successCount++;

      if ((i + 1) % 5000 === 0) {
        console.log(`  [${i + 1}/${cards.length}] imported`);
      }
    } catch (err) {
      errorCount++;
      if (errorCount < 5) {
        console.warn(`  ⚠️ Error on ${card.packet_id}: ${String(err).substring(0, 60)}`);
      }
    }
  }

  console.log(`
✅ IMPORT COMPLETE

📊 Results:
  Success: ${successCount}
  Errors: ${errorCount}
  Success rate: ${((successCount / cards.length) * 100).toFixed(1)}%

💾 Stored:
  ✓ Summaries in atlas_packets.summary
  ✓ Structured enrichment in atlas_packets.payload.enrichment
  ✓ Provenance in analysis_pass_results

🔄 Next Steps:
  1. npm run worker:embedding:batch:apply
     (Embeds summaries via EmbeddingGemma → Qdrant multivectors)

  2. npm run atlas:kag:ingest-entities
     (Create Neo4j KAG edges from entities/actions)

  3. Ready for ACE/KAG/DAG agent workflows

Summary of what's now in Postgres:

atlas_packets row:
{
  packet_key: "...",
  source_ref: "...",
  summary: "...",  ← from Colab
  payload: {
    enrichment: {
      entities: [...],      ← from Colab
      actions: [...],       ← from Colab
      risks: [...],         ← from Colab
      tags: [...],          ← from Colab
      ontology_text: "..."  ← from Colab
    }
  }
}

Next: EmbeddingGemma will embed the summary text for Qdrant multivectors.
`);
}

main().catch(console.error);
