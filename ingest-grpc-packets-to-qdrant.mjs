#!/usr/bin/env node
/**
 * Ingest gRPC service packets into Qdrant codebase_chunks_768.
 * 
 * Reads grpc-service-packets.jsonl, embeds each packet, upserts into Qdrant.
 * 
 * Usage:
 *   node ingest-grpc-packets-to-qdrant.mjs [--apply]
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const QDRANT_URL = 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const EMBED_URL = 'http://127.0.0.1:11434/api/embeddings';

// Read packets
const packetsPath = './docs/reports/grpc-service-packets.jsonl';
const packets = fs.readFileSync(packetsPath, 'utf-8')
  .split('\n')
  .filter(line => line.trim())
  .map(line => JSON.parse(line));

console.log(`\n═══ Ingest gRPC Packets → Qdrant ═══\n`);
console.log(`Packets to ingest: ${packets.length}`);
console.log(`Target collection: ${COLLECTION}`);
console.log(`Target URL: ${QDRANT_URL}\n`);

async function embedText(text) {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'embeddinggemma:latest',
      prompt: text
    })
  });
  
  if (!res.ok) {
    console.error(`Embedding failed: ${res.status}`);
    throw new Error(`Embedding failed: ${res.status}`);
  }
  
  const data = await res.json();
  return data.embedding;
}

async function upsertToQdrant(points) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: points
    })
  });
  
  if (!res.ok) {
    throw new Error(`Qdrant upsert failed: ${res.status}`);
  }
  
  return await res.json();
}

async function main() {
  const points = [];
  
  for (let i = 0; i < packets.length; i++) {
    const packet = packets[i];
    
    // Embed packet summary
    const text = packet.summary || packet.feature_label || packet.packet_key;
    console.log(`[${i + 1}/${packets.length}] Embedding "${text.slice(0, 50)}..."`);
    
    try {
      const embedding = await embedText(text);
      
      // Qdrant point: ID from packet_key hash, vector from embedding, payload with metadata
      const pointId = Buffer.from(packet.packet_key).reduce((h, b) => (h * 31 + b) >>> 0, 0);
      
      points.push({
        id: pointId,
        vector: embedding,
        payload: {
          packet_key: packet.packet_key,
          source_ref: packet.source_ref,
          feature_id: packet.feature_id,
          feature_label: packet.feature_label,
          directory_path: packet.directory_path,
          domain_class: packet.domain_class || 'mcp_agents',
          qdrant_tags: packet.qdrant_tags || [],
          summary: packet.summary,
          rank: packet.rank,
          inserted_at: new Date().toISOString()
        }
      });
      
      // Batch upsert every 10 packets
      if ((i + 1) % 10 === 0 || i === packets.length - 1) {
        if (APPLY) {
          console.log(`  → Upserting ${points.length} points to Qdrant...`);
          await upsertToQdrant(points);
          console.log(`  ✅ Upserted ${points.length} points`);
          points.length = 0;
        } else {
          console.log(`  [dry-run] Would upsert ${points.length} points`);
        }
      }
    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}`);
      if (!APPLY) break; // Stop on first error in dry-run
    }
  }
  
  console.log(`\n✅ ${APPLY ? 'Ingested' : '[dry-run] Ready to ingest'} ${packets.length} gRPC service packets`);
  console.log(`\nNext: Wire Qdrant RPC retrieval → MCP tool selection`);
}

main().catch(err => {
  console.error(`\n❌ Failed: ${err.message}`);
  process.exit(1);
});
