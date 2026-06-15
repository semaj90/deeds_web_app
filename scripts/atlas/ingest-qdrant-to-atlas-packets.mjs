#!/usr/bin/env node
/**
 * ingest-qdrant-to-atlas-packets.mjs
 *
 * Phase 3I: Ingest canonical packets from Qdrant codebase_chunks_768
 * into atlas_packets table with proper source_ref, feature_id, concept_ids.
 *
 * This replaces the SOM-export .tmp/ artifact rows with real code-indexed packets.
 *
 * Usage:
 *   node scripts/atlas/ingest-qdrant-to-atlas-packets.mjs
 *   node scripts/atlas/ingest-qdrant-to-atlas-packets.mjs --dry-run
 *   node scripts/atlas/ingest-qdrant-to-atlas-packets.mjs --limit=500
 *   node scripts/atlas/ingest-qdrant-to-atlas-packets.mjs --clear-artifacts   (remove .tmp/ rows first)
 *   node scripts/atlas/ingest-qdrant-to-atlas-packets.mjs --offset=1000       (resume from offset)
 */

import pg from 'pg';
import { createHash } from 'node:crypto';
import { normalizeSourceRef } from '../lib/canonical-source-ref.mjs';

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const SCROLL_BATCH = 100;

const DRY_RUN = process.argv.includes('--dry-run');
const CLEAR_ARTIFACTS = process.argv.includes('--clear-artifacts');
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 0;
const OFFSET_ARG = process.argv.find((a) => a.startsWith('--offset='));
const START_OFFSET = OFFSET_ARG ? parseInt(OFFSET_ARG.split('=')[1], 10) : null;

function buildPacketKey(sourceRef, content_hash) {
  const ref = normalizeSourceRef(sourceRef) || sourceRef || '';
  const hash = content_hash || createHash('sha256').update(ref).digest('hex').slice(0, 16);
  return `${ref}:${hash.slice(0, 16)}`;
}

async function scrollQdrant(offsetId) {
  const body = {
    limit: SCROLL_BATCH,
    with_payload: true,
    with_vector: ['content'],
    ...(offsetId != null ? { offset: offsetId } : {}),
  };

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Qdrant scroll failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return {
    points: data.result?.points ?? [],
    next: data.result?.next_page_offset ?? null,
  };
}

