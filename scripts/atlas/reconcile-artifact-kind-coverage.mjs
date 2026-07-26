#!/usr/bin/env node
/**
 * scripts/atlas/reconcile-artifact-kind-coverage.mjs
 *
 * Enumerate exactly which points are missing artifact_kind from codebase_chunks_768.
 * Resolve the contradiction: trace claims ~9,260 missing, arithmetic shows 1,240 gap.
 *
 * Expected output:
 * {
 *   total_points: 54224,
 *   with_artifact_kind: 52984,
 *   missing_artifact_kind: 1240,
 *   numeric_point_ids: <count>,
 *   string_point_ids: <count>,
 *   missing_samples: [ { id, id_type, packet_key, source_ref, kind, ledger_type } ],
 *   invalid_artifact_kind: [ { id, artifact_kind, source_ref } ],
 *   arithmetic_valid: <boolean>
 * }
 */

import fetch from 'node-fetch';

const QDRANT_URL = 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';

// Valid artifact_kind values from the reclassification
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

async function scrollCollection() {
  let offset = 0;
  let total = 0;
  let classified = 0;
  let missing = 0;
  let invalid = 0;
  let stringIds = 0;
  let numericIds = 0;

  const missingSamples = [];
  const invalidSamples = [];
  const invalidKindExamples = [];

  console.log(`[reconcile] Starting scroll of ${COLLECTION}...`);

  do {
    const body = {
      limit: 500,
      with_payload: ['packet_key', 'source_ref', 'kind', 'artifact_kind', 'packet_kind', 'ledger_type'],
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

      // Track ID type
      if (typeof point.id === 'number') {
        numericIds++;
      } else {
        stringIds++;
      }

      // Check artifact_kind presence and validity
      const artifactKind = point.payload?.artifact_kind;

      if (artifactKind === null || artifactKind === undefined) {
        missing++;
        if (missingSamples.length < 50) {
          missingSamples.push({
            id: point.id,
            id_type: typeof point.id,
            packet_key: point.payload?.packet_key || null,
            source_ref: point.payload?.source_ref || null,
            kind: point.payload?.kind || null,
            packet_kind: point.payload?.packet_kind || null,
            ledger_type: point.payload?.ledger_type || null,
          });
        }
      } else if (!VALID_ARTIFACT_KINDS.has(artifactKind)) {
        invalid++;
        if (invalidSamples.length < 50) {
          invalidSamples.push({
            id: point.id,
            artifact_kind: artifactKind,
            source_ref: point.payload?.source_ref || null,
            kind: point.payload?.kind || null,
          });
        }
      } else {
        classified++;
      }
    }

    offset = result.result.next_page_offset;

    // Log progress
    if (total % 5000 === 0) {
      console.log(`  [progress] Scanned ${total} points. Classified: ${classified}, Missing: ${missing}, Invalid: ${invalid}`);
    }
  } while (offset !== null && offset !== undefined);

  console.log(`\n[complete] Scroll finished. Total points: ${total}`);

  // Verify arithmetic
  const arithmeticValid = total === classified + missing + invalid;
  const expectedGap = total - classified;

  console.log(`\n[arithmetic]`);
  console.log(`  total:             ${total}`);
  console.log(`  classified:        ${classified}`);
  console.log(`  missing:           ${missing}`);
  console.log(`  invalid:           ${invalid}`);
  console.log(`  sum:               ${classified + missing + invalid}`);
  console.log(`  arithmetic_valid:  ${arithmeticValid}`);
  console.log(`  expected_gap:      ${expectedGap}`);

  console.log(`\n[id_types]`);
  console.log(`  numeric_ids:       ${numericIds}`);
  console.log(`  string_ids:        ${stringIds}`);

  if (missingSamples.length > 0) {
    console.log(`\n[missing_samples] First ${missingSamples.length} of ${missing}:`);
    for (const sample of missingSamples) {
      console.log(`  ${JSON.stringify(sample)}`);
    }
  }

  if (invalidSamples.length > 0) {
    console.log(`\n[invalid_samples] First ${invalidSamples.length} of ${invalid}:`);
    for (const sample of invalidSamples) {
      console.log(`  ${JSON.stringify(sample)}`);
    }
  }

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    collection: COLLECTION,
    total_points: total,
    classified: classified,
    missing_artifact_kind: missing,
    invalid_artifact_kind: invalid,
    numeric_point_ids: numericIds,
    string_point_ids: stringIds,
    arithmetic_valid: arithmeticValid,
    expected_gap: expectedGap,
    missing_samples: missingSamples,
    invalid_samples: invalidSamples,
  };

  console.log(`\n[report] ${JSON.stringify(report, null, 2)}`);

  return report;
}

scrollCollection().catch((err) => {
  console.error(`[fatal]`, err);
  process.exit(1);
});
