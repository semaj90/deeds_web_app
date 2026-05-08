/**
 * sync-manifold4-neo4j.mjs
 *
 * Reads manifold4 coordinates from tensor_analysis_cache (Postgres) and
 * writes File.manifold4X/Y/Z/W properties to Neo4j via UNWIND batch.
 *
 * Also creates HAS_TOPO_CLASS edges:
 *   (:File {stableKey})-[:HAS_TOPO_CLASS]->(:TopologyClass {hex})
 *
 * Usage:
 *   node scripts/sync-manifold4-neo4j.mjs
 *   node scripts/sync-manifold4-neo4j.mjs --dry-run
 *   node scripts/sync-manifold4-neo4j.mjs --dry-run --limit=500
 */
import pg      from 'pg';
import neo4j   from 'neo4j-driver';
import dotenv  from 'dotenv';
dotenv.config();

const DRY_RUN   = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit'));
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1] ?? '10000') : 10_000;
const BATCH     = 500;

const DB_URL       = process.env.DATABASE_URL  ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URL    = process.env.NEO4J_URI     ?? 'bolt://127.0.0.1:7687';
const NEO4J_USER   = process.env.NEO4J_USER    ?? 'neo4j';
const NEO4J_PASS   = process.env.NEO4J_PASSWORD ?? 'neo4j_password';

async function main() {
  console.log(`🔗 Sync manifold4 → Neo4j${DRY_RUN ? ' [DRY RUN]' : ''} (limit ${LIMIT})`);

  const pool   = new pg.Pool({ connectionString: DB_URL });
  const driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));

  // Verify Neo4j connection
  try {
    await driver.verifyConnectivity();
    console.log('  Neo4j: connected');
  } catch (err) {
    console.error('  ✗ Neo4j connection failed:', err.message);
    await pool.end();
    process.exit(1);
  }

  // Load tensor_analysis_cache
  const { rows } = await pool.query(
    `SELECT stable_key, topo_byte, topo_hex, topo_class,
            manifold4_x, manifold4_y, manifold4_z, manifold4_w
     FROM tensor_analysis_cache
     ORDER BY updated_at DESC
     LIMIT $1`,
    [LIMIT]
  ).catch(() => ({ rows: [] }));

  if (!rows.length) {
    console.log('  ⚠ No rows in tensor_analysis_cache — run npm run tensor:topology first');
    await pool.end();
    await driver.close();
    return;
  }
  console.log(`  Loaded ${rows.length} cache entries`);

  let synced = 0;

  if (!DRY_RUN) {
    // APOC check
    const statusSession = driver.session();
    let apocAvailable = false;
    try {
      const r = await statusSession.run(`RETURN apoc.version() AS v`);
      if (r.records[0]?.get('v')) apocAvailable = true;
    } catch { /* apoc not installed */ } finally {
      await statusSession.close();
    }
    console.log(`  APOC: ${apocAvailable ? 'available (UNWIND batch)' : 'unavailable (serial fallback)'}`);

    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const session = driver.session({ database: 'neo4j' });
      try {
        if (apocAvailable) {
          await session.run(`
            UNWIND $rows AS row
            MATCH (f {stableKey: row.sk})
            SET f.manifold4X = row.x, f.manifold4Y = row.y, f.manifold4Z = row.z, f.manifold4W = row.w
            WITH f, row
            MERGE (tc:TopologyClass {hex: row.hex})
              SET tc.label = row.label
            MERGE (f)-[:HAS_TOPO_CLASS]->(tc)
          `, {
            rows: slice.map(r => ({
              sk:    r.stable_key,
              x:     r.manifold4_x,
              y:     r.manifold4_y,
              z:     r.manifold4_z,
              w:     r.manifold4_w,
              hex:   r.topo_hex,
              label: r.topo_class,
            })),
          });
          synced += slice.length;
        } else {
          for (const r of slice) {
            try {
              await session.run(
                `MATCH (f {stableKey: $sk})
                 SET f.manifold4X=$x, f.manifold4Y=$y, f.manifold4Z=$z, f.manifold4W=$w
                 WITH f
                 MERGE (tc:TopologyClass {hex: $hex}) SET tc.label=$label
                 MERGE (f)-[:HAS_TOPO_CLASS]->(tc)`,
                { sk: r.stable_key, x: r.manifold4_x, y: r.manifold4_y, z: r.manifold4_z, w: r.manifold4_w,
                  hex: r.topo_hex, label: r.topo_class }
              );
              synced++;
            } catch { /* skip individual node */ }
          }
        }
      } catch (err) {
        console.warn(`  ⚠ batch ${i}-${i+slice.length} failed:`, err.message);
      } finally {
        await session.close();
      }
      process.stdout.write(`\r  Synced: ${synced}/${rows.length}    `);
    }
  } else {
    synced = rows.length;
    console.log(`  Would sync ${rows.length} nodes (dry — no Neo4j writes)`);
  }

  console.log(`\n\n✅ Done — synced ${synced} File nodes${DRY_RUN ? ' (dry)' : ''}`);
  await pool.end();
  await driver.close();
}

main().catch(err => { console.error('\n❌ Sync failed:', err); process.exit(1); });