async function upsertBatch(pool, rows) {
  if (rows.length === 0) return;

  const values = rows.map((r, i) => {
    const base = i * 12;
    return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12})`;
  }).join(',');

  const params = rows.flatMap((r) => [
    r.packet_id,
    r.packet_key,
    r.artifact_id,
    r.source_ref,
    r.source_path,
    r.source_kind,
    r.feature_id,
    r.summary,
    r.sha256,
    JSON.stringify(r.payload),
    r.embedding ? `[${r.embedding.join(',')}]` : null,
    r.concept_ids,
  ]);

  await pool.query(
    `INSERT INTO atlas_packets
       (packet_id, packet_key, artifact_id, source_ref, source_path, source_kind, feature_id,
        summary, sha256, payload, embedding, concept_ids, updated_at)
     VALUES ${values.replace(/\$(\d+),\$(\d+),\$(\d+),\$(\d+),\$(\d+),\$(\d+),\$(\d+),\$(\d+),\$(\d+),\$(\d+),\$(\d+),\$(\d+)/g, (_, ...n) => n.map(x=>`$${x}`).join(','))}
     ON CONFLICT (packet_id) DO UPDATE SET
       packet_key = EXCLUDED.packet_key,
       source_ref = EXCLUDED.source_ref,
       source_path = EXCLUDED.source_path,
       source_kind = EXCLUDED.source_kind,
       feature_id = EXCLUDED.feature_id,
       summary = EXCLUDED.summary,
       sha256 = EXCLUDED.sha256,
       payload = EXCLUDED.payload,
       embedding = EXCLUDED.embedding,
       concept_ids = EXCLUDED.concept_ids,
       updated_at = now()`,
    params
  );
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log('\n📦 Atlas Packets — Ingest from Qdrant codebase_chunks_768 (Phase 3I)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Check columns
    const colRes = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'atlas_packets'
    `);
    const cols = new Set(colRes.rows.map((r) => r.column_name));

    if (!cols.has('packet_key') || !cols.has('source_kind')) {
      console.error('❌ Missing columns — run add-atlas-packets-columns.mjs first');
      process.exit(1);
    }

    // Optionally clear artifact rows
    if (CLEAR_ARTIFACTS && !DRY_RUN) {
      const { rowCount } = await pool.query(`
        DELETE FROM atlas_packets
        WHERE source_ref LIKE '.tmp/%' OR source_ref LIKE '%parent_atlas_packets%'
      `);
      console.log(`  ♻️  Cleared ${rowCount} artifact rows\n`);
    }

    // Get existing packet_ids to avoid duplicates
    const existingRes = await pool.query(`SELECT packet_id FROM atlas_packets`);
    const existing = new Set(existingRes.rows.map((r) => r.packet_id));
    console.log(`  Existing atlas_packets: ${existing.size}`);

    let offset = START_OFFSET;
    let total = 0;
    let inserted = 0;
    let skipped = 0;
    let noSourceRef = 0;

    console.log(`  Scrolling ${COLLECTION}...\n`);

    while (true) {
      const { points, next } = await scrollQdrant(offset);

      if (points.length === 0) break;

      const rows = [];

      for (const point of points) {
        const payload = point.payload ?? {};
        const rawSourceRef =
          payload.file_path || payload.sourceRef || payload.source_ref || payload.path || '';

        const cleanSourceRef = rawSourceRef.split('#')[0]; // strip #chunk-N fragment
        const canonRef = normalizeSourceRef(cleanSourceRef);

        if (!canonRef) {
          noSourceRef++;
          continue;
        }

        const contentHash = payload.content_hash || payload.chunk_id?.split(':').pop() || '';
        const packetId = contentHash || createHash('sha256').update(`${canonRef}:${point.id}`).digest('hex').slice(0, 16);

        if (existing.has(packetId) && !CLEAR_ARTIFACTS) {
          skipped++;
          continue;
        }

        const featureId = payload.feature_id || payload.feature_label || payload.area || '';
        const summary = payload.content
          ? String(payload.content).slice(0, 500)
          : payload.summary || '';
        const sha256 = createHash('sha256')
          .update(payload.content || canonRef)
          .digest('hex');

        const strippedPayload = { ...payload };
        delete strippedPayload.content; // content goes into summary field

        // Extract concept_ids from tags
        const tags = Array.isArray(payload.tags) ? payload.tags : [];
        const conceptIds = tags.filter((t) => typeof t === 'string' && t.length > 2);

        rows.push({
          packet_id: packetId,
          packet_key: buildPacketKey(canonRef, contentHash),
          artifact_id: String(point.id),
          source_ref: canonRef,
          source_path: cleanSourceRef,
          source_kind: 'graphify',
          feature_id: featureId || null,
          summary: summary || null,
          sha256,
          payload: strippedPayload,
          embedding: Array.isArray(point.vector?.content) ? point.vector.content : null,
          concept_ids: conceptIds.length > 0 ? conceptIds : [],
        });
      }

      if (rows.length > 0) {
        if (!DRY_RUN) {
          // Upsert in sub-batches of 20
          for (let i = 0; i < rows.length; i += 20) {
            const sub = rows.slice(i, i + 20);
            const cols_list = ['packet_id','packet_key','artifact_id','source_ref','source_path','source_kind','feature_id','summary','sha256','payload','embedding','concept_ids'];
            const values = sub.map((r, ri) => `(${cols_list.map((_,ci) => `$${ri*cols_list.length+ci+1}`).join(',')})`).join(',');
            const params = sub.flatMap((r) => [
              r.packet_id, r.packet_key, r.artifact_id, r.source_ref, r.source_path, r.source_kind,
              r.feature_id, r.summary, r.sha256, JSON.stringify(r.payload),
              r.embedding ? `[${r.embedding.join(',')}]` : null,
              r.concept_ids,
            ]);
            await pool.query(
              `INSERT INTO atlas_packets (${cols_list.join(',')}, updated_at)
               SELECT ${cols_list.map((_,i)=>`$${i+1}`).join(',')}, now()
               FROM (VALUES ${values}) AS t(${cols_list.join(',')})
               ON CONFLICT (packet_id) DO UPDATE SET
                 packet_key=EXCLUDED.packet_key, source_ref=EXCLUDED.source_ref,
                 source_path=EXCLUDED.source_path, source_kind=EXCLUDED.source_kind,
                 feature_id=EXCLUDED.feature_id, summary=EXCLUDED.summary,
                 sha256=EXCLUDED.sha256, payload=EXCLUDED.payload,
                 embedding=EXCLUDED.embedding, concept_ids=EXCLUDED.concept_ids,
                 updated_at=now()`.replace(
                /SELECT \$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,\$9,\$10,\$11,\$12, now\(\)\s+FROM \(VALUES \(.*?\)\) AS t\(.*?\)/s,
                // rebuild the per-row SELECT
                `SELECT ${cols_list.map((_,i)=>`val.c${i+1}`).join(',')}, now() FROM (VALUES ${values}) AS val(${cols_list.map((_,i)=>`c${i+1}`).join(',')})`
              ),
              params
            ).catch(async () => {
              // Fallback: insert one-by-one
              for (const row of sub) {
                try {
                  await pool.query(
                    `INSERT INTO atlas_packets (packet_id,packet_key,artifact_id,source_ref,source_path,source_kind,feature_id,summary,sha256,payload,embedding,concept_ids,updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::vector,$12,now())
                     ON CONFLICT (packet_id) DO UPDATE SET
                       source_ref=EXCLUDED.source_ref, source_kind=EXCLUDED.source_kind,
                       feature_id=EXCLUDED.feature_id, summary=EXCLUDED.summary,
                       payload=EXCLUDED.payload, embedding=EXCLUDED.embedding,
                       concept_ids=EXCLUDED.concept_ids, updated_at=now()`,
                    [row.packet_id,row.packet_key,row.artifact_id,row.source_ref,row.source_path,
                     row.source_kind,row.feature_id,row.summary,row.sha256,JSON.stringify(row.payload),
                     row.embedding?`[${row.embedding.join(',')}]`:null,row.concept_ids]
                  );
                } catch { /* skip */ }
              }
            });
            inserted += sub.length;
          }
        } else {
          inserted += rows.length;
          if (inserted <= 10) {
            for (const r of rows) {
              console.log(`  [dry] ${r.packet_id.slice(0,8)}... ${r.source_ref} (${r.feature_id})`);
            }
          }
        }
      }

      total += points.length;
      process.stdout.write(`\r  Processed: ${total} points | inserted: ${inserted} | skipped: ${skipped} | no-ref: ${noSourceRef}`);

      if (!next || (LIMIT > 0 && inserted >= LIMIT)) break;
      offset = next;
    }

    console.log(`\n\n  Final:`);
    console.log(`    Qdrant points scanned: ${total}`);
    console.log(`    Inserted/updated:      ${inserted}`);
    console.log(`    Skipped (existed):     ${skipped}`);
    console.log(`    No source_ref:         ${noSourceRef}`);

    if (!DRY_RUN) {
      console.log('\n  Next: node scripts/atlas/verify-atlas-packets.mjs\n');
    } else {
      console.log('\n  [dry-run] No changes made. Remove --dry-run to apply.\n');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Ingest failed:', err.message);
  process.exit(1);
});
