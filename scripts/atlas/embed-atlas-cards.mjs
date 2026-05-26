import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { QdrantClient } from '@qdrant/js-client-rest';

dotenv.config({ path: path.resolve(process.cwd(), 'sveltekit-frontend/.env') });

const dbUrl = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });

const qdrantUrl = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const qdrant = new QdrantClient({ url: qdrantUrl });

async function embed(text) {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const res = await fetch(`${ollamaUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'embeddinggemma:latest',
      prompt: text
    })
  });
  if (!res.ok) {
    throw new Error(`Embedding failed: ${res.statusText}`);
  }
  const json = await res.json();
  return json.embedding;
}

function clusterFailures(cards) {
  // Simple clustering fallback logic (group by primary pattern length or shared words)
  const clusters = {};
  for (const card of cards) {
    const patterns = card.patterns || [];
    if (patterns.length === 0) continue;
    // Basic heuristic: take the first 3 words of the first pattern as a cluster key
    const key = patterns[0].split(' ').slice(0, 3).join(' ').toLowerCase();
    if (!clusters[key]) clusters[key] = [];
    clusters[key].push(card);
  }
  return clusters;
}

async function run() {
  const { rows } = await pool.query(`SELECT * FROM atlas_cards WHERE type = 'log_summary'`);
  console.log(`Found ${rows.length} atlas cards to embed.`);

  const parsedCards = rows.map(r => r.data);

  for (const card of parsedCards) {
    const text = `
Patterns:
${card.patterns?.join("\n")}

Modules:
${card.modules?.join(",")}
`;
    try {
      // Determine pseudo-cluster key for tagging
      const patterns = card.patterns || [];
      const cluster_tag = patterns.length > 0 ? patterns[0].split(' ').slice(0, 3).join('_').toLowerCase() : 'unknown_cluster';
      
      const enrichedPayload = { 
        ...card, 
        cluster_tag,
        topo_class: card.modules ? card.modules[0] : 'core_system'
      };

      const embedding = await embed(text);
      await qdrant.upsert('documents_atlas', {
        wait: true,
        points: [{
          id: Buffer.from(card.file).toString('hex').slice(0, 32).padEnd(32, '0').slice(0, 32),
          vector: embedding,
          payload: enrichedPayload
        }]
      }).catch((err) => {
        return qdrant.upsert('documents_atlas', {
          wait: true,
          points: [{
            id: crypto.randomUUID(),
            vector: embedding,
            payload: { ...enrichedPayload, original_file: card.file }
          }]
        });
      });
      console.log(`Embedded ${card.file} (cluster: ${cluster_tag})`);
    } catch (e) {
      console.error(`Failed to embed ${card.file}:`, e.message);
    }
  }

  const clusters = clusterFailures(parsedCards);
  const clusterPath = path.resolve(process.cwd(), 'memory/clusters/failure-clusters.json');
  fs.mkdirSync(path.dirname(clusterPath), { recursive: true });
  fs.writeFileSync(clusterPath, JSON.stringify(clusters, null, 2), 'utf-8');
  console.log(`Saved clusters to ${clusterPath}`);

  await pool.end();
}

run().catch(console.error);
