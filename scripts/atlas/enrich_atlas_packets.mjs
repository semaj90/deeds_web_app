#!/usr/bin/env node
/**
 * enrich_atlas_packets.mjs
 *
 * Rebuilds the atlas_packets table with canonical lineage and full metadata:
 * 1. Reads distinct parent_atlas_records joined with parent_atlas_vectors.
 * 2. Normalizes source_refs using canonicalPath.
 * 3. Maps feature_id, community_id, and cluster_id using atlas_feature_map in-memory lookup.
 * 4. Maps concept_ids using concept_records in-memory lookup.
 * 5. Generates packet_key and source_kind.
 * 6. Truncates atlas_packets and bulk inserts the canonical packets (~2,100 rows).
 *
 * Usage:
 *   node scripts/atlas/enrich_atlas_packets.mjs --dry-run
 *   node scripts/atlas/enrich_atlas_packets.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { normalizeSourceRef } from '../lib/canonical-source-ref.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, '.env'),
  ]) {
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  return env;
}

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL
  ?? `postgresql://${env.DB_USER ?? 'legal_admin'}:${env.DB_PASSWORD ?? '123456'}@${env.DB_HOST ?? '127.0.0.1'}:${env.DB_PORT ?? '5434'}/${env.DB_NAME ?? 'legal_ai_db'}`;

function canonicalPath(input) {
  if (!input || typeof input !== 'string') return '';
  
  let s = input
    .replace(/\\/g, '/')
    .replace(/^file:\/+/i, '')
    .replace(/^\/?c:\//i, '')
    .replace(/^Users\/james\/Videos\/deeds-web-app\//i, '')
    .replace(/^deeds-web-app\//i, '')
    .replace(/^\.?\//, '');
    
  // Resolve relative segment traversals if present
  if (s.includes('..') || s.startsWith('.')) {
    try {
      const abs = path.resolve(ROOT, s);
      s = path.relative(ROOT, abs).replace(/\\/g, '/');
    } catch (e) {
      // Fallback
    }
  }

  if (s.startsWith('src/')) {
    s = 'sveltekit-frontend/' + s;
  }
  return s.toLowerCase();
}

function inferSourceKind(sourceRef, payload) {
  if (!sourceRef) return 'unknown';
  const s = sourceRef.toLowerCase();
  if (s.includes('neschrom97') || payload?.kind === 'neschrom97') return 'neschrom97';
  if (s.includes('chr97') || payload?.kind === 'chr97') return 'chr97';
  if (s.startsWith('scripts/')) return 'graphify';
  if (s.startsWith('sveltekit-frontend/src/')) return 'graphify';
  if (s.startsWith('docs/')) return 'docs';
  if (s.endsWith('.ts') || s.endsWith('.svelte') || s.endsWith('.js') || s.endsWith('.tsx')) return 'graphify';
  if (payload?.source_kind) return payload.source_kind;
  if (payload?.kind) return payload.kind;
  return 'graphify';
}

function buildPacketKey(sourceRef, packetId) {
  const ref = normalizeSourceRef(sourceRef) || sourceRef || '';
  const hash = createHash('sha256')
    .update(`${ref}:${packetId}`)
    .digest('hex')
    .slice(0, 16);
  return `${ref}:${hash}`;
}

async function main() {
  console.log('══ Rebuilding atlas_packets with Canonical Lineage ════════════════');
  console.log(`  Mode: ${DRY_RUN ? 'DRY-RUN (Run with --apply to execute)' : 'APPLY (Writing to database)'}`);
  console.log(`  Database: ${DATABASE_URL.replace(/:[^:@/]+@/, ':****@')}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    // 1. Load Feature Registry map (atlas_feature_map)
    console.log('\n[Features] Loading atlas_feature_map...');
    const { rows: featureMapRows } = await pool.query(`
      SELECT normalized_path, feature_id, som_cluster
      FROM atlas_feature_map
      WHERE normalized_path IS NOT NULL AND normalized_path != ''
    `);

    // Lookup Map: canonicalPath -> { feature_id, som_cluster }
    const featureLookup = new Map();
    for (const row of featureMapRows) {
      const canon = canonicalPath(row.normalized_path);
      featureLookup.set(canon, {
        feature_id: row.feature_id,
        som_cluster: row.som_cluster
      });
    }
    console.log(`  Loaded ${featureLookup.size} features from registry.`);

    // 2. Load Concept mapping (concept_records & parent_atlas_records)
    console.log('\n[Concepts] Loading concept maps...');
    const { rows: parentRecords } = await pool.query(`
      SELECT id, source_ref, payload
      FROM parent_atlas_records
      WHERE (source_ref IS NOT NULL AND source_ref != '') OR (payload->>'source_ref' IS NOT NULL)
    `);

    const cardIdToSourceRef = new Map();
    for (const r of parentRecords) {
      let ref = r.source_ref || r.payload?.source_ref || '';
      if (ref) {
        cardIdToSourceRef.set(r.id, ref);
      }
    }

    const { rows: conceptRecs } = await pool.query(`
      SELECT concept_id, evidence_cards, feature_ids FROM concept_records
    `);

    // Map: canonicalPath -> Set of concept_ids
    const pathToConcepts = new Map();
    // Map: featureId -> Set of concept_ids
    const featureToConcepts = new Map();

    for (const crec of conceptRecs) {
      const cid = crec.concept_id;
      
      const cards = Array.isArray(crec.evidence_cards) ? crec.evidence_cards : [];
      for (const cardId of cards) {
        const rawPath = cardIdToSourceRef.get(cardId);
        if (rawPath) {
          const canon = canonicalPath(rawPath);
          if (!pathToConcepts.has(canon)) pathToConcepts.set(canon, new Set());
          pathToConcepts.get(canon).add(cid);
        }
      }

      const fids = Array.isArray(crec.feature_ids) ? crec.feature_ids : [];
      for (const fid of fids) {
        if (fid) {
          if (!featureToConcepts.has(fid)) featureToConcepts.set(fid, new Set());
          featureToConcepts.get(fid).add(cid);
        }
      }
    }
    console.log(`  Mapped ${pathToConcepts.size} paths and ${featureToConcepts.size} features to concepts.`);

    // 3. Query all distinct parent records that have vectors
    console.log('\n[Postgres] Loading parent records and vectors...');
    const sql = `
      SELECT DISTINCT ON (r.id)
             r.id AS record_id,
             r.lane,
             r.title,
             r.source_ref,
             r.payload,
             v.embedding::text AS embedding_text
      FROM parent_atlas_records r
      INNER JOIN parent_atlas_vectors v ON r.id = v.record_id
      ORDER BY r.id, v.created_at DESC
    `;
    const { rows: records } = await pool.query(sql);
    console.log(`  Loaded ${records.length} distinct rows from Parent Atlas.`);

    // 4. Ingest/Rebuild
    if (APPLY) {
      console.log('\n[Database] Truncating atlas_packets table...');
      await pool.query('TRUNCATE TABLE atlas_packets CASCADE');
    }

    let inserted = 0;
    const client = APPLY ? await pool.connect() : null;

    if (client) {
      await client.query('BEGIN');
    }

    try {
      for (const row of records) {
        const payload = row.payload || {};
        
        // Canonical paths
        const origSourceRef = row.source_ref || payload.source_ref || '';
        const canonSourceRef = origSourceRef ? canonicalPath(origSourceRef) : null;
        
        // Infer feature_id and community_id from atlas_feature_map lookup
        let featureId = null;
        let communityId = null;
        let clusterId = null;
        
        if (canonSourceRef) {
          const featMatch = featureLookup.get(canonSourceRef);
          if (featMatch) {
            featureId = featMatch.feature_id || null;
            if (featMatch.som_cluster) {
              communityId = parseInt(featMatch.som_cluster, 10);
              clusterId = communityId;
            }
          }
        }
        
        // Fallbacks from payload if registry didn't match
        if (!featureId) {
          featureId = payload.feature_id || payload.featureId || null;
        }
        if (communityId === null) {
          const rawCluster = payload.cluster_id ?? payload.clusterId ?? payload.som_cluster ?? payload.somCluster ?? payload.som_bmu_index ?? payload.somBmuIndex;
          if (rawCluster !== undefined && rawCluster !== null) {
            communityId = parseInt(rawCluster, 10);
            clusterId = communityId;
          }
        }

        // Concepts mapping
        const conceptIdsSet = new Set();
        if (canonSourceRef) {
          const matched = pathToConcepts.get(canonSourceRef);
          if (matched) {
            for (const c of matched) conceptIdsSet.add(c);
          }
        }
        if (featureId) {
          const matched = featureToConcepts.get(featureId);
          if (matched) {
            for (const c of matched) conceptIdsSet.add(c);
          }
        }
        const conceptIds = conceptIdsSet.size > 0 ? [...conceptIdsSet] : null;

        // Keys and metadata
        const packetId = row.record_id;
        const artifactId = payload.artifact_id || payload.artifactId || row.record_id;
        const sourceKind = inferSourceKind(canonSourceRef || origSourceRef, payload);
        const packetKey = canonSourceRef ? buildPacketKey(canonSourceRef, packetId) : null;

        // Embeddings and summary
        const embedding = row.embedding_text ? `[${JSON.parse(row.embedding_text).join(',')}]` : null;
        const summary = payload.summary || row.title || payload.description || null;
        const byteStart = payload.byte_start !== undefined ? Number(payload.byte_start) : (payload.byteStart !== undefined ? Number(payload.byteStart) : null);
        const byteEnd = payload.byte_end !== undefined ? Number(payload.byte_end) : (payload.byteEnd !== undefined ? Number(payload.byteEnd) : null);
        const sha256 = payload.sha256 || payload.packet_hash || payload.source_hash || null;
        const rewardPrior = parseFloat(payload.reward_prior || payload.rewardPrior || 0.0);

        if (DRY_RUN) {
          if (inserted < 5) {
            console.log(`  [dry-run] Sample Packet:`);
            console.log(`    packet_id:    ${packetId}`);
            console.log(`    source_ref:   ${canonSourceRef} (orig: ${origSourceRef})`);
            console.log(`    feature_id:   ${featureId}`);
            console.log(`    community_id: ${communityId}`);
            console.log(`    concept_ids:  `, conceptIds);
            console.log(`    packet_key:   ${packetKey}`);
            console.log(`    source_kind:  ${sourceKind}`);
          }
          inserted++;
          continue;
        }

        const insertSql = `
          INSERT INTO atlas_packets (
            packet_id, artifact_id, source_ref, feature_id, community_id,
            concept_ids, cluster_id, embedding, payload, summary,
            byte_start, byte_end, sha256, packet_key, source_kind,
            reward_prior, source_path, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now()
          )
        `;

        await client.query(insertSql, [
          packetId, artifactId, canonSourceRef, featureId, communityId,
          conceptIds, clusterId, embedding, JSON.stringify(payload), summary,
          byteStart, byteEnd, sha256, packetKey, sourceKind,
          rewardPrior, origSourceRef
        ]);
        inserted++;
      }

      if (client) {
        await client.query('COMMIT');
        console.log(`\n[Database] Committed ${inserted} canonical packets.`);
      } else {
        console.log(`\n[Dry-Run] Discovered and processed ${inserted} packets.`);
      }
    } catch (err) {
      if (client) {
        await client.query('ROLLBACK');
      }
      console.error('In-batch insertion failed, transaction rolled back:', err);
      throw err;
    } finally {
      if (client) {
        client.release();
      }
    }

  } catch (err) {
    console.error('Rebuild failed:', err);
  } finally {
    await pool.end();
    console.log('\n══ Process Finished ════════════════════════════════\n');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
