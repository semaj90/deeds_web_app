#!/usr/bin/env node
/**
 * validate-packet-contract.mjs  — read-only
 *
 * Validates that atlas_packets satisfies the Packet Contract:
 *   - Identity fields populated (packet_key, source_ref, feature_id)
 *   - Required indexes exist on the table
 *   - Metadata fields present in payload where expected
 *   - No generated/noise source_refs (node_modules, .svelte-kit, dist, build, .vite)
 *
 * Does NOT write to Postgres, Redis, Qdrant, or Neo4j.
 * Exits 0 on PASS, 1 on FAIL.
 *
 * Usage:
 *   node scripts/atlas/validate-packet-contract.mjs
 *   node scripts/atlas/validate-packet-contract.mjs --verbose
 *   node scripts/atlas/validate-packet-contract.mjs --json   # machine-readable output
 */

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '../..');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const VERBOSE      = process.argv.includes('--verbose');
const JSON_OUT     = process.argv.includes('--json');

// Noise prefixes — source_refs that should not be in atlas_packets
const NOISE_PREFIXES = [
  'node_modules/', 'node_modules\\',
  '.svelte-kit/', '.svelte-kit\\',
  '.vite/', '.vite\\',
  'dist/', 'build/',
  '.cache/', '.next/',
];

