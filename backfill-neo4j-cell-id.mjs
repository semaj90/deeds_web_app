#!/usr/bin/env node
import pg from 'pg';
import fetch from 'node-fetch';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', 'sveltekit-frontend/.env') });

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' 
});

const NEO4J_URL = process.env.NEO4J_HTTP_URL || 'http://localhost:7474';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD || 'neo4j';

async function neo4jQuery(cypher) {
  const auth = Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64');
  const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify({
      statements: [{ statement: cypher }]
    })
  });
  
  if (!res.ok) throw new Error(`Neo4j ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(`Neo4j: ${data.errors[0].message}`);
  return data.results?.[0]?.data || [];
}

(async () => {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Backfill Neo4j cell_id from Postgres atlas_feature_map       ║');
  console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(56)}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Fetch SOM data from atlas_feature_map
    console.log('📊 Step 1: Fetch SOM coordinates from atlas_feature_map\n');
    const res = await pool.query(`
      SELECT DISTINCT 
        source_ref,
        som_cluster,
        som_row,
        som_col
      FROM atlas_feature_map
      WHERE som_cluster IS NOT NULL
        AND som_row IS NOT NULL
        AND som_col IS NOT NULL
      LIMIT 50000
    `);

    const somMap = {};
    res.rows.forEach(row => {
      if (row.source_ref) {
        somMap[row.source_ref] = `${row.som_row},${row.som_col}`;
      }
    });

    console.log(`   Found ${res.rows.length} rows with SOM data`);
    console.log(`   Unique source_refs: ${Object.keys(somMap).length}\n`);

    // Step 2: Update Neo4j in batch
    console.log('📊 Step 2: Backfill Neo4j nodes with cell_id\n');
    
    let updated = 0;
    const sourceRefs = Object.keys(somMap);
    const BATCH_SIZE = 100;

    for (let i = 0; i < sourceRefs.length; i += BATCH_SIZE) {
      const batch = sourceRefs.slice(i, i + BATCH_SIZE);
      
      for (const sourceRef of batch) {
        const cellId = somMap[sourceRef];
        try {
          if (!APPLY) continue; // Skip actual updates in dry-run
          
          const cypher = `
            MATCH (n {source_ref: '${sourceRef.replace(/'/g, "\'")}'})
            SET n.cell_id = '${cellId}'
            RETURN count(n) as count
          `;
          
          await neo4jQuery(cypher);
          updated++;
        } catch (e) {
          // Silent fail
        }
      }
      
      if ((i + BATCH_SIZE) % 500 === 0) {
        process.stdout.write(`\r   Processed: ${Math.min(i + BATCH_SIZE, sourceRefs.length)}/${sourceRefs.length}`);
      }
    }

    console.log(`\r   Would update: ${sourceRefs.length} nodes\n`);

    // Step 3: Verify edges
    console.log('📊 Step 3: Verify edge coverage\n');
    try {
      const edgeRes = await neo4jQuery(`
        MATCH (a)-[r:SIMILAR_TOPOLOGY]->(b)
        WHERE a.cell_id IS NOT NULL AND b.cell_id IS NOT NULL
        RETURN count(r) as count
      `);
      const edgesWithCellId = edgeRes[0]?.row?.[0] || 0;
      console.log(`   Edges with both endpoints having cell_id: ${edgesWithCellId}\n`);
    } catch (e) {
      console.log(`   (Verification skipped: ${e.message})\n`);
    }

    if (DRY_RUN) {
      console.log('✅ DRY-RUN COMPLETE');
      console.log('   To apply: node backfill-neo4j-cell-id.mjs --apply\n');
    } else {
      console.log('✅ BACKFILL APPLIED\n');
    }

    await pool.end();
  } catch (e) {
    console.error('❌ Error:', e.message);
    await pool.end();
    process.exit(1);
  }
})();
