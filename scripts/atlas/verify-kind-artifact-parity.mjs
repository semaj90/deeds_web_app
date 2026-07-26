#!/usr/bin/env node
/**
 * scripts/atlas/verify-kind-artifact-parity.mjs
 *
 * Verify that `kind` and `artifact_kind` fields are consistent on classified points.
 * Skip the 1,240 directory-cluster points (they have no artifact_kind).
 */

import fetch from 'node-fetch';

const QDRANT_URL = 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';

const VALID_ARTIFACT_KINDS = new Set([
  'source_module',
  'documentation_page',
  'config_file',
  'agent_card',
  'native_source',
  'migration_script',
  'test_file',
  'type_declaration',
  'shader_source',
  'schema_contract',
  'proto_file',
]);

async function verifyParity() {
  let offset = 0;
  let total = 0;
  let compared = 0;
  let matches = 0;
  let mismatches = 0;

  const samples = [];

  console.log(`[parity] Starting verification on ${COLLECTION}...`);

  do {
    const body = {
      limit: 500,
      with_payload: ['packet_key', 'source_ref', 'kind', 'artifact_kind'],
      with_vector: false,
    };

    if (offset !== undefined && offset !== null) {
      body.offset = offset;
    }

    let response;
    try {
      response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
    } catch (err) {
      console.error(`[error] Scroll request failed:`, err.message);
      process.exit(1);
    }

    const result = await response.json();

    if (!result.result || !Array.isArray(result.result.points)) {
      console.error(`[error] Unexpected response shape:`, result);
      process.exit(1);
    }

    for (const point of result.result.points) {
      total++;

      const kind = point.payload?.kind;
      const artifactKind = point.payload?.artifact_kind;

      // Skip directory-cluster points (they have no artifact_kind by design)
      if (kind === 'directory-cluster' || !VALID_ARTIFACT_KINDS.has(artifactKind)) {
        continue;
      }

      // This is a classified point; verify parity
      compared++;

      if (kind === artifactKind) {
        matches++;
      } else {
        mismatches++;
        if (samples.length < 50) {
          samples.push({
            id: point.id,
            packet_key: point.payload?.packet_key || null,
            source_ref: point.payload?.source_ref || null,
            kind,
            artifact_kind: artifactKind,
          });
        }
      }
    }

    offset = result.result.next_page_offset;

    if (total % 5000 === 0) {
      console.log(`  [progress] Scanned ${total} points. Compared: ${compared}, Matches: ${matches}, Mismatches: ${mismatches}`);
    }
  } while (offset !== null && offset !== undefined);

  console.log(`\n[complete] Verification finished.`);
  console.log(`  Total points scanned:     ${total}`);
  console.log(`  Classified points compared: ${compared}`);
  console.log(`  Kind ↔ artifact_kind matches: ${matches}`);
  console.log(`  Mismatches:               ${mismatches}`);
  console.log(`  Parity rate:              ${((matches / compared) * 100).toFixed(2)}%`);

  if (mismatches > 0) {
    console.log(`\n[mismatches] First ${samples.length}:`);
    for (const sample of samples) {
      console.log(`  ${JSON.stringify(sample)}`);
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    collection: COLLECTION,
    total_points_scanned: total,
    classified_points_compared: compared,
    matches: matches,
    mismatches: mismatches,
    parity_rate: (matches / compared) * 100,
    parity_pass: mismatches === 0,
    mismatch_samples: samples,
  };

  console.log(`\n[report] ${JSON.stringify(report, null, 2)}`);
}

verifyParity().catch((err) => {
  console.error(`[fatal]`, err);
  process.exit(1);
});
