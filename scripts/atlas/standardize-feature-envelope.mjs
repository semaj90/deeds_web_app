#!/usr/bin/env node
/**
 * Standardize Feature Envelope JSONB in atlas_packets
 *
 * Phase 1a: Feature Envelope Standardization (P1 Execution)
 *
 * Purpose: Normalize payload JSONB structure across all 17,995 packets.
 * Ensures feature envelope is enriched with all canonical fields for ACE/KAG consumption.
 *
 * Canonical envelope shape:
 *   {
 *     id, file, hash, path, mtime, features[],
 *     domain_id, indexed_at, schema_gap,
 *     topFeature, domain_class, reward_count, reward_score,
 *     feature_label, ontology_tags, reward_source,
 *     directory_path, summary_source, reward_hit_count,
 *     domain_confidence, concept_resolution,
 *     packet_key, source_ref, feature_id
 *   }
 *
 * Execution:
 *   npm run atlas:feature-envelope:all:dry -- --story-id=ATLAS-P1-001 --limit=100
 *   npm run atlas:feature-envelope:all:apply -- --story-id=ATLAS-P1-001 --limit=500
 */

const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const STORY_ID = process.argv.find(a => a.startsWith('--story-id='))?.split('=')[1] || `ATLAS-P1-${Date.now()}`;
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '500');
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '25');
const RESUME = process.argv.includes('--resume');
const AFTER_PACKET_ID = process.argv.find(a => a.startsWith('--after-packet-id='))?.split('=')[1] || null;
const PAGINATION_KEY = 'atlas_feature_envelope_progress'; // Key in atlas_story_proofs for pagination checkpoint

// Canonical field names — matches checklist definition
const CANONICAL_FIELDS = [
  'id', 'file', 'hash', 'path', 'mtime', 'features',
  'domain_id', 'indexed_at', 'schema_gap',
  'topFeature', 'domain_class', 'reward_count', 'reward_score',
  'feature_label', 'ontology_tags', 'reward_source',
  'directory_path', 'summary_source', 'reward_hit_count',
  'domain_confidence', 'concept_resolution',
  'packet_key', 'source_ref', 'feature_id'
];

// Default enrichment strategy — fill missing fields with reasonable defaults
function enrichPayload(row) {
  const payload = row.payload || {};
  const enriched = { ...payload };

  // Ensure canonical fields exist (nullable fields may be null, but key must exist)
  if (!enriched.hasOwnProperty('id')) enriched.id = row.packet_key || null;
  if (!enriched.hasOwnProperty('file')) enriched.file = row.file_path || null;
  if (!enriched.hasOwnProperty('hash')) enriched.hash = null;
  if (!enriched.hasOwnProperty('path')) enriched.path = row.source_ref || null;
  if (!enriched.hasOwnProperty('mtime')) enriched.mtime = null;
  if (!enriched.hasOwnProperty('features')) enriched.features = [];

  if (!enriched.hasOwnProperty('domain_id')) enriched.domain_id = null;
  if (!enriched.hasOwnProperty('indexed_at')) enriched.indexed_at = new Date().toISOString();
  if (!enriched.hasOwnProperty('schema_gap')) enriched.schema_gap = null;

  if (!enriched.hasOwnProperty('topFeature')) enriched.topFeature = row.feature_id || null;
  if (!enriched.hasOwnProperty('domain_class')) enriched.domain_class = null;
  if (!enriched.hasOwnProperty('reward_count')) enriched.reward_count = 0;
  if (!enriched.hasOwnProperty('reward_score')) enriched.reward_score = 0.0;

  if (!enriched.hasOwnProperty('feature_label')) {
    enriched.feature_label = labelFromFeatureId(row.feature_id);
  }
  if (!enriched.hasOwnProperty('ontology_tags')) enriched.ontology_tags = [];
  if (!enriched.hasOwnProperty('reward_source')) enriched.reward_source = null;

  if (!enriched.hasOwnProperty('directory_path')) enriched.directory_path = row.directory_path || null;
  if (!enriched.hasOwnProperty('summary_source')) enriched.summary_source = null;
  if (!enriched.hasOwnProperty('reward_hit_count')) enriched.reward_hit_count = 0;

  if (!enriched.hasOwnProperty('domain_confidence')) enriched.domain_confidence = null;
  if (!enriched.hasOwnProperty('concept_resolution')) enriched.concept_resolution = null;

  // Canonical identity fields (always populated from row)
  enriched.packet_key = row.packet_key;
  enriched.source_ref = row.source_ref;
  enriched.feature_id = row.feature_id;

  return enriched;
}

