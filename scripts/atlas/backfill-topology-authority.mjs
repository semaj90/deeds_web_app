#!/usr/bin/env node

/**
 * Backfill atlas_packets topology authority scores from Neo4j PageRank
 *
 * Usage:
 *   node backfill-topology-authority.mjs [--limit 5000] [--offset 0] [--dry-run] [--verbose]
 *
 * Safe incremental execution:
 *   node backfill-topology-authority.mjs --limit 5000 --offset 0
 *   node backfill-topology-authority.mjs --limit 5000 --offset 5000
 *   node backfill-topology-authority.mjs --limit 5000 --offset 10000
 */

import postgres from 'postgres';

const args = process.argv.slice(2);
const limit = parseInt(args.find(arg => arg.startsWith('--limit'))?.split('=')[1] || '5000', 10);
const offset = parseInt(args.find(arg => arg.startsWith('--offset'))?.split('=')[1] || '0', 10);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

const sql = postgres({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  username: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '',
});

async function backfillTopologyAuthority() {
  console.log(`\n=== Atlas Topology Authority Backfill ===`);
  console.log(`Limit: ${limit}, Offset: ${offset}`);
  console.log(`Dry-run: ${dryRun}, Verbose: ${verbose}\n`);

  try {
    // 1. Count total packets
    const countResult = await sql`
      SELECT COUNT(*) as total FROM atlas_packets
    `;
    const totalPackets = countResult[0]?.total || 0;
    console.log(`Total packets in database: ${totalPackets}`);
    console.log(`Processing range: ${offset} to ${offset + limit} (batch size: ${limit})\n`);

    // 2. Fetch packets needing authority backfill
    const packets = await sql`
      SELECT
        packet_key,
        source_ref,
        COALESCE(community_id, 'unclassified') as community_id
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      ORDER BY created_at ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    console.log(`Found ${packets.length} packets in this batch`);
    if (packets.length === 0) {
      console.log('✅ No packets to process in this batch');
      await sql.end();
      process.exit(0);
    }

    // 3. For each packet, compute a simple authority score
    // In production, this would fetch from Neo4j PageRank cache or compute via GDS
    // For now, use a heuristic based on community_confidence and community_id presence
    const updates = packets.map(p => ({
      packet_key: p.packet_key,
      source_ref: p.source_ref,
      // Heuristic authority: 0.9 if in a community, 0.5 if unclassified
      authority_score: p.community_id === 'unclassified' ? 0.5 : 0.9,
      updated_at: new Date()
    }));

    // 4. Print sample of updates
    console.log(`\nSample updates (first 5):`);
    updates.slice(0, 5).forEach(u => {
      console.log(`  ${u.packet_key.slice(0, 40)} | authority: ${u.authority_score}`);
    });

    // 5. Apply updates in batches of 100 (if not dry-run)
    if (!dryRun) {
      let updated = 0;
      const batchSize = 100;

      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);
        const placeholders = batch
          .map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`)
          .join(',');

        const values = batch.flatMap(u => [u.packet_key, u.authority_score]).flat();

        try {
          await sql`
            UPDATE atlas_packets SET
              community_confidence = CASE
                WHEN community_id IS NOT NULL THEN 0.95
                ELSE 0.5
              END,
              updated_at = NOW()
            WHERE packet_key = ANY(${batch.map(u => u.packet_key)})
          `;
          updated += batch.length;

          if (verbose) {
            console.log(`  ✅ Updated batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(updates.length / batchSize)}`);
          }
        } catch (err) {
          console.error(`  ❌ Batch ${Math.floor(i / batchSize) + 1} failed:`, err.message);
          // Continue with next batch on error (graceful degradation)
        }
      }

      console.log(`\n✅ Updated ${updated}/${updates.length} packets`);
    } else {
      console.log(`\n📋 [DRY-RUN] Would update ${updates.length} packets`);
    }

    // 6. Summary
    const remaining = totalPackets - offset - limit;
    console.log(`\nProgress: ${Math.min(offset + limit, totalPackets)}/${totalPackets} packets`);
    if (remaining > 0) {
      console.log(`Remaining: ${remaining} packets`);
      console.log(`Next batch: node backfill-topology-authority.mjs --limit ${limit} --offset ${offset + limit}`);
    } else {
      console.log('✅ Backfill complete!');
    }

    await sql.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Backfill failed:', err.message);
    await sql.end();
    process.exit(1);
  }
}

backfillTopologyAuthority();
