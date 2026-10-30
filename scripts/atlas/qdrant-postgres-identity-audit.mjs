#!/usr/bin/env node
/**
 * Qdrant/Postgres Identity Audit — Read-Only Lane Classification
 *
 * Classifies Qdrant points into identity lanes by matching against
 * Postgres atlas_packets and codebase_chunk_index tables.
 *
 * **CRITICAL**: This is READ-ONLY. No Qdrant or Postgres mutations.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/atlas/qdrant-postgres-identity-audit.mjs [--collection=codebase_chunks_768|codebase_chunks_768_v2] [--ledger=output.ndjson] [--ledger-only-unowned-point-id] [--limit=N]
 *
 * Output:
 *   - Optional streamed NDJSON ledger with per-point classification
 *   - Summary report with coverage metrics
 *   - Dry-run backfill plan (if --dry-run)
 *
 * Matching Authority Order (STRICT):
 *   1. Qdrant payload packet_key → atlas_packets.packet_key (EXACT_ATLAS_PACKET_KEY)
 *   2. Qdrant point UUID → atlas_packets.qdrant_point_id (EXACT_ATLAS_QDRANT_ID)
 *   3. Qdrant point UUID → codebase_chunk_index.qdrant_id (EXACT_CHUNK_QDRANT_ID)
 *   4. Source-ref fallback (degraded evidence only)
 *   5. Integer point IDs (separate legacy lane)
 *
 * Identity Lanes:
 *   - DIRECTORY_SUMMARY: payload.kind='directory_cluster'
 *   - EXACT_ATLAS_PACKET_KEY: payload.packet_key matches exactly one atlas_packets row
 *   - EXACT_ATLAS_QDRANT_ID: point UUID matches atlas_packets.qdrant_point_id
 *   - EXACT_CHUNK_QDRANT_ID: point UUID matches codebase_chunk_index.qdrant_id
 *   - EXACT_BOTH_TABLES: point UUID in both atlas_packets AND codebase_chunk_index
 *   - LEGACY_INTEGER_POINT: typeof point.id !== 'string'
 *   - SOURCE_REF_ONLY: degraded — payload.source_ref matches 1+ rows (not exact)
 *   - AMBIGUOUS_PACKET_KEY: payload.packet_key matches 2+ atlas_packets rows
 *   - AMBIGUOUS_SOURCE_REF: payload.source_ref matches 2+ rows
 *   - UNKNOWN_IDENTITY: no match across all strategies
 */

