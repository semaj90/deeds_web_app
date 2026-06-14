#!/usr/bin/env node
/**
 * Debug Qdrant Legacy/Ambiguous Slice
 *
 * Purpose: Classify each unresolved Qdrant point and determine repair strategy
 * Output: Detailed classification report for manual review
 *
 * Strategy:
 *   1. Fetch all Qdrant points with source_ref/sourceRef/canonicalSourceRef
 *   2. Try to match each against postgres canonical packet identity
 *   3. Classify: canonical_match | legacy_alias_match | ambiguous_skip | no_candidate | orphan
 *   4. Output detailed audit for each point
 *   5. Report statistics and repair recommendations
 *
 * Rules:
 *   - Never join by feature_id alone
 *   - Prefer packet_key, then source_ref, then normalized file_path
 *   - Skip ambiguous (multiple candidates with equal confidence)
 *   - Quarantine orphans (no postgres match possible)
 *   - Preserve original payload; recommend repair in separate script
 *
 * Usage:
 *   node scripts/atlas/debug-qdrant-legacy-ambiguous-slice.mjs [--limit 100]
 */

import pg from 'pg';
import http from 'http';
import { config } from 'dotenv';
import { resolve } from 'path';
import fs from 'fs/promises';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const limit = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '1000');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Debug Qdrant Legacy/Ambiguous Slice                           ║');
console.log(`║  Limit: ${limit} points                                         ║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ── Qdrant API Helper ──────────────────────────────────────────────────────

async function qdrantRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 6333,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Normalization Helper ───────────────────────────────────────────────────

function normalizePath(p) {
  if (!p) return '';
  return p.replace(/^sveltekit-frontend\//, '').replace(/\\/g, '/').split('?')[0].split('#')[0];
}

// ── Main Debug Function ────────────────────────────────────────────────────

async function debugQdrantSlice() {
  console.log('📊 Step 1: Fetch Postgres canonical packet identity\n');

  // Build lookup maps
  const pgResult = await pgPool.query(`
    SELECT packet_key, source_ref, file_path, feature_id, feature_label
    FROM atlas_codebase_packets
    ORDER BY packet_key
  `);

  const pgPackets = pgResult.rows;
  console.log(`   ✅ Fetched ${pgPackets.length} canonical packets\n`);

  const pgByPacketKey = new Map(pgPackets.map(p => [p.packet_key, p]));
  const pgBySourceRef = new Map(pgPackets.map(p => [normalizePath(p.source_ref), p]));
  const pgByFilePath = new Map(pgPackets.map(p => [normalizePath(p.file_path), p]));

  console.log('📦 Step 2: Fetch Qdrant points (scroll)\n');

  let allPoints = [];
  let nextOffset = undefined;
  let fetchCount = 0;

  do {
    const response = await qdrantRequest('POST', '/collections/codebase_chunks_768/points/scroll', {
      limit: 1000,
      with_payload: true,
      with_vectors: false,
      offset: nextOffset
    });

    const points = response.data?.result?.points || [];
    allPoints = [...allPoints, ...points];
    nextOffset = response.data?.result?.next_page_offset;
    fetchCount++;

    if (fetchCount % 5 === 0) {
      console.log(`   ⏳ Fetched ${allPoints.length} points...`);
    }
  } while (nextOffset && allPoints.length < limit);

  // Trim to limit
  allPoints = allPoints.slice(0, limit);
  console.log(`   ✅ Total points fetched: ${allPoints.length}\n`);

  console.log('🔍 Step 3: Classify each point\n');

  const classifications = {
    canonical_match: 0,
    legacy_alias_match: 0,
    ambiguous_skip: 0,
    no_candidate: 0,
    orphan_quarantine: 0,
    missing_source_ref: 0
  };

  const detailedAudit = [];

  for (let i = 0; i < allPoints.length; i++) {
    const point = allPoints[i];
    const payload = point.payload || {};

    // Extract all possible ref fields
    const packetKey = payload.packet_key;
    const sourceRef = payload.source_ref || payload.sourceRef;
    const canonicalSourceRef = payload.canonicalSourceRef;
    const filePath = payload.file_path || payload.path;

    if (!sourceRef) {
      detailedAudit.push({
        point_id: point.id,
        payload_source_ref: sourceRef,
        payload_sourceRef: payload.sourceRef,
        payload_canonicalSourceRef: canonicalSourceRef,
        payload_packet_key: packetKey,
        decision: 'missing_source_ref',
        reason: 'No source_ref, sourceRef, or path in payload'
      });
      classifications.missing_source_ref++;
      continue;
    }

    let pgMatch = null;
    let matchType = null;
    let candidates = [];

    // Strategy 1: Exact packet_key match
    if (packetKey && pgByPacketKey.has(packetKey)) {
      pgMatch = pgByPacketKey.get(packetKey);
      matchType = 'canonical_match';
    }

    // Strategy 2: Exact source_ref match
    if (!pgMatch) {
      const normalized = normalizePath(sourceRef);
      if (pgBySourceRef.has(normalized)) {
        pgMatch = pgBySourceRef.get(normalized);
        matchType = 'legacy_alias_match';
      } else {
        // Collect partial candidates for diagnostics
        for (const [ref, pkt] of pgBySourceRef) {
          if (ref.includes(normalized) || normalized.includes(ref.split('/').pop())) {
            candidates.push(pkt);
          }
        }
      }
    }

    // Strategy 3: Exact file_path match
    if (!pgMatch && !candidates.length) {
      const normalized = normalizePath(filePath || sourceRef);
      if (pgByFilePath.has(normalized)) {
        pgMatch = pgByFilePath.get(normalized);
        matchType = 'legacy_alias_match';
      }
    }

    // Classify
    let decision = 'no_candidate';
    let reason = 'No postgres match found';

    if (pgMatch && matchType === 'canonical_match') {
      decision = 'canonical_match';
      reason = `Exact packet_key match`;
      classifications.canonical_match++;
    } else if (pgMatch && matchType === 'legacy_alias_match') {
      decision = 'legacy_alias_match';
      reason = `Legacy ref matches canonical source_ref/file_path`;
      classifications.legacy_alias_match++;
    } else if (candidates.length > 1) {
      decision = 'ambiguous_skip';
      reason = `${candidates.length} candidate packets with equal confidence`;
      classifications.ambiguous_skip++;
    } else if (candidates.length === 1) {
      // Single candidate is safe
      pgMatch = candidates[0];
      decision = 'legacy_alias_match';
      reason = `Single candidate packet by partial source_ref match`;
      classifications.legacy_alias_match++;
    } else {
      decision = 'orphan_quarantine';
      reason = `No postgres packet found; may be legacy-only or orphaned`;
      classifications.orphan_quarantine++;
    }

    detailedAudit.push({
      point_id: point.id,
      payload_source_ref: sourceRef,
      payload_sourceRef: payload.sourceRef,
      payload_canonicalSourceRef: canonicalSourceRef,
      payload_packet_key: packetKey,
      normalized_ref: normalizePath(sourceRef),
      postgres_candidates: candidates.length > 0 ? candidates.map(c => ({ packet_key: c.packet_key, source_ref: c.source_ref })) : null,
      candidate_count: candidates.length,
      matched_packet_key: pgMatch?.packet_key || null,
      matched_source_ref: pgMatch?.source_ref || null,
      decision,
      reason
    });

    if ((i + 1) % 500 === 0) {
      console.log(`   ⏳ Classified ${i + 1}/${allPoints.length} points...`);
    }
  }

  console.log(`\n   ✅ Classification complete\n`);

  // Summary stats
  console.log('📈 Classification Summary:\n');
  for (const [key, count] of Object.entries(classifications)) {
    const pct = (count / allPoints.length * 100).toFixed(1);
    console.log(`   ${key}: ${count} (${pct}%)`);
  }

  // Calculate safe repair candidates
  const safeRepair = classifications.canonical_match + classifications.legacy_alias_match;
  console.log(`\n   Safe repair candidates: ${safeRepair} (${(safeRepair / allPoints.length * 100).toFixed(1)}%)`);
  console.log(`   Must skip: ${classifications.ambiguous_skip} (${(classifications.ambiguous_skip / allPoints.length * 100).toFixed(1)}%)`);
  console.log(`   Orphans: ${classifications.orphan_quarantine} (${(classifications.orphan_quarantine / allPoints.length * 100).toFixed(1)}%)\n`);

  // Write audit report
  const auditJson = {
    timestamp: new Date().toISOString(),
    limit,
    total_points_analyzed: allPoints.length,
    classifications,
    detailed_audit: detailedAudit.slice(0, 100) // First 100 for manual review
  };

  const auditPath = 'docs/reports/qdrant-legacy-ambiguous-slice-debug.json';
  await fs.mkdir('docs/reports', { recursive: true });
  await fs.writeFile(auditPath, JSON.stringify(auditJson, null, 2));
  console.log(`   ✅ Audit written: ${auditPath}\n`);

  // Write markdown summary
  const mdSummary = `# Qdrant Legacy/Ambiguous Slice Debug

**Date**: ${new Date().toISOString()}
**Points Analyzed**: ${allPoints.length}
**Limit**: ${limit}

## Classification Summary

| Category | Count | % | Action |
|----------|-------|---|--------|
| canonical_match | ${classifications.canonical_match} | ${(classifications.canonical_match / allPoints.length * 100).toFixed(1)}% | ✅ Safe repair |
| legacy_alias_match | ${classifications.legacy_alias_match} | ${(classifications.legacy_alias_match / allPoints.length * 100).toFixed(1)}% | ✅ Safe repair |
| ambiguous_skip | ${classifications.ambiguous_skip} | ${(classifications.ambiguous_skip / allPoints.length * 100).toFixed(1)}% | 🚫 Skip (multiple candidates) |
| no_candidate | ${classifications.no_candidate} | ${(classifications.no_candidate / allPoints.length * 100).toFixed(1)}% | ⏸️ Manual review |
| orphan_quarantine | ${classifications.orphan_quarantine} | ${(classifications.orphan_quarantine / allPoints.length * 100).toFixed(1)}% | 🔒 Quarantine (legacy-only) |
| missing_source_ref | ${classifications.missing_source_ref} | ${(classifications.missing_source_ref / allPoints.length * 100).toFixed(1)}% | 📋 Data quality issue |

## Repair Strategy

**Safe to repair**: ${safeRepair} points (${(safeRepair / allPoints.length * 100).toFixed(1)}%)
- canonical_match: use packet_key directly
- legacy_alias_match: update source_ref/sourceRef to canonical form

**Must skip**: ${classifications.ambiguous_skip} points
- Multiple candidates with equal confidence
- Would risk false joins

**Quarantine**: ${classifications.orphan_quarantine} points
- No postgres match possible
- Keep as legacy-only without mutation

## Next Steps

1. Review first 100 points in detailed audit
2. Confirm safe repair candidates (canonical + legacy_alias)
3. Run repair script with --limit=500 --dry-run
4. After approval, run with --apply
5. Re-run verify gate to confirm clean

## Gate Status

- packet_key coverage: pending repair
- lineage_version coverage: pending repair
- ambiguous entries: explained and skipped
- Qdrant verify: ready for next repair script
`;

  await fs.writeFile('docs/reports/qdrant-legacy-ambiguous-slice-debug.md', mdSummary);
  console.log(`   ✅ Summary written: docs/reports/qdrant-legacy-ambiguous-slice-debug.md\n`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  try {
    await debugQdrantSlice();
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  Debug Complete ✅                                             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main();
