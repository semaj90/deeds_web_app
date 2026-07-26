#!/usr/bin/env node
/**
 * Qdrant/Postgres Identity Audit — Read-Only Lane Classification
 *
 * Classifies all 54K+ Qdrant points into identity lanes by matching against
 * Postgres atlas_packets and codebase_chunk_index tables.
 *
 * **CRITICAL**: This is READ-ONLY. No Qdrant or Postgres mutations.
 *
 * Usage:
 *   node scripts/atlas/qdrant-postgres-identity-audit.mjs [--ledger output.ndjson] [--dry-run]
 *
 * Output:
 *   - NDJSON ledger with per-point classification
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

import { createReadStream } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import * as path from 'node:path';

// Qdrant client
import { QdrantClient } from '@qdrant/qdrant-js';

// Postgres (pg-promise or direct pool)
import pg from 'pg';

const argv = process.argv.slice(2);
const outputLedger = argv.find(a => a.startsWith('--ledger='))?.split('=')[1] || 'qdrant-alignment-ledger.ndjson';
const limitArg = argv.find(a => a.startsWith('--limit='))?.split('=')[1];
const auditLimit = limitArg ? parseInt(limitArg, 10) : null; // null = no limit, otherwise stop after N points
const isDryRun = argv.includes('--dry-run');
const isReadOnly = !argv.includes('--apply');

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const POSTGRES_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

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
    };
    this.ledger = [];
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
      this.atlasPacketsByKey.set(row.packet_key, row);
      if (row.qdrant_point_id) {
        this.atlasPacketsById.set(row.qdrant_point_id, row);
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

    // Load codebase_chunk_index by qdrant_id
    const chunkResult = await this.pgPool.query(
      'SELECT qdrant_id, chunk_id, source_ref FROM codebase_chunk_index WHERE qdrant_id IS NOT NULL'
    );
    this.chunksByQdrantId = new Map();
    this.chunksBySourceRef = new Map();

    for (const row of chunkResult.rows) {
      this.chunksByQdrantId.set(row.qdrant_id, row);
      if (!this.chunksBySourceRef.has(row.source_ref)) {
        this.chunksBySourceRef.set(row.source_ref, []);
      }
      this.chunksBySourceRef.get(row.source_ref).push(row);
      this.stats.codebase_chunk_with_qdrant_id++;
    }

    console.log(`   ✅ Loaded ${chunkResult.rows.length} codebase_chunk_index rows\n`);
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
      const matches = this.atlasPacketsByKey.get(payload.packet_key);
      if (matches) {
        // Verify it's truly a single match
        const allMatches = Array.from(this.atlasPacketsByKey.values()).filter(
          row => row.packet_key === payload.packet_key
        );
        if (allMatches.length === 1) {
          return {
            lane: 'EXACT_ATLAS_PACKET_KEY',
            confidence: 0.99,
            match_type: 'payload_packet_key',
            evidence: {
              payload_packet_key: payload.packet_key,
              postgres_packet_key: matches.packet_key,
              postgres_row: matches.packet_key,
            },
          };
        } else if (allMatches.length > 1) {
          return {
            lane: 'AMBIGUOUS_PACKET_KEY',
            confidence: 0.3,
            match_type: 'ambiguous',
            evidence: {
              packet_key: payload.packet_key,
              matching_rows: allMatches.length,
            },
          };
        }
      }
    }

    // Step 3: Point UUID → atlas_packets.qdrant_point_id
    if (typeof point.id === 'string') {
      const atlasMatch = this.atlasPacketsById.get(point.id);
      if (atlasMatch) {
        return {
          lane: 'EXACT_ATLAS_QDRANT_ID',
          confidence: 0.95,
          match_type: 'qdrant_id_backlink',
          evidence: {
            qdrant_point_id: point.id,
            postgres_table: 'atlas_packets',
            postgres_row: atlasMatch.packet_key,
          },
        };
      }

      // Step 4: Point UUID → codebase_chunk_index.qdrant_id
      const chunkMatch = this.chunksByQdrantId.get(point.id);
      if (chunkMatch) {
        return {
          lane: 'EXACT_CHUNK_QDRANT_ID',
          confidence: 0.90,
          match_type: 'chunk_qdrant_id_backlink',
          evidence: {
            qdrant_point_id: point.id,
            postgres_table: 'codebase_chunk_index',
            postgres_row: chunkMatch.chunk_id,
          },
        };
      }

      // Step 5: Check if point is in both tables
      if (atlasMatch && chunkMatch) {
        return {
          lane: 'EXACT_BOTH_TABLES',
          confidence: 0.98,
          match_type: 'both_qdrant_id',
          evidence: {
            qdrant_point_id: point.id,
            in_atlas_packets: true,
            in_codebase_chunk_index: true,
          },
        };
      }
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
      } else if (atlasMatches.length > 1) {
        return {
          lane: 'AMBIGUOUS_SOURCE_REF',
          confidence: 0.2,
          match_type: 'source_ref_multiple',
          evidence: {
            source_ref: payload.source_ref,
            matching_rows: atlasMatches.length,
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
      } else if (chunkMatches.length > 1) {
        return {
          lane: 'AMBIGUOUS_SOURCE_REF',
          confidence: 0.2,
          match_type: 'source_ref_chunk_multiple',
          evidence: {
            source_ref: payload.source_ref,
            matching_rows: chunkMatches.length,
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
    let offset = undefined;
    let batchCount = 0;
    const seenPointIds = new Set();

    // Safety ceiling: do not scan more than expected + 10%
    const collectionInfo = await this.qdrantClient.getCollection('codebase_chunks_768');
    const expectedCount = collectionInfo.points_count || 54224;
    const maximumScan = auditLimit ? Math.min(auditLimit, Math.ceil(expectedCount * 1.1)) : Math.ceil(expectedCount * 1.1);

    while (true) {
      const scrollResult = await this.qdrantClient.scroll('codebase_chunks_768', {
        limit: 100,
        offset: offset,  // Correct parameter: offset, not point_id_selector
        with_payload: true,
        with_vectors: false,
      });

      if (!scrollResult?.points || scrollResult.points.length === 0) break;

      batchCount++;
      console.log(`   Batch ${batchCount}: processing ${scrollResult.points.length} points`);

      for (const point of scrollResult.points) {
        // LIMIT CHECK: Stop after N points if --limit specified
        if (auditLimit && seenPointIds.size >= auditLimit) {
          console.log(`   ⏸️  Limit reached (${auditLimit} points). Stopping audit.`);
          break;
        }

        // Cycle detection: ensure no point ID repeats
        const pointKey = String(point.id);
        if (seenPointIds.has(pointKey)) {
          throw new Error(`PAGINATION CYCLE DETECTED: Point ID ${pointKey} was returned twice. Qdrant offset may not be advancing correctly.`);
        }
        seenPointIds.add(pointKey);

        // Safety check: total scanned > expected
        if (seenPointIds.size > maximumScan) {
          throw new Error(`SCAN EXCEEDED SAFETY CEILING: Scanned ${seenPointIds.size} unique points but expected ~${expectedCount}. Audit loop may be stuck.`);
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
        this.ledger.push({
          qdrant_point_id: point.id,
          id_type: typeof point.id,
          payload_packet_key: point.payload?.packet_key,
          payload_source_ref: point.payload?.source_ref,
          classification_lane: classification.lane,
          confidence: classification.confidence,
          match_type: classification.match_type,
          evidence: classification.evidence,
        });
      }

      // LIMIT CHECK: Break outer loop if limit reached
      if (auditLimit && seenPointIds.size >= auditLimit) {
        break;
      }

      // Advance pagination: next_page_offset is numeric or null/undefined
      // Explicit null/undefined check to avoid falsey 0
      if (scrollResult.next_page_offset === null || scrollResult.next_page_offset === undefined) {
        break;
      }
      offset = scrollResult.next_page_offset;
    }

    console.log(`   ✅ Audited ${this.stats.total_points} unique points (scanned ${seenPointIds.size} total)\n`);
  }

  async writeLedger() {
    console.log(`📝 Writing NDJSON ledger to ${outputLedger}...`);

    return new Promise((resolve, reject) => {
      const outStream = createWriteStream(outputLedger);
      outStream.on('error', reject);

      for (const entry of this.ledger) {
        // Use replacer to handle BigInt serialization
        const json = JSON.stringify(entry, (_, value) => {
          if (typeof value === 'bigint') {
            return value.toString();
          }
          return value;
        });
        outStream.write(json + '\n');
      }

      outStream.end();
      outStream.on('finish', () => {
        console.log(`   ✅ Wrote ${this.ledger.length} entries\n`);
        resolve();
      });
    });
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
  }

  async run() {
    try {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('   Qdrant/Postgres Identity Audit (Read-Only)');
      console.log('═══════════════════════════════════════════════════════════════\n');

      if (!isReadOnly) {
        console.log('⚠️  WARNING: Apply mode detected. This script is READ-ONLY.\n');
        process.exit(1);
      }

      await this.loadPostgresData();
      await this.auditAllPoints();
      await this.writeLedger();
      this.reportStats();

      console.log('✅ Audit complete.');
      console.log(`   Ledger: ${outputLedger}`);
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
