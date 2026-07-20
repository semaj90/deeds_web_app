import pg from 'pg';
import { createHash } from 'crypto';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const DRY_RUN = !process.argv.includes('--apply');

async function registerOrphanedChunks() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Register Orphaned Chunks → atlas_packets                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}\n`);

  try {
    // Find orphaned chunks
    const orphanedResult = await pool.query(`
      SELECT 
        cci.id as chunk_id,
        cci.relative_path as source_ref,
        cci.content as content,
        cci.summary as summary,
        COALESCE(cci.metadata->>'title_id', NULL) as title_id
      FROM codebase_chunk_index cci
      LEFT JOIN atlas_packets ap ON cci.relative_path = ap.source_ref
      WHERE ap.packet_key IS NULL
      ORDER BY cci.relative_path
      LIMIT 100  -- Start with 100 for testing
    `);

    const orphaned = orphanedResult.rows;
    console.log(`📦 Found ${orphaned.length} orphaned chunks (sample)\n`);

    if (orphaned.length === 0) {
      console.log('✅ No orphaned chunks found');
      await pool.end();
      return;
    }

    let created = 0;
    let skipped = 0;

    for (const chunk of orphaned) {
      // Generate packet_key deterministically
      const contentHash = createHash('sha256').update(chunk.content || '').digest('hex').slice(0, 16);
      const packetKey = `chunk:${contentHash}`;

      // Infer domain_class from source_ref
      let domainClass = 'Other';
      if (chunk.source_ref.includes('/test')) domainClass = 'test';
      else if (chunk.source_ref.includes('/ui') || chunk.source_ref.includes('/components')) domainClass = 'UI';
      else if (chunk.source_ref.includes('/server') || chunk.source_ref.includes('/api')) domainClass = 'backend';
      else if (chunk.source_ref.includes('/routes')) domainClass = 'frontend';
      else if (chunk.source_ref.includes('/gpu') || chunk.source_ref.includes('/cuda')) domainClass = 'gpu';
      else if (chunk.source_ref.includes('/db')) domainClass = 'database';

      if (DRY_RUN) {
        console.log(`  [DRY] Create packet:`);
        console.log(`    packet_key: ${packetKey}`);
        console.log(`    source_ref: ${chunk.source_ref}`);
        console.log(`    domain_class: ${domainClass}`);
        created++;
      } else {
        try {
          await pool.query(`
            INSERT INTO atlas_packets (packet_key, source_ref, domain_class, summary, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NOW(), NOW())
            ON CONFLICT (packet_key) DO NOTHING
          `, [packetKey, chunk.source_ref, domainClass, chunk.summary || '']);
          created++;
        } catch (err) {
          console.error(`  ❌ Failed for ${chunk.source_ref}: ${err.message}`);
          skipped++;
        }
      }
    }

    console.log(`\n✅ Complete:`);
    console.log(`  Created/would create: ${created}`);
    console.log(`  Skipped: ${skipped}`);

    if (!DRY_RUN) {
      console.log('\n⚠️  To register ALL orphaned chunks, run:');
      console.log('  node scripts/atlas/register-orphaned-chunks.mjs --apply --full');
    }

  } finally {
    await pool.end();
  }
}

registerOrphanedChunks().catch(console.error);
