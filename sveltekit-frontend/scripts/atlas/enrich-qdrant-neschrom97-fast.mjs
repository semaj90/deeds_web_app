#!/usr/bin/env node
/**
 * Fast Qdrant enrichment using direct point update (no batching overhead)
 * Focused on speed: stream updates directly without intermediate collection
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../');
const registryPath = path.join(repoRoot, 'docs/reports/neschrom97-card-registry.json');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';
const BATCH_SIZE = 50; // Smaller batches to avoid timeout

async function main() {
  console.log('\n🚀 Qdrant Tier 2 Enrichment (Fast Mode)\n');

  // Load registry
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const mappings = registry.mappings || [];

  // Build card lookup
  const cardMap = new Map();
  for (const card of mappings) {
    cardMap.set(card.source_ref, {
      card_id: card.card_id,
      packet_id: card.packet_id,
      feature_id: card.feature_id,
      match_confidence: card.match_confidence,
      retrieval_temperature: card.retrieval_temperature
    });
  }

  console.log(`✅ Loaded ${mappings.length} cards`);
  console.log(`✅ Lookup built: ${cardMap.size} unique source_refs\n`);

  // Scroll Qdrant and enrich
  let scrollPtr = null;
  let successCount = 0;
  let errorCount = 0;
  let pointCount = 0;
  let enrichedCount = 0;
  let batchNum = 0;

  console.log('Scrolling and enriching Qdrant points...\n');

  while (true) {
    batchNum++;
    const scrollReq = {
      limit: BATCH_SIZE,
      with_payload: true,
      with_vector: false
    };
    if (scrollPtr) scrollReq.offset = scrollPtr;

    const resp = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scrollReq)
    });

    if (!resp.ok) {
      console.error(`❌ Scroll failed: ${resp.statusText}`);
      break;
    }

    const data = await resp.json();
    const points = data.result?.points || [];

    if (points.length === 0) break;
    pointCount += points.length;

    // Enrich batch
    const updates = [];
    for (const point of points) {
      const sourceRef = point.payload?.source_ref;
      if (sourceRef && cardMap.has(sourceRef)) {
        const card = cardMap.get(sourceRef);
        updates.push({
          id: point.id,
          payload: {
            neschrom97_enrichment: {
              surface: 'neschrom97',
              card_id: card.card_id,
              feature_id: card.feature_id,
              match_confidence: card.match_confidence,
              retrieval_temperature: card.retrieval_temperature,
              enriched_at: new Date().toISOString()
            }
          }
        });
        enrichedCount++;
      }
    }

    if (updates.length > 0) {
      try {
        const updateResp = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: updates })
        });

        if (updateResp.ok) {
          successCount += updates.length;
          if (batchNum % 10 === 0) console.log(`✅ Batch ${batchNum}: ${updates.length}/${points.length} enriched`);
        } else {
          const err = await updateResp.text();
          errorCount += updates.length;
          console.log(`❌ Batch ${batchNum}: ${err.substring(0, 100)}`);
          console.log(`   Status: ${updateResp.status}, Response: ${err.substring(0, 50)}`);
        }
      } catch (err) {
        errorCount += updates.length;
        console.log(`❌ Batch ${batchNum}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!data.result?.next_page_offset) break;
    scrollPtr = data.result.next_page_offset;
  }

  console.log(`\n📊 Final Summary:`);
  console.log(`  Points scanned: ${pointCount}`);
  console.log(`  Points enriched: ${enrichedCount}`);
  console.log(`  Updates successful: ${successCount}`);
  console.log(`  Updates failed: ${errorCount}\n`);

  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`\n❌ Fatal: ${err.message}\n`);
  process.exit(1);
});
