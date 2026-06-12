#!/usr/bin/env node
/**
 * enrich_atlas_packets.mjs
 *
 * Rebuilds the atlas_packets table with canonical lineage and full metadata:
 * 1. Reads distinct parent_atlas_records joined with parent_atlas_vectors.
 * 2. Loads neschrom97-card-registry.json for ground-truth mappings.
 * 3. Resolves source_refs using the 5-tier priority fallback logic:
 *    - Tier 1: Exact registry ID match (using computed SHA-256 or card ID)
 *    - Tier 2: Exact source_ref match
 *    - Tier 3: Normalized source_ref match
 *    - Tier 4: Feature ID fallback
 *    - Tier 5: Semantic fallback (Qdrant ANN) - marked as inferred
 * 4. Maps feature_id, community_id, and cluster_id using atlas_feature_map.
 * 5. Maps concept_ids using concept_records.
 * 6. Truncates atlas_packets and bulk inserts the canonical packets.
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
const QDRANT_URL = env.QDRANT_URL || 'http://127.0.0.1:6333';

function canonicalPath(input, lowercase = false) {
  if (!input || typeof input !== 'string') return '';
  
  let s = input
    .replace(/\\/g, '/')
    .replace(/^file:\/+/i, '')
    .replace(/^\/?c:\//i, '')
    .replace(/^Users\/james\/Videos\/deeds-web-app\//i, '')
    .replace(/^deeds-web-app\//i, '')
    .replace(/^\.?\//, '');
    
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
  return lowercase ? s.toLowerCase() : s;
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

async function queryQdrantSemanticFallback(embeddingText, qdrantUrl) {
  if (!embeddingText || !qdrantUrl) return null;
  try {
    const embedding = JSON.parse(embeddingText);
    if (!Array.isArray(embedding) || embedding.length === 0) return null;
    
    const body = {
      vector: { name: 'content', vector: embedding },
      limit: 1,
      with_payload: true,
      score_threshold: 0.60
    };
    
    const res = await fetch(`${qdrantUrl}/collections/codebase_chunks_768/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    
    if (res.ok) {
      const data = await res.json();
      const hits = data.result || [];
      if (hits.length > 0) {
        const top = hits[0];
        const rawPath = top.payload?.file_path || top.payload?.sourceRef || top.payload?.source_ref || top.payload?.path;
        if (rawPath) {
          return {
            sourceRef: String(rawPath).split('#')[0],
            score: top.score
          };
        }
      }
    }
  } catch (e) {
    console.warn(`    [semantic-fallback] Qdrant lookup failed: ${e.message}`);
  }
  return null;
}

async function main() {
  console.log('══ Rebuilding atlas_packets with Registry-first Lineage ════════════════');
  console.log(`  Mode: ${DRY_RUN ? 'DRY-RUN (Run with --apply to execute)' : 'APPLY (Writing to database)'}`);
  console.log(`  Database: ${DATABASE_URL.replace(/:[^:@/]+@/, ':****@')}`);
  console.log(`  Qdrant URL: ${QDRANT_URL}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    // 1. Load neschrom97-card-registry.json
    console.log('\n[Registry] Loading card registry...');
    const registryPath = path.join(ROOT, 'docs/reports/neschrom97-card-registry.json');
    const registryIdToSourceRef = new Map();
    const registryCardToSourceRef = new Map();
    const registryFeatureToSourceRef = new Map();
    const registryNormalizedToSourceRef = new Map();

    if (fs.existsSync(registryPath)) {
      try {
        const registryData = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        const mappings = registryData.mappings || [];
        for (const item of mappings) {
          if (item.source_ref) {
            const sRef = item.source_ref;
            const canon = canonicalPath(sRef, true);
            
            registryNormalizedToSourceRef.set(canon, sRef);
            
            if (item.card_id) {
              registryCardToSourceRef.set(item.card_id, sRef);
              registryIdToSourceRef.set(item.card_id, sRef);
            }
            
            // Map calculated SHA-256 of the path relative to the sub-project
            let relPath = sRef;
            if (sRef.startsWith('sveltekit-frontend/')) {
              relPath = sRef.substring('sveltekit-frontend/'.length);
            }
            const hash = createHash('sha256').update(relPath).digest('hex');
            registryIdToSourceRef.set(hash, sRef);
            
            if (item.feature_id && !registryFeatureToSourceRef.has(item.feature_id)) {
              registryFeatureToSourceRef.set(item.feature_id, sRef);
            }
          }
        }
        console.log(`  Loaded ${registryIdToSourceRef.size} registry path references.`);
      } catch (e) {
        console.warn('  Failed to load card registry:', e.message);
      }
    } else {
      console.warn(`  Registry file not found at ${registryPath}`);
    }

    // 2. Load Feature Registry map (atlas_feature_map)
    console.log('\n[Features] Loading atlas_feature_map...');
    const { rows: featureMapRows } = await pool.query(`
      SELECT normalized_path, feature_id, som_cluster
      FROM atlas_feature_map
      WHERE normalized_path IS NOT NULL AND normalized_path != ''
    `);

    const featureLookup = new Map();
    for (const row of featureMapRows) {
      const canon = canonicalPath(row.normalized_path, true);
      featureLookup.set(canon, {
        feature_id: row.feature_id,
        som_cluster: row.som_cluster
      });
    }
    console.log(`  Loaded ${featureLookup.size} features from registry.`);

    // 3. Load Concept mapping
    console.log('\n[Concepts] Loading concept records...');
    const { rows: conceptRecs } = await pool.query(`
      SELECT concept_id, evidence_cards, feature_ids FROM concept_records
    `);

    const pathToConcepts = new Map();
    const featureToConcepts = new Map();
    const cardIdToConcepts = new Map();

    for (const crec of conceptRecs) {
      const cid = crec.concept_id;
      
      const cards = Array.isArray(crec.evidence_cards) ? crec.evidence_cards : [];
      for (const cardId of cards) {
        if (!cardIdToConcepts.has(cardId)) cardIdToConcepts.set(cardId, new Set());
        cardIdToConcepts.get(cardId).add(cid);

        // Map path via card registry
        const rawPath = registryCardToSourceRef.get(cardId);
        if (rawPath) {
          const canon = canonicalPath(rawPath, true);
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
    console.log(`  Mapped ${pathToConcepts.size} paths, ${featureToConcepts.size} features, and ${cardIdToConcepts.size} cards to concepts.`);

    // 3b. Load parent_atlas_documents summaries
    console.log('\n[Database] Loading parent_atlas_documents summaries...');
    const { rows: docSummaryRows } = await pool.query(`
      SELECT source_ref, summary
      FROM parent_atlas_documents
      WHERE summary IS NOT NULL AND summary != ''
    `);
    const docSummaryMap = new Map();
    for (const row of docSummaryRows) {
      if (row.source_ref) {
        docSummaryMap.set(canonicalPath(row.source_ref, true), row.summary);
      }
    }
    console.log(`  Loaded ${docSummaryMap.size} document summaries.`);

    // 4. Query all distinct parent records that have vectors
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
      LEFT JOIN parent_atlas_vectors v ON r.id = v.record_id
      ORDER BY r.id, v.created_at DESC
    `;
    const { rows: records } = await pool.query(sql);
    console.log(`  Loaded ${records.length} distinct rows from Parent Atlas.`);

    // 5. Ingest/Rebuild
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
        const recordId = row.record_id;
        const lane = row.lane;
        
        let resolvedSourceRef = null;
        let sourceKind = 'graphify';
        let conceptResolution = null;

        // ── 5-Tier Fallback Lineage Resolution ──
        
        // Tier 1: Exact registry ID match (64-char sha256 or 16-char hex)
        if (registryIdToSourceRef.has(recordId)) {
          resolvedSourceRef = registryIdToSourceRef.get(recordId);
          sourceKind = 'neschrom97';
          let subRef = resolvedSourceRef;
          if (subRef && subRef.startsWith('sveltekit-frontend/')) {
            subRef = subRef.substring('sveltekit-frontend/'.length);
          }
          conceptResolution = {
            method: 'neschrom97-card-registry',
            lane: lane || 'features',
            confidence: 1.0,
            registry_id: recordId,
            source_ref: subRef
          };
        }
        
        // Tier 2: Exact source_ref match
        if (!resolvedSourceRef) {
          const rawRef = row.source_ref || payload.source_ref;
          if (rawRef) {
            resolvedSourceRef = rawRef;
            sourceKind = inferSourceKind(resolvedSourceRef, payload);
            let subRef = resolvedSourceRef;
            if (subRef && subRef.startsWith('sveltekit-frontend/')) {
              subRef = subRef.substring('sveltekit-frontend/'.length);
            }
            conceptResolution = {
              method: 'exact-source-ref',
              lane: lane || 'features',
              confidence: 1.0,
              source_ref: subRef
            };
          }
        }

        // Tier 3: Normalized source_ref match
        if (!resolvedSourceRef) {
          const rawRef = row.source_ref || payload.source_ref;
          if (rawRef) {
            const canon = canonicalPath(rawRef, true);
            if (registryNormalizedToSourceRef.has(canon)) {
              resolvedSourceRef = registryNormalizedToSourceRef.get(canon);
              sourceKind = 'neschrom97';
              let subRef = resolvedSourceRef;
              if (subRef && subRef.startsWith('sveltekit-frontend/')) {
                subRef = subRef.substring('sveltekit-frontend/'.length);
              }
              conceptResolution = {
                method: 'normalized-source-ref',
                lane: lane || 'features',
                confidence: 0.9,
                source_ref: subRef
              };
            }
          }
        }

        // Tier 4: Feature ID fallback
        let featureId = payload.feature_id || payload.featureId || null;
        if (!resolvedSourceRef && featureId) {
          if (registryFeatureToSourceRef.has(featureId)) {
            resolvedSourceRef = registryFeatureToSourceRef.get(featureId);
            sourceKind = 'neschrom97';
            let subRef = resolvedSourceRef;
            if (subRef && subRef.startsWith('sveltekit-frontend/')) {
              subRef = subRef.substring('sveltekit-frontend/'.length);
            }
            conceptResolution = {
              method: 'feature-id-fallback',
              lane: lane || 'features',
              confidence: 0.7,
              feature_id: featureId,
              source_ref: subRef
            };
          }
        }

        // Tier 5: Semantic fallback (Qdrant ANN)
        const isFeatures64Char = (lane === 'features' && /^[0-9a-f]{64}$/i.test(recordId));
        if (!resolvedSourceRef && !isFeatures64Char) {
          const semantic = await queryQdrantSemanticFallback(row.embedding_text, QDRANT_URL);
          if (semantic) {
            resolvedSourceRef = semantic.sourceRef;
            sourceKind = 'graphify';
            let subRef = resolvedSourceRef;
            if (subRef && subRef.startsWith('sveltekit-frontend/')) {
              subRef = subRef.substring('sveltekit-frontend/'.length);
            }
            conceptResolution = {
              method: 'semantic-fallback',
              lane: lane || 'features',
              confidence: parseFloat(semantic.score.toFixed(3)),
              source_ref: subRef,
              inferred: true
            };
          }
        }

        // Default: If no resolution worked, preserve original stub
        if (!resolvedSourceRef) {
          resolvedSourceRef = row.source_ref || payload.source_ref || '';
          sourceKind = inferSourceKind(resolvedSourceRef, payload);
        }

        // Final Paths
        const canonSourceRef = resolvedSourceRef ? canonicalPath(resolvedSourceRef, false) : null;
        const canonSourceRefKey = resolvedSourceRef ? canonicalPath(resolvedSourceRef, true) : null;
        const origSourceRef = resolvedSourceRef || null;

        // Map feature_id, community_id, and cluster_id from atlas_feature_map lookup
        let communityId = null;
        let clusterId = null;
        
        if (canonSourceRefKey) {
          const featMatch = featureLookup.get(canonSourceRefKey);
          if (featMatch) {
            if (!featureId) featureId = featMatch.feature_id || null;
            if (featMatch.som_cluster) {
              const parsed = parseInt(featMatch.som_cluster, 10);
              if (!isNaN(parsed)) {
                communityId = parsed;
                clusterId = communityId;
              }
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
            const parsed = parseInt(rawCluster, 10);
            if (!isNaN(parsed)) {
              communityId = parsed;
              clusterId = communityId;
            }
          }
        }

        // Concepts mapping
        const conceptIdsSet = new Set();
        if (cardIdToConcepts.has(recordId)) {
          for (const c of cardIdToConcepts.get(recordId)) conceptIdsSet.add(c);
        }
        if (canonSourceRefKey && pathToConcepts.has(canonSourceRefKey)) {
          for (const c of pathToConcepts.get(canonSourceRefKey)) conceptIdsSet.add(c);
        }
        if (featureId && featureToConcepts.has(featureId)) {
          for (const c of featureToConcepts.get(featureId)) conceptIdsSet.add(c);
        }
        const conceptIds = conceptIdsSet.size > 0 ? [...conceptIdsSet].sort() : null;

        // Keys and metadata
        const packetKey = canonSourceRef ? buildPacketKey(canonSourceRef, recordId) : null;
        const artifactId = payload.artifact_id || payload.artifactId || recordId;

        // Embeddings and summary
        const embedding = row.embedding_text ? `[${JSON.parse(row.embedding_text).join(',')}]` : null;
        const summary = payload.summary || row.title || payload.description || null;
        
        let byteStart = payload.byte_start !== undefined ? Number(payload.byte_start) : (payload.byteStart !== undefined ? Number(payload.byteStart) : null);
        if (byteStart !== null && isNaN(byteStart)) byteStart = null;
        
        let byteEnd = payload.byte_end !== undefined ? Number(payload.byte_end) : (payload.byteEnd !== undefined ? Number(payload.byteEnd) : null);
        if (byteEnd !== null && isNaN(byteEnd)) byteEnd = null;
        
        const sha256 = payload.sha256 || payload.packet_hash || payload.source_hash || null;
        
        let rewardPrior = parseFloat(payload.reward_prior || payload.rewardPrior || 0.0);
        if (isNaN(rewardPrior)) rewardPrior = 0.0;

        // Inject concept_resolution block into payload
        if (conceptResolution) {
          payload.concept_resolution = conceptResolution;
        }

        if (DRY_RUN) {
          if (inserted < 5) {
            console.log(`  [dry-run] Sample Packet:`);
            console.log(`    packet_id:      ${recordId}`);
            console.log(`    source_ref:     ${canonSourceRef} (key: ${canonSourceRefKey}, orig: ${origSourceRef})`);
            console.log(`    feature_id:     ${featureId}`);
            console.log(`    concept_ids:    `, conceptIds);
            console.log(`    packet_key:     ${packetKey}`);
            console.log(`    source_kind:    ${sourceKind}`);
            console.log(`    resolution:     `, conceptResolution);
          }
          inserted++;
          continue;
        }

        const insertSql = `
          INSERT INTO atlas_packets (
            packet_id, artifact_id, source_ref, source_ref_key, feature_id, community_id,
            concept_ids, cluster_id, embedding, payload, summary,
            byte_start, byte_end, sha256, packet_key, source_kind,
            reward_prior, source_path, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now()
          )
        `;

        await client.query(insertSql, [
          recordId, artifactId, canonSourceRef, canonSourceRefKey, featureId, communityId,
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
