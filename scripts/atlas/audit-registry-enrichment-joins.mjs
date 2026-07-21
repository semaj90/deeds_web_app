#!/usr/bin/env node

/**
 * Audit: Registry Enrichment Joins
 *
 * Question: Of the 5,982 topology-authority rows written by backfill-topology-authority.mjs,
 * how many map to the 4,209 registry rows? Where is the join gap?
 *
 * Output explains:
 * - packet_key exact matches
 * - source_ref fallback matches
 * - ambiguous source_refs (multiple packets per ref)
 * - unmatched registry rows
 * - why topology lane shows 1.85% despite 100% packet join coverage
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { buildPacketIdentityIndexes, resolvePacketIdentity, normalizeAtlasSourceRef } from '../../packages/atlas/lib/packet-identity-bridge.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env.local') });
dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env') });

const { Pool } = pg;
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const dryRun = args.includes('--dry-run');

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
});

async function main() {
  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║      Audit: Registry Enrichment Join Gaps                  ║`);
  console.log(`║      (Understand 5,982 topology-authority → 4,209 registry)║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);

  try {
    // 1. Load canonical packet identity index
    console.log('STEP 1: Load canonical packet identities...');
    const packetRes = await pool.query(`
      SELECT
        packet_key,
        source_ref,
        NULL::text as canonical_source_ref,
        NULL::text as source_ref_key
      FROM atlas_packets
      WHERE community_id IS NOT NULL
    `);
    const packetRows = packetRes.rows;
    console.log(`  ✓ Loaded ${packetRows.length} packets with topology authority\n`);

    // 2. Build index
    console.log('STEP 2: Index packet identities...');
    const indexes = buildPacketIdentityIndexes(packetRows);
    console.log(`  ✓ By packet_key: ${indexes.byPacketKey.size} entries`);
    console.log(`  ✓ By source_ref: ${indexes.bySourceRef.size} entries`);
    console.log(`  ✓ Ambiguous source_refs: ${indexes.ambiguousSourceRefs.size}\n`);

    // 3. Load registry rows (mock structure for audit)
    console.log('STEP 3: Load feature registry...');
    const registryPath = path.join(__dirname, '../../docs/atlas/feature-registry.json');
    let registryRows = [];
    if (fs.existsSync(registryPath)) {
      const registryData = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      registryRows = Array.isArray(registryData) ? registryData : registryData.features || [];
    } else {
      console.log(`  ⚠ Registry not found at ${registryPath}`);
      console.log(`  → Using placeholder schema\n`);
      registryRows = [];
    }

    if (registryRows.length === 0) {
      console.log(`  ⚠ No registry rows loaded (file missing or empty)\n`);
      console.log('RESOLUTION RESULTS:');
      console.log(`  Total registry rows: 0`);
      console.log(`  Cannot complete audit without feature-registry.json\n`);
      await pool.end();
      process.exit(0);
    }

    console.log(`  ✓ Loaded ${registryRows.length} registry rows\n`);

    // 4. Resolve each registry row
    console.log('STEP 4: Resolve registry rows to packet identities...');
    const resolved = [];
    const ambiguous = [];
    const unmatched = [];

    for (const registryRow of registryRows) {
      const sourceRefs = Array.isArray(registryRow.sourceRefs) ? registryRow.sourceRefs : [];
      const canonicalRefs = sourceRefs
        .map(normalizeAtlasSourceRef)
        .filter(Boolean);

      let matchFound = false;
      let matchMethod = 'unmatched';

      for (const sourceRef of canonicalRefs) {
        if (indexes.ambiguousSourceRefs.has(sourceRef)) {
          ambiguous.push({
            featureKey: registryRow.featureKey || registryRow.name,
            sourceRef,
          });
          matchFound = true;
          matchMethod = 'ambiguous_source_ref';
          break;
        }

        const packetMatch = indexes.bySourceRef.get(sourceRef);
        if (packetMatch) {
          resolved.push({
            featureKey: registryRow.featureKey || registryRow.name,
            sourceRef,
            packetKey: packetMatch.packet_key,
            method: 'canonical_source_ref',
          });
          matchFound = true;
          matchMethod = 'canonical_source_ref';
          break;
        }
      }

      if (!matchFound && !ambiguous.some(a => a.featureKey === (registryRow.featureKey || registryRow.name))) {
        unmatched.push({
          featureKey: registryRow.featureKey || registryRow.name,
          sourceRefs: canonicalRefs,
        });
      }
    }

    console.log(`  ✓ Resolved: ${resolved.length}`);
    console.log(`  ⚠ Ambiguous: ${ambiguous.length}`);
    console.log(`  ✗ Unmatched: ${unmatched.length}\n`);

    // 5. Analyze topology readiness for resolved rows
    console.log('STEP 5: Analyze topology readiness for resolved rows...');
    let topologyReady = 0;
    if (resolved.length > 0) {
      const packetKeys = resolved.map(r => `'${r.packetKey}'`).join(',');
      const topologyRes = await pool.query(`
        SELECT COUNT(*) as ready
        FROM atlas_packets ap
        WHERE ap.packet_key IN (${packetKeys})
          AND ap.community_id IS NOT NULL
          AND (
            ap.payload->'topology_materialized' IS NOT NULL
            OR ap.payload->>'pagerank_score' IS NOT NULL
            OR ap.payload->>'som_cluster' IS NOT NULL
          )
      `);
      topologyReady = topologyRes.rows[0]?.ready || 0;
    }

    console.log(`  Topology-ready (resolved packets): ${topologyReady}/${resolved.length}\n`);

    // 6. Summary report
    console.log('╔═ RESOLUTION RESULTS ════════════════════════════════════════╗');
    console.log(`║ Total registry rows:           ${String(registryRows.length).padEnd(37)}║`);
    console.log(`║ Resolved (source_ref match):   ${String(resolved.length).padEnd(37)}║`);
    console.log(`║ Ambiguous source_refs:         ${String(ambiguous.length).padEnd(37)}║`);
    console.log(`║ Unmatched:                     ${String(unmatched.length).padEnd(37)}║`);
    console.log(`║                                                            ║`);
    console.log(`║ Registry alignment coverage:   ${String((100.0 * resolved.length / registryRows.length).toFixed(2) + '%').padEnd(37)}║`);
    console.log(`║ Topology-ready (aligned):      ${String(topologyReady).padEnd(37)}║`);
    console.log(`╚════════════════════════════════════════════════════════════╝\n`);

    // 7. Export detailed results
    const reportPath = path.join(__dirname, '../../docs/reports/registry-enrichment-audit.json');
    const reportData = {
      timestamp: new Date().toISOString(),
      packet_count: packetRows.length,
      registry_count: registryRows.length,
      resolution: {
        resolved: resolved.length,
        ambiguous: ambiguous.length,
        unmatched: unmatched.length,
        resolved_pct: (100.0 * resolved.length / registryRows.length).toFixed(2),
      },
      topology_readiness: {
        total_resolved: resolved.length,
        topology_ready: topologyReady,
        topology_ready_pct: resolved.length > 0 ? (100.0 * topologyReady / resolved.length).toFixed(2) : 0,
      },
    };

    if (!dryRun) {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
      console.log(`✓ Report written to: ${reportPath}\n`);
    }

    // 8. Verbose output
    if (verbose) {
      console.log('═ SAMPLE RESOLVED ROWS (first 5) ═════════════════════════════');
      resolved.slice(0, 5).forEach(r => {
        console.log(`  ${r.featureKey} → ${r.packetKey}`);
      });

      if (ambiguous.length > 0) {
        console.log('\n═ SAMPLE AMBIGUOUS ROWS (first 3) ══════════════════════════');
        ambiguous.slice(0, 3).forEach(a => {
          console.log(`  ${a.featureKey}: multiple packets for ${a.sourceRef}`);
        });
      }

      if (unmatched.length > 0) {
        console.log('\n═ SAMPLE UNMATCHED ROWS (first 3) ══════════════════════════');
        unmatched.slice(0, 3).forEach(u => {
          console.log(`  ${u.featureKey}: [${u.sourceRefs.slice(0, 2).join(', ')}]`);
        });
      }
    }

    console.log('✅ Audit complete.\n');
    await pool.end();
    process.exit(0);

  } catch (err) {
    console.error('❌ ERROR:', err.message);
    if (verbose) console.error(err.stack);
    await pool.end();
    process.exit(1);
  }
}

main();