import { appendFileSync, createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

// Qdrant client
import { QdrantClient } from '@qdrant/qdrant-js';
import {
  addPacketKeyRowV1,
  addPointIdRowV1,
  auditPointPayloadLineageV1,
  classifyExactPointIdV1,
  incrementPayloadCohortV1,
  hasUniquePointIdOwnerV1,
  lookupPacketKeyV1,
  markPointIdObservedV1,
  QDRANT_PROJECTION_LINEAGE_FIELDS_V1,
  resolveQdrantPageLimitV1,
  resolveQdrantAuditCollectionV1,
  resolveQdrantScanLimitV1,
  summarizePointIdCoverageV1,
  shouldIncludeAuditLedgerEntryV1,
} from './lib/qdrant-identity-audit-index-v1.mjs';

// Postgres (pg-promise or direct pool)
import pg from 'pg';

const argv = process.argv.slice(2);
const outputLedger = argv.find(a => a.startsWith('--ledger='))?.slice('--ledger='.length) || null;
const checkpointPath = argv.find(a => a.startsWith('--checkpoint='))?.split('=')[1] || null;
const resume = argv.includes('--resume');
const ledgerOnlyUnownedPointId = argv.includes('--ledger-only-unowned-point-id');
const limitArg = argv.find(a => a.startsWith('--limit='))?.split('=')[1];
const auditLimit = limitArg === undefined ? null : Number(limitArg);
const collectionArg = argv.find(a => a.startsWith('--collection='))?.slice('--collection='.length);
const QDRANT_COLLECTION = resolveQdrantAuditCollectionV1(collectionArg);
const isReadOnly = !argv.includes('--apply');

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const POSTGRES_URL = process.env.DATABASE_URL;

if (!POSTGRES_URL) throw new Error('DATABASE_URL_REQUIRED_FOR_READ_ONLY_IDENTITY_AUDIT');
if (ledgerOnlyUnownedPointId && !outputLedger) throw new Error('--ledger-only-unowned-point-id requires --ledger=PATH');
if (checkpointPath && !outputLedger) throw new Error('--checkpoint requires an explicit --ledger path');
if (resume && !checkpointPath) throw new Error('--resume requires --checkpoint');

class QdrantPostgresAudit {
  constructor() {
    this.qdrantClient = new QdrantClient({ url: QDRANT_URL });
    this.pgPool = new pg.Pool({ connectionString: POSTGRES_URL });
    this.stats = {
      total_points: 0,
      by_lane: {},
      exact_matches: 0,
      ambiguous_matches: 0,
      legacy_integer_ids: 0,
      unknown_identities: 0,
      atlas_packets_with_qdrant_id: 0,
      atlas_packets_without_qdrant_id: 0,
      codebase_chunk_with_qdrant_id: 0,
      qdrant_payload_field_coverage: Object.fromEntries(QDRANT_PROJECTION_LINEAGE_FIELDS_V1.map((field) => [field, 0])),
      qdrant_payload_lineage_complete: 0,
      qdrant_points_with_unique_pg_point_id: 0,
      qdrant_points_without_unique_pg_point_id: 0,
      qdrant_payload_cohorts: {},
    };
    this.incrementalLedger = Boolean(checkpointPath);
  }

  async restoreIncrementalState() {
    if (!this.incrementalLedger || !resume) return { offset: undefined, scannedPoints: 0 };
    if (!existsSync(checkpointPath) || !existsSync(outputLedger)) {
      throw new Error('RESUME_REQUIRES_EXISTING_CHECKPOINT_AND_LEDGER');
    }
    const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8'));
    if (checkpoint.collection !== QDRANT_COLLECTION) {
      throw new Error('RESUME_COLLECTION_MISMATCH');
    }
    if (checkpoint.completed === true) {
      throw new Error('RESUME_REFUSES_COMPLETED_AUDIT');
    }
    let entryCount = 0;
    const lines = createInterface({ input: createReadStream(outputLedger), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line);
      entryCount++;
      this.stats.total_points++;
      this.stats.by_lane[entry.classification_lane] = (this.stats.by_lane[entry.classification_lane] || 0) + 1;
      if (Number(entry.confidence) >= 0.9) this.stats.exact_matches++;
      else if (Number(entry.confidence) >= 0.3) this.stats.ambiguous_matches++;
      else this.stats.unknown_identities++;
    }
    if (Number.isInteger(checkpoint.auditedPoints) && entryCount !== checkpoint.auditedPoints) {
      throw new Error(`RESUME_LEDGER_CHECKPOINT_MISMATCH:ledger=${entryCount}:checkpoint=${checkpoint.auditedPoints}`);
    }
    return { offset: checkpoint.next_page_offset, scannedPoints: entryCount };
  }

  appendBatch(entries) {
    if (!outputLedger || entries.length === 0) return;
    const selected = entries.filter(entry => shouldIncludeAuditLedgerEntryV1({
      onlyUnownedPointId: ledgerOnlyUnownedPointId,
      uniquePointIdOwner: entry.unique_point_id_owner,
    }));
    if (selected.length === 0) return;
    appendFileSync(outputLedger, selected.map(entry => JSON.stringify(entry) + '\n').join(''), 'utf8');
  }

  writeCheckpoint(value) {
    if (!this.incrementalLedger) return;
    writeFileSync(checkpointPath, `${JSON.stringify({
      schema: 'atlas.qdrant-postgres-identity-audit-checkpoint.v1',
      collection: QDRANT_COLLECTION,
      ledger: outputLedger,
      ...value,
    }, null, 2)}\n`, 'utf8');
  }

  async loadPostgresData() {
    console.log('📦 Loading Postgres data...');

    // Load atlas_packets by packet_key
    const packetResult = await this.pgPool.query(
      'SELECT packet_key, qdrant_point_id, source_ref, feature_id FROM atlas_packets WHERE packet_key IS NOT NULL'
    );
    this.atlasPacketsByKey = new Map();
    this.atlasPacketsById = new Map();
    this.atlasBySourceRef = new Map();

    for (const row of packetResult.rows) {
      addPacketKeyRowV1(this.atlasPacketsByKey, row);
      if (row.qdrant_point_id) {
        addPointIdRowV1(this.atlasPacketsById, row.qdrant_point_id, row);
      }
      if (!this.atlasBySourceRef.has(row.source_ref)) {
        this.atlasBySourceRef.set(row.source_ref, []);
      }
      this.atlasBySourceRef.get(row.source_ref).push(row);
      if (row.qdrant_point_id) {
        this.stats.atlas_packets_with_qdrant_id++;
      } else {
        this.stats.atlas_packets_without_qdrant_id++;
      }
    }

    console.log(`   ✅ Loaded ${packetResult.rows.length} atlas_packets rows`);
    console.log(`      - With qdrant_point_id: ${this.stats.atlas_packets_with_qdrant_id}`);
    console.log(`      - Without qdrant_point_id: ${this.stats.atlas_packets_without_qdrant_id}\n`);

    // Keep the table primary key distinct from the Qdrant projection backlink.
    const chunkResult = await this.pgPool.query(
      'SELECT id::text, qdrant_id, chunk_id, source_ref FROM codebase_chunk_index'
    );
    this.chunksByQdrantId = new Map();
    this.chunksByPrimaryId = new Map();
    this.chunksBySourceRef = new Map();

    for (const row of chunkResult.rows) {
      addPointIdRowV1(this.chunksByPrimaryId, row.id, row);
      if (row.qdrant_id) addPointIdRowV1(this.chunksByQdrantId, row.qdrant_id, row);
      if (!this.chunksBySourceRef.has(row.source_ref)) {
        this.chunksBySourceRef.set(row.source_ref, []);
      }
      this.chunksBySourceRef.get(row.source_ref).push(row);
      if (row.qdrant_id) this.stats.codebase_chunk_with_qdrant_id++;
    }

    console.log(`   ✅ Loaded ${chunkResult.rows.length} codebase_chunk_index rows, including primary IDs\n`);
  }

  async classifyPoint(point, payload) {
    // Step 1: Directory summaries
    if (payload?.kind === 'directory_cluster') {
      return {
        lane: 'DIRECTORY_SUMMARY',
        confidence: 1.0,
        match_type: 'kind_field',
        evidence: { kind: payload.kind },
      };
    }

    // Step 2: Exact packet_key match
    if (payload?.packet_key) {
      const match = lookupPacketKeyV1(this.atlasPacketsByKey, payload.packet_key);
      if (match.kind === 'unique') {
          return {
            lane: 'EXACT_ATLAS_PACKET_KEY',
            confidence: 0.99,
            match_type: 'payload_packet_key',
            evidence: {
              payload_packet_key: payload.packet_key,
              postgres_packet_key: match.row.packet_key,
              postgres_row: match.row.packet_key,
            },
          };
      } else if (match.kind === 'ambiguous') {
          return {
            lane: 'AMBIGUOUS_PACKET_KEY',
            confidence: 0.3,
            match_type: 'ambiguous',
            evidence: {
              packet_key: payload.packet_key,
              matching_rows: match.count,
            },
          };
      }
    }

    // Step 3: Point UUID → atlas_packets.qdrant_point_id
    if (typeof point.id === 'string') {
      const exactIdentity = classifyExactPointIdV1(point.id, this.atlasPacketsById, this.chunksByQdrantId, this.chunksByPrimaryId);
      if (exactIdentity) return exactIdentity;
    }

    // Step 6: Legacy integer point IDs
    if (typeof point.id === 'number' || (typeof point.id === 'string' && !/-/.test(point.id))) {
      return {
        lane: 'LEGACY_INTEGER_POINT',
        confidence: 0.5,
        match_type: 'legacy_id_type',
        evidence: {
          qdrant_point_id: point.id,
          id_type: typeof point.id,
        },
      };
    }

    // Step 7: Source-ref fallback (degraded evidence)
    if (payload?.source_ref) {
      const atlasMatches = this.atlasBySourceRef.get(payload.source_ref) || [];
      const chunkMatches = this.chunksBySourceRef.get(payload.source_ref) || [];

      const totalSourceMatches = atlasMatches.length + chunkMatches.length;
      if (totalSourceMatches > 1) {
        return {
          lane: 'AMBIGUOUS_SOURCE_REF',
          confidence: 0.2,
          match_type: 'source_ref_cross_table_multiple',
          evidence: {
            source_ref: payload.source_ref,
            atlas_packet_matches: atlasMatches.length,
            chunk_matches: chunkMatches.length,
          },
        };
      }

      if (atlasMatches.length === 1) {
        return {
          lane: 'SOURCE_REF_ONLY',
          confidence: 0.4,
          match_type: 'source_ref_single_match',
          evidence: {
            source_ref: payload.source_ref,
            matching_rows: 1,
            postgres_table: 'atlas_packets',
          },
        };
      }

      if (chunkMatches.length === 1) {
        return {
          lane: 'SOURCE_REF_ONLY',
          confidence: 0.4,
          match_type: 'source_ref_chunk',
          evidence: {
            source_ref: payload.source_ref,
            matching_rows: 1,
            postgres_table: 'codebase_chunk_index',
          },
        };
      }
    }

    // Step 8: Unknown identity
    return {
      lane: 'UNKNOWN_IDENTITY',
      confidence: 0.0,
      match_type: 'no_match',
      evidence: {
        qdrant_point_id: point.id,
        payload_keys: Object.keys(payload || {}),
      },
    };
  }

  async auditAllPoints() {
    console.log('🔍 Auditing Qdrant points...\n');

    // Iterate through collection via scroll (paginated)
    // Qdrant scroll API: offset is carried in next_page_offset (numeric)
    const restored = await this.restoreIncrementalState();
    let offset = restored.offset;
    let batchCount = 0;
    let scannedPoints = restored.scannedPoints;
    const seenCursors = new Set();

    // Safety ceiling: do not scan more than expected + 10%
    const collectionInfo = await this.qdrantClient.getCollection(QDRANT_COLLECTION);
    const expectedCount = collectionInfo.points_count;
    const maximumScan = resolveQdrantScanLimitV1(expectedCount, auditLimit);
    if (scannedPoints > maximumScan) {
      throw new Error(`RESUMED_SCAN_EXCEEDS_LIMIT:scanned=${scannedPoints}:limit=${maximumScan}`);
    }

    while (true) {
      const cursorKey = offset === undefined ? 'START' : JSON.stringify(offset);
      if (seenCursors.has(cursorKey)) throw new Error(`PAGINATION_CURSOR_CYCLE:${cursorKey}`);
      seenCursors.add(cursorKey);
      const pageLimit = resolveQdrantPageLimitV1(auditLimit, scannedPoints);
      if (pageLimit === 0) break;
      const scrollResult = await this.qdrantClient.scroll(QDRANT_COLLECTION, {
        limit: pageLimit,
        offset: offset,  // Correct parameter: offset, not point_id_selector
        with_payload: true,
        with_vectors: false,
      });

      if (!scrollResult?.points || scrollResult.points.length === 0) {
        if (scannedPoints !== expectedCount) {
          throw new Error(`QDRANT_SCAN_COUNT_MISMATCH:scanned=${scannedPoints}:expected=${expectedCount}`);
        }
        this.writeCheckpoint({ completed: true, auditedPoints: scannedPoints, next_page_offset: null });
        break;
      }
      if (scrollResult.points.length > pageLimit) {
        throw new Error(`QDRANT_PAGE_EXCEEDED_LIMIT:received=${scrollResult.points.length}:limit=${pageLimit}`);
      }

      batchCount++;
      console.log(`   Batch ${batchCount}: processing ${scrollResult.points.length} points`);

      const batchEntries = [];
      for (const point of scrollResult.points) {
        scannedPoints++;
        if (scannedPoints > maximumScan) {
          throw new Error(`SCAN EXCEEDED SAFETY CEILING: Scanned ${scannedPoints} points but expected ~${expectedCount}. Audit loop may be stuck.`);
        }

        markPointIdObservedV1(this.atlasPacketsById, point.id);
        markPointIdObservedV1(this.chunksByQdrantId, point.id);
        markPointIdObservedV1(this.chunksByPrimaryId, point.id);
        const uniquePointIdOwner = hasUniquePointIdOwnerV1(point.id, this.atlasPacketsById, this.chunksByQdrantId, this.chunksByPrimaryId);
        if (uniquePointIdOwner) {
          this.stats.qdrant_points_with_unique_pg_point_id++;
        } else {
          this.stats.qdrant_points_without_unique_pg_point_id++;
        }
        const payloadLineage = auditPointPayloadLineageV1(point.payload);
        for (const field of QDRANT_PROJECTION_LINEAGE_FIELDS_V1) {
          if (!payloadLineage.missing.includes(field)) this.stats.qdrant_payload_field_coverage[field]++;
        }
        if (payloadLineage.complete) this.stats.qdrant_payload_lineage_complete++;
        for (const field of ['projection_revision', 'representation_revision', 'model_revision', 'embedding_model']) {
          incrementPayloadCohortV1(this.stats.qdrant_payload_cohorts, field, point.payload);
        }
        const projectedAt = point.payload?.graphify_embedding_projected_at;
        if (typeof projectedAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(projectedAt)) {
          incrementPayloadCohortV1(this.stats.qdrant_payload_cohorts, 'graphify_projection_date', { graphify_projection_date: projectedAt.slice(0, 10) });
        }
        const classification = await this.classifyPoint(point, point.payload);
        this.stats.total_points++;

        // Track by lane
        if (!this.stats.by_lane[classification.lane]) {
          this.stats.by_lane[classification.lane] = 0;
        }
        this.stats.by_lane[classification.lane]++;

        // Count exact vs ambiguous
        if (classification.confidence >= 0.90) {
          this.stats.exact_matches++;
        } else if (classification.confidence >= 0.3) {
          this.stats.ambiguous_matches++;
        } else {
          this.stats.unknown_identities++;
        }

        // Append to ledger
        const entry = {
          qdrant_point_id: point.id,
          id_type: typeof point.id,
          payload_packet_key: point.payload?.packet_key,
          payload_source_ref: point.payload?.source_ref,
          unique_point_id_owner: uniquePointIdOwner,
          classification_lane: classification.lane,
          confidence: classification.confidence,
          match_type: classification.match_type,
          evidence: classification.evidence,
        };
        batchEntries.push(entry);
      }

      this.appendBatch(batchEntries);

      if (scrollResult.next_page_offset === null || scrollResult.next_page_offset === undefined) {
        if (scannedPoints !== expectedCount) {
          throw new Error(`QDRANT_SCAN_COUNT_MISMATCH:scanned=${scannedPoints}:expected=${expectedCount}`);
        }
        this.writeCheckpoint({ completed: true, auditedPoints: scannedPoints, next_page_offset: null });
        break;
      }

      if (auditLimit !== null && scannedPoints >= auditLimit) {
        console.log(`   ⏸️  Limit reached (${auditLimit} points). Stopping audit.`);
        this.writeCheckpoint({
          completed: false,
          auditedPoints: scannedPoints,
          next_page_offset: scrollResult.next_page_offset,
        });
        break;
      }

      if (JSON.stringify(scrollResult.next_page_offset) === JSON.stringify(offset)) {
        throw new Error(`PAGINATION_CURSOR_DID_NOT_ADVANCE:${cursorKey}`);
      }
      offset = scrollResult.next_page_offset;
      this.writeCheckpoint({ completed: false, auditedPoints: scannedPoints, next_page_offset: offset });
    }

    console.log(`   ✅ Audited ${this.stats.total_points} points (scanned ${scannedPoints} total)\n`);
  }

  reportStats() {
    console.log('📊 Identity Lane Classification Report\n');
    console.log('By Lane:');

    const sorted = Object.entries(this.stats.by_lane).sort((a, b) => b[1] - a[1]);
    for (const [lane, count] of sorted) {
      const pct = ((count / this.stats.total_points) * 100).toFixed(1);
      console.log(`  ${lane}: ${count} (${pct}%)`);
    }

    console.log(`\nCoverage Summary:`);
    console.log(`  Exact matches (confidence ≥0.90): ${this.stats.exact_matches}`);
    console.log(`  Ambiguous matches (0.30–0.89): ${this.stats.ambiguous_matches}`);
    console.log(`  Unknown identities: ${this.stats.unknown_identities}`);

    console.log(`\nPostgres Table Coverage:`);
    console.log(`  atlas_packets with qdrant_point_id: ${this.stats.atlas_packets_with_qdrant_id} (backfill potential)`);
    console.log(`  atlas_packets without qdrant_point_id: ${this.stats.atlas_packets_without_qdrant_id} (needs backlink)`);
    console.log(`  codebase_chunk_index with qdrant_id: ${this.stats.codebase_chunk_with_qdrant_id}\n`);
    for (const [table, index] of [
      ['atlas_packets.qdrant_point_id', this.atlasPacketsById],
      ['codebase_chunk_index.qdrant_id', this.chunksByQdrantId],
      ['codebase_chunk_index.id', this.chunksByPrimaryId],
    ]) {
      const coverage = summarizePointIdCoverageV1(index);
      console.log(`  ${table}: distinct=${coverage.distinctIds}, unique=${coverage.uniqueIds}, duplicate IDs=${coverage.duplicateIds}, observed in Qdrant=${coverage.matchedIds}, unique IDs missing from Qdrant=${coverage.missingIds}`);
    }
    console.log('  Note: packet-key matches are identity hints, not proof of point-ID or revision parity.\n');
    console.log(`  Qdrant payloads complete for projection lineage fields: ${this.stats.qdrant_payload_lineage_complete}/${this.stats.total_points}`);
    console.log(`  Qdrant points with a unique PostgreSQL point-ID owner: ${this.stats.qdrant_points_with_unique_pg_point_id}/${this.stats.total_points}`);
    console.log(`  Qdrant points without a unique PostgreSQL point-ID owner: ${this.stats.qdrant_points_without_unique_pg_point_id}/${this.stats.total_points}`);
    console.log('  Payload field coverage (presence only; values are not independently validated):');
    for (const field of QDRANT_PROJECTION_LINEAGE_FIELDS_V1) {
      console.log(`    ${field}: ${this.stats.qdrant_payload_field_coverage[field]}/${this.stats.total_points}`);
    }
    console.log('  Stored vectors were not fetched, dimension-checked, or checksummed.\n');
    console.log('  Payload cohort values (top 20; projection timestamps grouped by UTC date):');
    for (const [field, counts] of Object.entries(this.stats.qdrant_payload_cohorts)) {
      const top = [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 20);
      console.log(`    ${field}: ${JSON.stringify(Object.fromEntries(top))}`);
    }
  }

  async run() {
    try {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('   Qdrant/Postgres Identity Audit (Read-Only)');
      console.log(`   Collection: ${QDRANT_COLLECTION}`);
      console.log('═══════════════════════════════════════════════════════════════\n');

      if (!isReadOnly) {
        console.log('⚠️  WARNING: Apply mode detected. This script is READ-ONLY.\n');
        process.exit(1);
      }

      if (outputLedger && !resume) {
        writeFileSync(outputLedger, '', { flag: 'wx' });
      }

      await this.loadPostgresData();
      await this.auditAllPoints();
      this.reportStats();

      console.log('✅ Audit complete.');
      if (outputLedger) console.log(`   Ledger: ${outputLedger}`);
      console.log(`   Next: Review ledger, then run backfill planner\n`);

      await this.pgPool.end();
      process.exit(0);
    } catch (err) {
      console.error('❌ Error:', err.message);
      process.exit(1);
    }
  }
}

const audit = new QdrantPostgresAudit();
audit.run();
