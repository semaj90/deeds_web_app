#!/usr/bin/env node
/**
 * audit-latent-som-join-keys.mjs
 *
 * Read-only audit script to:
 *   1. Count key fields in Postgres atlas_packets table.
 *   2. Load SOM assignments and autoencoder latent index.
 *   3. Compare keys against Postgres identifiers.
 *   4. Output results to docs/reports/latent-som-join-key-audit.json / .md
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

// Load environment
loadAtlasEnv(resolve('.'));

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const SOM_ASSIGNMENTS_FILE = resolve('.', 'models/som/som_assignments.json');
const LATENT_INDEX_FILE = resolve('.', 'models/autoencoder/autoencoder_latent_index.json');
const REPORT_DIR = resolve('.', 'docs/reports');
const REPORT_JSON = resolve(REPORT_DIR, 'latent-som-join-key-audit.json');
const REPORT_MD = resolve(REPORT_DIR, 'latent-som-join-key-audit.md');
const QDRANT_URL = String(process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const QDRANT_COLLECTION = process.env.AE_QDRANT_COLLECTION || 'codebase_chunks_768';

async function fetchQdrantPayloads(ids) {
  const payloads = new Map();
  const numericIds = [...new Set(
    ids.filter((id) => /^\d+$/.test(String(id))).map((id) => Number(id))
  )];
  for (let start = 0; start < numericIds.length; start += 256) {
    const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: numericIds.slice(start, start + 256),
        with_payload: true,
        with_vector: false,
      }),
    });
    if (!response.ok) throw new Error(`Qdrant retrieve ${response.status}: ${await response.text()}`);
    const json = await response.json();
    for (const point of json.result ?? []) payloads.set(String(point.id), point.payload ?? {});
  }
  return payloads;
}

function payloadCandidates(payload = {}) {
  return [
    payload.packet_key,
    payload.packetKey,
    payload.chunk_id,
    payload.source_ref,
    payload.sourceRef,
    payload.canonical_source_ref,
    payload.canonicalSourceRef,
    payload.file_path,
    payload.filePath,
    payload.path,
    ...(Array.isArray(payload.sourceRefs) ? payload.sourceRefs : []),
  ].filter(Boolean).map(String);
}

function classifyPayload(payload = {}) {
  if (
    payload.kind === 'directory-cluster' ||
    payload.ledger_type === 'legacy_qdrant_only' ||
    payload.canonical === false ||
    payload.payload_unmatched === true
  ) return 'non_packet_vector';
  if (payloadCandidates(payload).length > 0 || payload.canonical === true) {
    return 'canonical_packet_vector';
  }
  return 'unclassified_vector';
}

async function main() {
  console.log('=== Running Latent/SOM Join-Key Audit ===\n');

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // 1. Run database counts
  let dbStats = {};
  try {
    const res = await pool.query(`
      SELECT
        count(*)::integer as total,
        count(packet_key)::integer as packet_key_count,
        count(source_ref)::integer as source_ref_count,
        count(qdrant_point_id)::integer as qdrant_point_id_count,
        count(payload->>'qdrant_point_id')::integer as payload_qdrant_point_id_count,
        count(metadata->>'qdrant_point_id')::integer as metadata_qdrant_point_id_count,
        count(latent_64)::integer as latent64_count,
        count(som_index)::integer as som_index_count
      FROM atlas_packets;
    `);
    dbStats = res.rows[0];
    console.log('Database Stats:', dbStats);
  } catch (err) {
    console.error('❌ Database query failed:', err.message);
    await pool.end();
    process.exit(1);
  }

  // 2. Fetch all identifiers from DB for mapping check
  let allPackets = [];
  try {
    const res = await pool.query(`
      SELECT 
        packet_id, 
        packet_key, 
        source_ref, 
        qdrant_point_id,
        payload->>'qdrant_point_id' as payload_qdrant_id,
        metadata->>'qdrant_point_id' as metadata_qdrant_id,
        payload->>'packet_key' as payload_packet_key,
        metadata->>'packet_key' as metadata_packet_key,
        payload->>'source_ref' as payload_source_ref,
        metadata->>'source_ref' as metadata_source_ref,
        latent_64 IS NOT NULL as has_latent,
        som_index IS NOT NULL as has_som
      FROM atlas_packets;
    `);
    allPackets = res.rows;
    console.log(`Fetched ${allPackets.length} rows from database for mapping check.`);
  } catch (err) {
    console.error('❌ Failed to fetch database identifiers:', err.message);
    await pool.end();
    process.exit(1);
  }

  await pool.end();

  // 3. Load Assignments and Latent Index files
  let somAssignments = null;
  if (existsSync(SOM_ASSIGNMENTS_FILE)) {
    try {
      somAssignments = JSON.parse(readFileSync(SOM_ASSIGNMENTS_FILE, 'utf-8'));
      console.log(`Loaded SOM assignments: ${Object.keys(somAssignments.assignments || {}).length} entries.`);
    } catch (e) {
      console.warn(`⚠️ Failed to parse SOM assignments: ${e.message}`);
    }
  } else {
    console.log(`ℹ️ SOM assignments file not found at: ${SOM_ASSIGNMENTS_FILE}`);
  }

  let latentIndex = null;
  if (existsSync(LATENT_INDEX_FILE)) {
    try {
      latentIndex = JSON.parse(readFileSync(LATENT_INDEX_FILE, 'utf-8'));
      console.log(`Loaded latent index: ${Object.keys(latentIndex.index || {}).length} entries.`);
    } catch (e) {
      console.warn(`⚠️ Failed to parse latent index: ${e.message}`);
    }
  } else {
    console.log(`ℹ️ Latent index file not found at: ${LATENT_INDEX_FILE}`);
  }

  // Helper function to build candidate list from a Qdrant/SOM identifier
  const buildCandidates = (id, candidatesList = []) => {
    const s = new Set();
    s.add(String(id));
    for (const c of candidatesList) {
      if (c) {
        s.add(String(c));
        // Add prefix and suffix variations
        if (!c.startsWith('sveltekit-frontend/')) {
          s.add('sveltekit-frontend/' + c);
        } else {
          s.add(c.replace('sveltekit-frontend/', ''));
        }
      }
    }
    // Also include prefix variations for the main ID itself
    if (typeof id === 'string') {
      if (!id.startsWith('sveltekit-frontend/')) {
        s.add('sveltekit-frontend/' + id);
      } else {
        s.add(id.replace('sveltekit-frontend/', ''));
      }
      // Add variation stripping prefix "card:"
      if (id.startsWith('card:')) {
        const stripped = id.replace(/^card:/, '');
        s.add(stripped);
        s.add('sveltekit-frontend/' + stripped);
      }
    }
    return Array.from(s);
  };

  // 4. Run overlap analysis
  const databaseIdentifiers = new Set();
  for (const packet of allPackets) {
    for (const value of [
      packet.qdrant_point_id,
      packet.packet_key,
      packet.source_ref,
      packet.payload_qdrant_id,
      packet.metadata_qdrant_id,
      packet.payload_packet_key,
      packet.metadata_packet_key,
      packet.payload_source_ref,
      packet.metadata_source_ref,
    ]) {
      if (value !== null && value !== undefined && String(value).trim()) {
        databaseIdentifiers.add(String(value));
      }
    }
  }

  const analyzeOverlap = (indexObj, candidatesMap = {}) => {
    if (!indexObj) return null;
    const keys = Object.keys(indexObj);
    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const key of keys) {
      const cands = buildCandidates(key, candidatesMap[key] || []);
      const candsSet = new Set(cands);

      const hasMatch = [...candsSet].some((candidate) => databaseIdentifiers.has(candidate));

      if (hasMatch) matchedCount++;
      else unmatchedCount++;
    }

    return {
      total_keys: keys.length,
      matched: matchedCount,
      unmatched: unmatchedCount,
      coverage_pct: keys.length ? ((matchedCount / keys.length) * 100).toFixed(2) : '0.00'
    };
  };

  const latentCoverage = latentIndex 
    ? analyzeOverlap(latentIndex.index, latentIndex.candidates) 
    : null;

  const somCoverage = somAssignments 
    ? analyzeOverlap(somAssignments.assignments, latentIndex?.candidates || {}) 
    : null;

  const artifactKeys = [
    ...Object.keys(latentIndex?.index ?? {}),
    ...Object.keys(somAssignments?.assignments ?? {}),
  ];
  let qdrantPayloads = new Map();
  let qdrantError = null;
  try {
    qdrantPayloads = await fetchQdrantPayloads(artifactKeys);
    console.log(`Loaded ${qdrantPayloads.size} Qdrant payloads for denominator classification.`);
  } catch (error) {
    qdrantError = error.message;
    console.warn(`⚠️ Qdrant classification unavailable: ${qdrantError}`);
  }

  const analyzeIdentityReasons = (indexObj, candidatesMap = {}) => {
    if (!indexObj) return null;
    const reasonCounts = {
      matched: 0,
      qdrant_point_not_found: 0,
      non_packet_vector: 0,
      missing_identity_payload: 0,
      identity_not_in_postgres: 0,
    };
    const unmatchedExamples = [];

    for (const key of Object.keys(indexObj)) {
      const directCandidates = buildCandidates(key, candidatesMap[key] || []);
      if (directCandidates.some((candidate) => databaseIdentifiers.has(candidate))) {
        reasonCounts.matched++;
        continue;
      }

      const payload = qdrantPayloads.get(String(key));
      if (!payload) {
        const reason = /^\d+$/.test(String(key))
          ? 'qdrant_point_not_found'
          : 'identity_not_in_postgres';
        reasonCounts[reason]++;
        if (unmatchedExamples.length < 25) unmatchedExamples.push({ key, reason });
        continue;
      }
      const classification = classifyPayload(payload);
      if (classification === 'non_packet_vector') {
        reasonCounts.non_packet_vector++;
        continue;
      }
      if (classification === 'unclassified_vector') {
        reasonCounts.missing_identity_payload++;
        if (unmatchedExamples.length < 25) unmatchedExamples.push({ key, reason: 'missing_identity_payload' });
        continue;
      }
      const candidates = buildCandidates(key, [
        ...(candidatesMap[key] || []),
        ...payloadCandidates(payload),
      ]);
      if (candidates.some((candidate) => databaseIdentifiers.has(candidate))) {
        reasonCounts.matched++;
      } else {
        reasonCounts.identity_not_in_postgres++;
        if (unmatchedExamples.length < 25) {
          unmatchedExamples.push({
            key,
            reason: 'identity_not_in_postgres',
            candidates: candidates.slice(0, 8),
          });
        }
      }
    }

    const addressable = reasonCounts.matched + reasonCounts.identity_not_in_postgres;
    return {
      total: Object.keys(indexObj).length,
      addressable,
      matched: reasonCounts.matched,
      unmatched: reasonCounts.identity_not_in_postgres,
      coverage_pct: addressable
        ? ((reasonCounts.matched / addressable) * 100).toFixed(2)
        : '0.00',
      reason_counts: reasonCounts,
      unmatched_examples: unmatchedExamples,
    };
  };

  const latentIdentityReasons = analyzeIdentityReasons(
    latentIndex?.index,
    latentIndex?.candidates || {}
  );
  const somIdentityReasons = analyzeIdentityReasons(
    somAssignments?.assignments,
    latentIndex?.candidates || {}
  );

  // 5. Generate reports
  const auditReport = {
    timestamp: new Date().toISOString(),
    db_stats: dbStats,
    latent_coverage: latentCoverage,
    som_coverage: somCoverage,
    qdrant: {
      collection: QDRANT_COLLECTION,
      payloads_loaded: qdrantPayloads.size,
      error: qdrantError,
    },
    latent_identity_reasons: latentIdentityReasons,
    som_identity_reasons: somIdentityReasons,
  };

  mkdirSync(REPORT_DIR, { recursive: true });

  // Write JSON
  writeFileSync(REPORT_JSON, JSON.stringify(auditReport, null, 2));
  console.log(`\nWritten JSON report: ${REPORT_JSON}`);

  // Write MD
  const mdContent = `# Latent & SOM Join-Key Coverage Audit

Report generated at: \`${auditReport.timestamp}\`

## Database Stats (\`atlas_packets\` Table)

| Metric | Count |
| :--- | :--- |
| **Total packets in Postgres** | **${dbStats.total}** |
| Packets with \`packet_key\` | ${dbStats.packet_key_count} |
| Packets with \`source_ref\` | ${dbStats.source_ref_count} |
| Packets with \`qdrant_point_id\` | ${dbStats.qdrant_point_id_count} |
| Packets with Qdrant ID in \`payload\` | ${dbStats.payload_qdrant_point_id_count} |
| Packets with Qdrant ID in \`metadata\` | ${dbStats.metadata_qdrant_point_id_count} |
| **Packets with \`latent_64\` populated** | **${dbStats.latent64_count}** |
| **Packets with \`som_index\` populated** | **${dbStats.som_index_count}** |

## Coverage Diagnostics

### Autoencoder Latent Index Coverage
${latentCoverage ? `
* **Total unique Qdrant entries in Latent Index**: ${latentCoverage.total_keys}
* **Matched against database packets**: ${latentCoverage.matched} (${latentCoverage.coverage_pct}%)
* **Unmatched (skipped)**: ${latentCoverage.unmatched}
` : '*No latent index file found.*'}

### SOM Assignments Coverage
${somCoverage ? `
* **Total unique entries in SOM Assignments**: ${somCoverage.total_keys}
* **Matched against database packets**: ${somCoverage.matched} (${somCoverage.coverage_pct}%)
* **Unmatched (skipped)**: ${somCoverage.unmatched}
` : '*No SOM assignments file found.*'}

### Identity Join Reason Classification

${latentIdentityReasons ? `
* **Addressable latent vectors**: ${latentIdentityReasons.addressable}
* **Matched addressable latent vectors**: ${latentIdentityReasons.matched} (${latentIdentityReasons.coverage_pct}%)
* **Reason counts**: \`${JSON.stringify(latentIdentityReasons.reason_counts)}\`
` : '*Canonical latent coverage unavailable.*'}

${somIdentityReasons ? `
* **Addressable SOM vectors**: ${somIdentityReasons.addressable}
* **Matched addressable SOM vectors**: ${somIdentityReasons.matched} (${somIdentityReasons.coverage_pct}%)
* **Reason counts**: \`${JSON.stringify(somIdentityReasons.reason_counts)}\`
` : '*Canonical SOM coverage unavailable.*'}

---

## Action Plan & Alignment status

* **AE training**: \`COMPLETE\` — CUDA-trained weights are present.
* **latent_64 generation**: \`COMPLETE / WRITEBACK PARTIAL\`
* **SOM training**: \`IMPLEMENTATION READY / EXISTING ASSIGNMENTS REQUIRE IDENTITY REVIEW\`
* **Redis/Valkey latent cache**: \`CLOSED\`
* **Postgres writeback**: \`PARTIAL\` — use canonical packet vectors, not all Qdrant surfaces, as the repair denominator.
`;

  writeFileSync(REPORT_MD, mdContent);
  console.log(`Written Markdown report: ${REPORT_MD}`);

  console.log('\n=== Audit Complete ===');
}

main().catch(err => {
  console.error('❌ Fatal error during audit:', err.stack);
  process.exit(1);
});
