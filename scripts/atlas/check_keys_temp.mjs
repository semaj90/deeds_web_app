import pg from 'pg';
import { createRequire } from 'module';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { loadAtlasEnv } from './load-atlas-env.mjs';

loadAtlasEnv(resolve('.'));

const require = createRequire(import.meta.url);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const index = require('../../models/autoencoder/autoencoder_latent_index.json');
  const entries = Object.entries(index.candidates).slice(0, 100);
  console.log(`Checking ${entries.length} entries against Postgres...`);
  
  let matched = 0;
  let skipped = 0;
  let skippedKinds = {};
  let skippedNonDir = 0;
  
  for (const [id, cands] of entries) {
    const finalCands = [...cands];
    for (const c of cands) {
      if (!c.startsWith('sveltekit-frontend/')) {
        finalCands.push('sveltekit-frontend/' + c);
      }
    }
    
    // Check if there is a match with the existing query
    const res = await pool.query(
      `SELECT packet_key, source_ref, qdrant_point_id 
       FROM atlas_packets 
       WHERE qdrant_point_id = ANY($1)
          OR packet_key = ANY($1)
          OR source_ref = ANY($1)
          OR payload->>'qdrant_point_id' = ANY($1)
          OR metadata->>'qdrant_point_id' = ANY($1)`,
      [finalCands]
    );
    
    if (res.rowCount > 0) {
      matched++;
    } else {
      skipped++;
      
      // Fetch from Qdrant to see payload
      try {
        const qdRes = await fetch(`http://127.0.0.1:6333/collections/codebase_chunks_768/points`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [isNaN(id) ? id : parseInt(id, 10)], with_payload: true })
        });
        const qdJson = await qdRes.json();
        const pt = qdJson.result?.[0];
        const kind = pt?.payload?.kind || 'unknown';
        skippedKinds[kind] = (skippedKinds[kind] || 0) + 1;
        
        if (kind !== 'directory-cluster' && skippedNonDir <= 10) {
          skippedNonDir++;
          console.log(`\n❌ Non-directory skipped point: ID ${id}, kind=${kind}`);
          console.log(`   Candidates:`, finalCands);
          console.log(`   Payload keys:`, Object.keys(pt?.payload || {}));
        }
      } catch (err) {
        console.log(`   Failed to fetch Qdrant payload for ${id}: ${err.message}`);
      }
    }
  }
  
  console.log(`\nSummary: Matched ${matched}, Skipped ${skipped} (out of ${entries.length})`);
  console.log('Skipped points by kind:', skippedKinds);
  await pool.end();
}

check().catch(console.error);
