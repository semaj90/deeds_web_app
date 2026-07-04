import pg from 'pg';
import fs from 'fs';

const assignments = JSON.parse(fs.readFileSync('docs/reports/phase6-som-clustering.json', 'utf8')).assignments;

const pool = new pg.Pool({
  host: '127.0.0.1', port: 5434,
  user: 'legal_admin', password: '123456',
  database: 'legal_ai_db'
});

// Fetch chunk IDs in same ORDER BY id order (matching phase6 query)
const { rows } = await pool.query(`
  SELECT id FROM codebase_chunk_index
  WHERE content_embedding IS NOT NULL
  ORDER BY id
  LIMIT $1
`, [assignments.length]);

console.log(`Loaded ${rows.length} chunk IDs, ${assignments.length} assignments`);

// Build update batches using parameterized queries (UUIDs need quoting)
const BATCH = 500;
let updated = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  // Use unnest approach for UUID safety
  const ids = batch.map((r) => r.id);
  const clusterIds = batch.map((_, j) => assignments[i + j]);
  const somRows = clusterIds.map(c => Math.floor(c / 20));
  const somCols = clusterIds.map(c => c % 20);

  await pool.query(`
    UPDATE codebase_chunk_index AS c
    SET som_cluster = v.cluster_id,
        som_bmu_row = v.row,
        som_bmu_col = v.col,
        updated_at = NOW()
    FROM (SELECT unnest($1::uuid[]) AS id,
                 unnest($2::int[]) AS cluster_id,
                 unnest($3::int[]) AS row,
                 unnest($4::int[]) AS col) AS v
    WHERE c.id = v.id
  `, [ids, clusterIds, somRows, somCols]);
  updated += batch.length;
  if (updated % 5000 === 0) console.log(`  Updated ${updated}...`);
}

console.log(`✅ SOM writeback complete: ${updated} chunks updated`);
await pool.end();