function labelFromFeatureId(fid) {
  if (!fid) return null;
  // Convert snake_case → Title Case
  return fid
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

async function standardize() {
  const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

  try {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 5000
    });

    try {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║         Feature Envelope Standardization (Phase 1a)            ║
╚════════════════════════════════════════════════════════════════╝

Story ID: ${STORY_ID}
Mode:     ${DRY_RUN ? 'DRY-RUN' : APPLY ? 'APPLY' : 'AUDIT'}
Limit:    ${LIMIT} packets per run
Batch:    ${BATCH_SIZE} packets per transaction
Resume:   ${RESUME ? 'YES' : 'NO'}
Cursor:   ${AFTER_PACKET_ID ? `Resume after packet_id=${AFTER_PACKET_ID}` : 'From start'}

`);

      // 1. Audit: what's the current envelope coverage?
      console.log('📊 Auditing current payload coverage...\n');
      const auditRes = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN payload IS NOT NULL THEN 1 END) as has_payload,
          COUNT(CASE WHEN payload->>'feature_label' IS NOT NULL THEN 1 END) as has_feature_label,
          COUNT(CASE WHEN payload->>'packet_key' IS NOT NULL THEN 1 END) as has_packet_key,
          COUNT(CASE WHEN payload->>'ontology_tags' IS NOT NULL THEN 1 END) as has_ontology_tags,
          COUNT(CASE WHEN payload->>'directory_path' IS NOT NULL THEN 1 END) as has_directory_path
        FROM atlas_packets
      `);

      const audit = auditRes.rows[0];
      console.log(`Total packets:              ${audit.total}`);
      console.log(`  ✓ Has payload:            ${audit.has_payload} (${(audit.has_payload/audit.total*100).toFixed(1)}%)`);
      console.log(`  ✓ Has feature_label:      ${audit.has_feature_label} (${(audit.has_feature_label/audit.total*100).toFixed(1)}%)`);
      console.log(`  ✓ Has packet_key:         ${audit.has_packet_key} (${(audit.has_packet_key/audit.total*100).toFixed(1)}%)`);
      console.log(`  ✓ Has ontology_tags:      ${audit.has_ontology_tags} (${(audit.has_ontology_tags/audit.total*100).toFixed(1)}%)`);
      console.log(`  ✓ Has directory_path:     ${audit.has_directory_path} (${(audit.has_directory_path/audit.total*100).toFixed(1)}%)`);
      console.log('');

      // 2. Determine cursor position for resumable pagination
      let cursorPacketId = AFTER_PACKET_ID || null;

      if (cursorPacketId === null && RESUME) {
        // Try to load checkpoint when in APPLY mode (automatic pagination)
        const checkpointRes = await pool.query(`
          SELECT
            proof_data->>'last_packet_id' as last_packet_id,
            created_at
          FROM atlas_story_proofs
          WHERE story_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `, [PAGINATION_KEY]);

        if (checkpointRes.rows.length > 0) {
          const checkpoint = checkpointRes.rows[0];
          if (checkpoint.last_packet_id) {
            cursorPacketId = checkpoint.last_packet_id;
            if (APPLY) {
              console.log(`📍 Auto-resuming from cursor packet_id=${cursorPacketId}\n`);
            }
          }
        }
      }

      // 3. Fetch packets needing enrichment (with cursor-based pagination)
      console.log(`📥 Fetching ${LIMIT} packets${cursorPacketId ? ` (after packet_id=${cursorPacketId})` : ' (from start)'}...\n`);
      const selectRes = await pool.query(`
        SELECT
          packet_id, packet_key, source_ref, file_path, directory_path, feature_id,
          payload
        FROM atlas_packets
        WHERE packet_id IS NOT NULL
          ${cursorPacketId ? `AND packet_id::text > $2` : ''}
        ORDER BY packet_id ASC
        LIMIT $1
      `, cursorPacketId ? [LIMIT, cursorPacketId] : [LIMIT]);

      const toEnrich = selectRes.rows;
      console.log(`Found ${toEnrich.length} packets to process\n`);

      if (toEnrich.length === 0) {
        console.log('✅ All packets are complete (reached end of dataset)');
        console.log(`📊 Final offset: ${offset + LIMIT}\n`);
        return;
      }

      // 3. Enrich payloads
      const enrichedPackets = [];
      let changedCount = 0;

      for (const row of toEnrich) {
        const original = JSON.stringify(row.payload || {});
        const enriched = enrichPayload(row);
        const enrichedStr = JSON.stringify(enriched);

        if (original !== enrichedStr) {
          changedCount++;
        }

        enrichedPackets.push({
          packet_id: row.packet_id,
          original: row.payload,
          enriched,
          changed: original !== enrichedStr
        });
      }

      console.log(`Will enrich: ${changedCount} packets`);
      console.log(`Unchanged:   ${toEnrich.length - changedCount} packets\n`);

      if (VERBOSE && changedCount > 0) {
        console.log('Sample enrichments:');
        enrichedPackets.filter(p => p.changed).slice(0, 3).forEach(p => {
          console.log(`  Packet ${p.packet_id}:`);
          if (p.enriched.feature_label && (!p.original || !p.original.feature_label)) {
            console.log(`    + feature_label: "${p.enriched.feature_label}"`);
          }
          if (p.enriched.directory_path && (!p.original || !p.original.directory_path)) {
            console.log(`    + directory_path: "${p.enriched.directory_path}"`);
          }
        });
        console.log('');
      }

      // 4. If dry-run, stop here
      if (DRY_RUN) {
        console.log('✅ [DRY-RUN] Preview complete. No changes made.\n');
        return;
      }

      // 5. If not --apply, stop here
      if (!APPLY) {
        console.log('ℹ️  To apply enrichment, run with --apply flag\n');
        await pool.end();
        return;
      }

      // 6. Apply enrichment in batches
      console.log(`📝 Applying enrichment in batches of ${BATCH_SIZE}...\n`);
      const client = await pool.connect();
      let applied = 0;
      const lastProcessedPacket = toEnrich[toEnrich.length - 1];

      try {
        for (let i = 0; i < enrichedPackets.length; i += BATCH_SIZE) {
          const batch = enrichedPackets.slice(i, i + BATCH_SIZE).filter(p => p.changed);

          if (batch.length === 0) continue;

          await client.query('BEGIN');
          try {
            for (const p of batch) {
              await client.query(
                'UPDATE atlas_packets SET payload = $1 WHERE packet_id = $2',
                [JSON.stringify(p.enriched), p.packet_id]
              );
              applied++;
            }
            await client.query('COMMIT');
            console.log(`  ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} packets updated`);
          } catch (batchErr) {
            await client.query('ROLLBACK');
            throw batchErr;
          }
        }

        console.log(`\n✅ Applied enrichment to ${applied} packets\n`);

        // 7. Record story proof (audit trail + pagination checkpoint)
        console.log('📋 Recording proof in atlas_story_proofs...\n');

        const nextCursor = lastProcessedPacket?.packet_id || null;
        const proofData = JSON.stringify({
          packets_processed: toEnrich.length,
          packets_enriched: applied,
          timestamp: new Date().toISOString(),
          batch_size: BATCH_SIZE,
          last_packet_id: nextCursor,
          progress_pct: ((cursorPacketId ? cursorPacketId : 0) + toEnrich.length) / audit.total * 100
        });

        // Write to both the story_id (for narrative tracking) and PAGINATION_KEY (for checkpoint)
        await client.query(`
          INSERT INTO atlas_story_proofs (story_id, stage, action, proof_data)
          VALUES ($1, $2, $3, $4), ($5, $2, $3, $4)
          ON CONFLICT (story_id, stage, action) DO UPDATE SET proof_data = $4
        `, [
          STORY_ID,
          'feature_envelope_standardization',
          'enrich_payload',
          proofData,
          PAGINATION_KEY
        ]);

        console.log(`✅ Recorded story proof for ${STORY_ID}`);
        const progress = ((cursorPacketId ? cursorPacketId : 0) + toEnrich.length);
        console.log(`   Progress: ${progress}/${audit.total} (${(progress / audit.total * 100).toFixed(1)}%)\n`);

      } finally {
        client.release();
      }

      // 8. Re-audit to confirm
      console.log('🔍 Re-auditing coverage after enrichment...\n');
      const finalAuditRes = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN payload->>'feature_label' IS NOT NULL THEN 1 END) as has_feature_label,
          COUNT(CASE WHEN payload->>'packet_key' IS NOT NULL THEN 1 END) as has_packet_key,
          COUNT(CASE WHEN payload->>'directory_path' IS NOT NULL THEN 1 END) as has_directory_path
        FROM atlas_packets
      `);

      const finalAudit = finalAuditRes.rows[0];
      console.log(`After enrichment:`);
      console.log(`  ✓ feature_label coverage:  ${finalAudit.has_feature_label}/${finalAudit.total} (${(finalAudit.has_feature_label/finalAudit.total*100).toFixed(1)}%)`);
      console.log(`  ✓ packet_key coverage:     ${finalAudit.has_packet_key}/${finalAudit.total} (${(finalAudit.has_packet_key/finalAudit.total*100).toFixed(1)}%)`);
      console.log(`  ✓ directory_path coverage: ${finalAudit.has_directory_path}/${finalAudit.total} (${(finalAudit.has_directory_path/finalAudit.total*100).toFixed(1)}%)\n`);

      console.log(`═════════════════════════════════════════════════════════════════\n`);
      console.log(`✅ Phase 1a batch complete: ${applied} packets enriched\n`);

      const nextCursorId = lastProcessedPacket?.packet_id || null;
      console.log(`NEXT_CURSOR=${nextCursorId}`);

      // Determine next action
      if (toEnrich.length < LIMIT || nextCursorId === null) {
        console.log(`\n🎉 All ${audit.total} packets have been standardized!\n`);
        console.log(`Next: npm run atlas:feature-envelope:gan -- --story-id=${STORY_ID}\n`);
      } else {
        console.log(`\n⏳ More packets remain, use NEXT_CURSOR for next batch:\n`);
        console.log(`  npm run atlas:feature-envelope:all:apply -- --story-id=ATLAS-P1-XXX --limit=${LIMIT} --batch-size=${BATCH_SIZE} --after-packet-id=${nextCursorId}\n`);
        console.log(`(Or let pagination checkpoint auto-resume with --resume)\n`);
      }

    } finally {
      await pool.end();
    }

  } catch (err) {
    console.error('❌ Standardization failed:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  }
}

standardize();
