import 'dotenv/config';
import { Pool } from 'pg';
import Redis from 'ioredis';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';

async function main() {
  console.log('Connecting to Postgres & Redis...');
  const pool = new Pool({ connectionString: DATABASE_URL });
  const redis = new Redis(REDIS_URL, {
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 1
  });
  redis.on('error', () => {});

  const ids = Array.from({ length: 20 }, (_, i) => i);
  const dim = 768;

  let builtCount = 0;
  let persistedCount = 0;

  for (const clusterId of ids) {
    try {
      console.log(`Processing cluster ${clusterId}...`);
      
      // 1. Fetch points from Qdrant
      const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: { must: [{ key: 'gpuCluster', match: { value: clusterId } }] },
          limit: 250,
          with_payload: false,
          with_vector: true
        })
      });

      if (!res.ok) {
        console.warn(`  Qdrant scroll failed for cluster ${clusterId}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const pts = data.result?.points ?? [];
      if (!pts.length) {
        console.log(`  No points found in Qdrant for cluster ${clusterId}`);
        continue;
      }

      // 2. Average vectors
      const sum = new Float32Array(dim);
      let count = 0;
      for (const pt of pts) {
        const v = Array.isArray(pt.vector) ? pt.vector : pt.vector?.content;
        if (!v || v.length !== dim) continue;
        for (let d = 0; d < dim; d++) sum[d] += v[d];
        count++;
      }

      if (count === 0) {
        console.log(`  No valid ${dim}-dim vectors found in cluster ${clusterId}`);
        continue;
      }

      for (let d = 0; d < dim; d++) sum[d] /= count;
      console.log(`  Averaged ${count} vectors for cluster ${clusterId}`);

      // 3. Get dominant topo_class/topo_byte from PostgreSQL
      const topoRes = await pool.query(
        `SELECT topo_class, topo_byte, count(*) as cnt 
         FROM embedded_summaries 
         WHERE gpu_cluster = $1 
         GROUP BY topo_class, topo_byte 
         ORDER BY cnt DESC LIMIT 1`,
        [clusterId]
      );
      const topoInfo = topoRes.rows[0] || { topo_class: 'unclassified', topo_byte: 0 };

      // 4. Save to Redis
      const centroidKey = `taxonomy:clusters:gpu:${clusterId}`;
      const centroidData = {
        vector: Array.from(sum),
        topoClass: String(topoInfo.topo_class),
        topoByte: Number(topoInfo.topo_byte)
      };
      await redis.setex(centroidKey, 6 * 3600, JSON.stringify(centroidData));
      builtCount++;

      // 5. Upsert into Postgres
      await pool.query(
        `INSERT INTO gpu_cluster_centroids (
           cluster_id, cluster_type, centroid_vec, topo_class, topo_byte, chunk_count, updated_at
         )
         VALUES ($1, 'gpu', $2, $3, $4, 0, now())
         ON CONFLICT (cluster_id) DO UPDATE SET
           centroid_vec = EXCLUDED.centroid_vec,
           cluster_type = EXCLUDED.cluster_type,
           topo_class = EXCLUDED.topo_class,
           topo_byte = EXCLUDED.topo_byte,
           updated_at = now()`,
        [clusterId, Array.from(sum), topoInfo.topo_class, topoInfo.topo_byte]
      );
      persistedCount++;
      
      console.log(`  Successfully synced cluster ${clusterId} (class: ${topoInfo.topo_class})`);
    } catch (err: any) {
      console.error(`  Error processing cluster ${clusterId}:`, err.message);
    }
  }

  console.log(`\nSync finished. Built: ${builtCount}, Persisted: ${persistedCount}`);

  await pool.end();
  await redis.quit();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