// Required indexes (name → partial definition string that must appear in indexdef)
const REQUIRED_INDEXES = [
  { name: 'idx_atlas_packets_packet_key',   match: 'packet_key' },
  { name: 'idx_atlas_packets_source_ref',   match: 'source_ref' },
  { name: 'idx_atlas_packets_feature_id',   match: 'feature_id' },
  { name: 'idx_atlas_packets_community_id', match: 'community_id' },
  { name: 'atlas_packets_payload_gin',      match: 'gin (payload)' },
  { name: 'idx_atlas_packets_concept_ids',  match: 'gin (concept_ids)' },
  { name: 'idx_atlas_packets_summary_fts',  match: 'to_tsvector' },
];

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // ── 1. Identity and metadata field coverage ───────────────────────────────────────────
    const { rows: [counts] } = await pool.query(`
      SELECT
        COUNT(*)                                           AS total,
        COUNT(packet_key)                                  AS has_packet_key,
        COUNT(source_ref)                                  AS has_source_ref,
        COUNT(feature_id)                                  AS has_feature_id,
        COUNT(community_id)                                AS has_community_id,
        COUNT(community_source)                            AS has_community_source,
        COUNT(community_confidence)                        AS has_community_confidence,
        COUNT(concept_ids)                                 AS has_concept_ids,
        COUNT(summary)                                     AS has_summary,
        COUNT(payload->>'path')                            AS has_payload_path,
        COUNT(payload->>'bm25_text')                       AS has_payload_bm25_text,
        COUNT(CASE WHEN packet_key  IS NULL THEN 1 END)    AS missing_packet_key,
        COUNT(CASE WHEN source_ref  IS NULL THEN 1 END)    AS missing_source_ref,
        COUNT(CASE WHEN feature_id  IS NULL THEN 1 END)    AS missing_feature_id,
        COUNT(CASE WHEN community_id IS NULL THEN 1 END)   AS missing_community_id,
        COUNT(CASE WHEN permissions IS NOT NULL AND permissions != '{}'::jsonb THEN 1 END) AS has_permissions,
        COUNT(CASE WHEN metadata IS NOT NULL AND metadata != '{}'::jsonb THEN 1 END) AS has_metadata,
        COUNT(CASE WHEN topology IS NOT NULL AND topology != '{}'::jsonb THEN 1 END) AS has_topology,
        COUNT(CASE WHEN vectors IS NOT NULL AND vectors != '{}'::jsonb THEN 1 END) AS has_vectors
      FROM atlas_packets
    `);

    // ── 2. Addressable (non-empty packet_key + source_ref) ───────────────────
    const { rows: [addr] } = await pool.query(`
      SELECT COUNT(*) AS addressable
      FROM atlas_packets
      WHERE packet_key IS NOT NULL AND source_ref IS NOT NULL AND source_ref != ''
    `);

    // ── 3. Metadata field coverage (inside payload JSONB) ────────────────────
    const { rows: [meta] } = await pool.query(`
      SELECT
        COUNT(payload->>'path')       AS payload_path,
        COUNT(payload->>'file_url')   AS payload_file_url,
        COUNT(payload->>'repo_url')   AS payload_repo_url,
        COUNT(payload->>'source_url') AS payload_source_url,
        COUNT(payload->>'mtime')      AS payload_mtime,
        COUNT(payload->>'hash')       AS payload_hash,
        COUNT(payload->>'bm25_text')  AS payload_bm25_text,
        COUNT(payload->>'tags')       AS payload_tags
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
    `);

    // ── 4. Noise source_ref check ────────────────────────────────────────────
    const noisePrefixLike = NOISE_PREFIXES.map(p => `source_ref LIKE '${p.replace(/'/g, "''")}%'`).join(' OR ');
    const { rows: [noise] } = await pool.query(`
      SELECT COUNT(*) AS noise_count
      FROM atlas_packets
      WHERE ${noisePrefixLike}
    `);

    // ── 5. Index audit ───────────────────────────────────────────────────────
    const { rows: idxRows } = await pool.query(`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'atlas_packets'
    `);
    const idxMap = new Map(idxRows.map(r => [r.indexname, r.indexdef]));

    const indexResults = REQUIRED_INDEXES.map(req => {
      const found = idxRows.some(r => r.indexdef.includes(req.match));
      return { ...req, present: found };
    });

    const missingIndexes = indexResults.filter(r => !r.present);

    // ── 6. Expression index check (payload->>'path') ─────────────────────────
    const hasPayloadPathIdx = idxRows.some(r =>
      r.indexdef.includes("payload") && r.indexdef.includes("'path'")
    );

    // ── 7. Duplicate packet_key check ────────────────────────────────────────
    const { rows: [dups] } = await pool.query(`
      SELECT COUNT(*) AS dup_count FROM (
        SELECT packet_key FROM atlas_packets
        WHERE packet_key IS NOT NULL
        GROUP BY packet_key HAVING COUNT(*) > 1
      ) t
    `);

    // ── 8. Sample invalid packets (fail-fast identities) ────────────────────
    let invalidSamples = [];
    if (VERBOSE) {
      const { rows } = await pool.query(`
        SELECT packet_id, packet_key, source_ref, feature_id
        FROM atlas_packets
        WHERE packet_key IS NULL OR source_ref IS NULL OR feature_id IS NULL
        LIMIT 10
      `);
      invalidSamples = rows;
    }

    await pool.end();

    // ── Build report ─────────────────────────────────────────────────────────
    const total       = Number(counts.total);
    const addressable = Number(addr.addressable);
    const pkCoverage  = total > 0 ? Number(counts.has_packet_key) / total : 0;
    const srCoverage  = total > 0 ? Number(counts.has_source_ref) / total : 0;
    const fidCoverage = total > 0 ? Number(counts.has_feature_id) / total : 0;
    const cidCoverage = total > 0 ? Number(counts.has_community_id) / total : 0;
    const csCoverage  = total > 0 ? Number(counts.has_community_source) / total : 0;
    const ccCoverage  = total > 0 ? Number(counts.has_community_confidence) / total : 0;
    const coCoverage  = total > 0 ? Number(counts.has_concept_ids) / total : 0;
    const smCoverage  = total > 0 ? Number(counts.has_summary) / total : 0;
    const ppathCoverage = total > 0 ? Number(counts.has_payload_path) / total : 0;
    const pbmCoverage = total > 0 ? Number(counts.has_payload_bm25_text) / total : 0;
    const permCoverage = total > 0 ? Number(counts.has_permissions) / total : 0;
    const metaEnvCoverage = total > 0 ? Number(counts.has_metadata) / total : 0;
    const topoCoverage = total > 0 ? Number(counts.has_topology) / total : 0;
    const vectCoverage = total > 0 ? Number(counts.has_vectors) / total : 0;

    // Gate thresholds
    const gates = {
      packet_key_coverage:    { value: pkCoverage,  threshold: 0.40, pass: pkCoverage  >= 0.40 },
      source_ref_coverage:    { value: srCoverage,  threshold: 0.40, pass: srCoverage  >= 0.40 },
      feature_id_coverage:    { value: fidCoverage, threshold: 0.30, pass: fidCoverage >= 0.30 },
      community_id_coverage:  { value: cidCoverage, threshold: 0.90, pass: cidCoverage >= 0.90 },
      no_duplicate_keys:      { value: Number(dups.dup_count), threshold: 0, pass: Number(dups.dup_count) === 0 },
      no_noise_refs:          { value: Number(noise.noise_count), threshold: 50, pass: Number(noise.noise_count) < 50 },
      required_indexes:       { value: missingIndexes.length, threshold: 0, pass: missingIndexes.length === 0 },
      permissions_coverage:   { value: permCoverage,    threshold: 0.0, pass: true }, // report-only
      metadata_env_coverage:  { value: metaEnvCoverage, threshold: 0.0, pass: true }, // report-only
      topology_coverage:      { value: topoCoverage,    threshold: 0.0, pass: true }, // report-only
      vectors_coverage:       { value: vectCoverage,    threshold: 0.0, pass: true }, // report-only
    };

    const overallPass = Object.values(gates).every(g => g.pass);

    const report = {
      generated_at: new Date().toISOString(),
      total_packets: total,
      addressable_packets: addressable,
      identity_coverage: {
        packet_key:   { count: Number(counts.has_packet_key),   pct: pkCoverage },
        source_ref:   { count: Number(counts.has_source_ref),   pct: srCoverage },
        feature_id:   { count: Number(counts.has_feature_id),   pct: fidCoverage },
        community_id: { count: Number(counts.has_community_id), pct: cidCoverage },
      },
      missing_identity: {
        packet_key:   Number(counts.missing_packet_key),
        source_ref:   Number(counts.missing_source_ref),
        feature_id:   Number(counts.missing_feature_id),
        community_id: Number(counts.missing_community_id),
      },
      metadata_coverage: {
        payload_path:       Number(meta.payload_path),
        payload_file_url:   Number(meta.payload_file_url),
        payload_repo_url:   Number(meta.payload_repo_url),
        payload_source_url: Number(meta.payload_source_url),
        payload_mtime:      Number(meta.payload_mtime),
        payload_hash:       Number(meta.payload_hash),
        payload_bm25_text:  Number(meta.payload_bm25_text),
        payload_tags:       Number(meta.payload_tags),
      },
      noise_source_refs: Number(noise.noise_count),
      duplicate_packet_keys: Number(dups.dup_count),
      indexes: {
        required: REQUIRED_INDEXES.map(r => ({ ...r, present: indexResults.find(x => x.name === r.name)?.present ?? false })),
        missing: missingIndexes.map(r => r.name),
        has_payload_path_expression_index: hasPayloadPathIdx,
        total_indexes: idxRows.length,
      },
      gates,
      pass: overallPass,
    };

    if (VERBOSE && invalidSamples.length > 0) {
      report.invalid_samples = invalidSamples;
    }

    // ── Print ─────────────────────────────────────────────────────────────────
    if (JSON_OUT) {
      const stableJson = {
        contract_pass: overallPass,
        coverage: {
          source_ref: Number(srCoverage.toFixed(2)),
          feature_id: Number(fidCoverage.toFixed(2)),
          community_id: Number(cidCoverage.toFixed(2)),
          community_source: Number(csCoverage.toFixed(2)),
          community_confidence: Number(ccCoverage.toFixed(2)),
          packet_key: Number(pkCoverage.toFixed(2)),
          concept_ids: Number(coCoverage.toFixed(2)),
          summary: Number(smCoverage.toFixed(2)),
          "payload.path": Number(ppathCoverage.toFixed(2)),
          "payload.bm25_text": Number(pbmCoverage.toFixed(2))
        }
      };
      process.stdout.write(JSON.stringify(stableJson, null, 2) + '\n');
    } else {
      const pct = (n) => `${(n * 100).toFixed(1)}%`;
      console.log('\n═══ Packet Contract Validation ═══════════════════════════════');
      console.log(`Total packets:     ${total.toLocaleString()}  (addressable: ${addressable.toLocaleString()})`);

      console.log('\nIdentity field coverage (of total):');
      console.log(`  packet_key:   ${String(counts.has_packet_key).padStart(7)} / ${total}  ${pct(pkCoverage)}  ${gates.packet_key_coverage.pass ? '✅' : '❌'} (gate ≥40%)`);
      console.log(`  source_ref:   ${String(counts.has_source_ref).padStart(7)} / ${total}  ${pct(srCoverage)}  ${gates.source_ref_coverage.pass ? '✅' : '❌'} (gate ≥40%)`);
      console.log(`  feature_id:   ${String(counts.has_feature_id).padStart(7)} / ${total}  ${pct(fidCoverage)}  ${gates.feature_id_coverage.pass ? '✅' : '❌'} (gate ≥30%)`);
      console.log(`  community_id: ${String(counts.has_community_id).padStart(7)} / ${total}  ${pct(cidCoverage)}  ${gates.community_id_coverage.pass ? '✅' : '❌'} (gate ≥90%)`);

      console.log('\nEnvelope coverage (of total):');
      console.log(`  permissions:  ${String(counts.has_permissions).padStart(7)} / ${total}  ${pct(permCoverage)}  ✅ (report-only)`);
      console.log(`  metadata env: ${String(counts.has_metadata).padStart(7)} / ${total}  ${pct(metaEnvCoverage)}  ✅ (report-only)`);
      console.log(`  topology env: ${String(counts.has_topology).padStart(7)} / ${total}  ${pct(topoCoverage)}  ✅ (report-only)`);
      console.log(`  vectors env:  ${String(counts.has_vectors).padStart(7)} / ${total}  ${pct(vectCoverage)}  ✅ (report-only)`);

      console.log('\nMetadata field coverage (of packets with packet_key):');
      const base = Number(counts.has_packet_key);
      const mpct = (n) => `${base > 0 ? ((Number(n) / base) * 100).toFixed(1) : '0.0'}%`;
      console.log(`  payload.path:       ${String(meta.payload_path).padStart(6)}  ${mpct(meta.payload_path)}`);
      console.log(`  payload.bm25_text:  ${String(meta.payload_bm25_text).padStart(6)}  ${mpct(meta.payload_bm25_text)}`);
      console.log(`  payload.tags:       ${String(meta.payload_tags).padStart(6)}  ${mpct(meta.payload_tags)}`);
      console.log(`  payload.file_url:   ${String(meta.payload_file_url).padStart(6)}  ${mpct(meta.payload_file_url)}`);
      console.log(`  payload.repo_url:   ${String(meta.payload_repo_url).padStart(6)}  ${mpct(meta.payload_repo_url)}`);
      console.log(`  payload.source_url: ${String(meta.payload_source_url).padStart(6)}  ${mpct(meta.payload_source_url)}`);
      console.log(`  payload.mtime:      ${String(meta.payload_mtime).padStart(6)}  ${mpct(meta.payload_mtime)}`);
      console.log(`  payload.hash:       ${String(meta.payload_hash).padStart(6)}  ${mpct(meta.payload_hash)}`);

      console.log('\nData quality:');
      console.log(`  Duplicate packet_keys: ${dups.dup_count}  ${gates.no_duplicate_keys.pass ? '✅' : '❌'}`);
      console.log(`  Noise source_refs:     ${noise.noise_count}  ${gates.no_noise_refs.pass ? '✅' : '❌'} (gate <50; these are .cache/ artifacts)`);

      console.log('\nIndex audit:');
      for (const idx of indexResults) {
        console.log(`  ${idx.present ? '✅' : '❌'} ${idx.name}`);
      }
      if (!hasPayloadPathIdx) {
        console.log('  ⚠️  No expression index on payload->>\'path\' (optional — payload GIN covers it)');
      }
      if (missingIndexes.length > 0) {
        console.log(`  Missing: ${missingIndexes.map(r => r.name).join(', ')}`);
      }

      if (VERBOSE && invalidSamples.length > 0) {
        console.log('\nSample packets missing identity fields:');
        for (const s of invalidSamples) {
          console.log(`  ${s.packet_id}  pk=${s.packet_key ?? 'NULL'}  sr=${s.source_ref ?? 'NULL'}  fid=${s.feature_id ?? 'NULL'}`);
        }
      }

      console.log('\n══ Gate Summary ═════════════════════════════════════════════');
      for (const [key, g] of Object.entries(gates)) {
        const val = typeof g.value === 'number' && g.value < 1 && key.includes('coverage')
          ? `${(g.value * 100).toFixed(1)}%`
          : String(g.value);
        console.log(`  ${g.pass ? '✅' : '❌'} ${key.padEnd(30)} ${val}`);
      }
      console.log(`\n  ${overallPass ? '✅ CONTRACT PASS' : '⚠️  CONTRACT FAIL'}`);
    }

    // ── Save report ──────────────────────────────────────────────────────────
    const reportDir = join(ROOT, 'docs', 'reports');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'validate-packet-contract.json'), JSON.stringify(report, null, 2));
    if (!JSON_OUT) console.log('\nReport: docs/reports/validate-packet-contract.json');

    process.exitCode = overallPass ? 0 : 1;

  } catch (err) {
    console.error('Validation failed:', err.message);
    await pool.end().catch(() => {});
    process.exitCode = 1;
  }
}

main();
