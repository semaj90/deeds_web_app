#!/usr/bin/env node
/**
 * Ingest gRPC service packets into Qdrant codebase_chunks_768.
 * Uses named vector 'content' (768-dim) for ANN search.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

const QDRANT_URL = 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const EMBED_URL = 'http://127.0.0.1:11434/api/embeddings';

// Read packets
const packetsPath = path.join(ROOT, 'docs', 'reports', 'grpc-service-packets.jsonl');
const packets = fs.readFileSync(packetsPath, 'utf-8')
  .split('\n')
  .filter(line => line.trim())
  .map(line => JSON.parse(line));

console.log(`\n═══ Ingest gRPC Packets → Qdrant ═══\n`);
console.log(`Packets: ${packets.length}`);
console.log(`Collection: ${COLLECTION} (named vector 'content', 768-dim)`);
console.log(`Embedding: Ollama embeddinggemma:latest\n`);

async function embedText(text) {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'embeddinggemma:latest',
      prompt: text
    })
  });
  
  if (!res.ok) throw new Error(`Embed failed: ${res.status}`);
  const data = await res.json();
  return data.embedding;
}

async function upsertToQdrant(points) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points })
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant ${res.status}: ${text.slice(0, 200)}`);
  }
  
  return await res.json();
}

async function main() {
  const points = [];
  let embedded = 0;
  let upserted = 0;
  
  for (let i = 0; i < packets.length; i++) {
    const packet = packets[i];
    const text = packet.summary || packet.feature_label || packet.packet_key;
    
    if ((i + 1) % 10 === 1) {
      console.log(`[${i + 1}/${packets.length}] Embedding: "${text.slice(0, 50)}..."`);
    }
    
    try {
      const embedding = await embedText(text);
      const pointId = Buffer.from(packet.packet_key).reduce((h, b) => (h * 31 + b) >>> 0, 0);
      
      points.push({
        id: pointId,
        vectors: {
          content: embedding  // Named vector 'content' (768-dim)
        },
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
      
      embedded++;
      
      // Batch upsert every 10
      if ((i + 1) % 10 === 0 || i === packets.length - 1) {
        if (APPLY) {
          console.log(`  → Upserting ${points.length} points...`);
          try {
            await upsertToQdrant(points);
            upserted += points.length;
            console.log(`  ✅ OK`);
          } catch (err) {
            console.error(`  ❌ ${err.message}`);
          }
          points.length = 0;
        } else {
          console.log(`  [dry-run] Would upsert ${points.length}`);
        }
      }
    } catch (err) {
      console.error(`  ❌ Embed failed: ${err.message}`);
    }
  }
  
  console.log(`\n══ Results ════════════════════════════`);
  console.log(`Embedded: ${embedded}/${packets.length}`);
  
  if (APPLY) {
    console.log(`Upserted: ${upserted}/${embedded}`);
    console.log(`✅ Ingested ${upserted} gRPC packets into Qdrant`);
  } else {
    console.log(`[dry-run] Ready to ingest ${embedded} packets\n`);
    console.log(`Run: node scripts/atlas/ingest-grpc-packets-to-qdrant.mjs --apply`);
  }
  
  console.log(`\nNext: Wire /api/tools/rpc-search endpoint\n`);
}

main().catch(err => {
  console.error(`\n❌ Failed: ${err.message}`);
  process.exit(1);
});
