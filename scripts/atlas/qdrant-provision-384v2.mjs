#!/usr/bin/env node
/**
 * qdrant-provision-384v2.mjs
 *
 * Provisions the codebase_chunks_384_v2 Qdrant collection according to the
 * contract defined in qdrant-parity-contract.mjs.
 *
 * Safety model:
 *   --dry-run (default) — prints what would be created, exits 0
 *   --apply             — actually creates the collection, indexes, and metadata
 *
 * Hard stops (always fail, never create):
 *   • Collection already exists with a different named-vector schema
 *   • Contract not found in COLLECTION_CONTRACTS
 *   • Qdrant unreachable
 *
 * Usage:
 *   node scripts/atlas/qdrant-provision-384v2.mjs --dry-run
 *   node scripts/atlas/qdrant-provision-384v2.mjs --apply
 *   npm run atlas:qdrant:provision:v2:dry
 *   npm run atlas:qdrant:provision:v2:apply
 */

import { COLLECTION_CONTRACTS } from './qdrant-parity-contract.mjs';

// ── CLI flags ─────────────────────────────────────────────────────────────────

const APPLY   = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = !APPLY;

// Target collection for this provisioner
const TARGET_COLLECTION = 'codebase_chunks_384_v2';
const QDRANT_URL        = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(...args) { console.log('[provision]', ...args); }
function verb(...args) { if (VERBOSE) console.log('[provision:verbose]', ...args); }
function fail(msg) { console.error('[provision:FATAL]', msg); process.exit(1); }

async function qdrantGet(path) {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Qdrant GET ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

async function qdrantPut(path, body) {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qdrant PUT ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function qdrantPost(path, body) {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qdrant POST ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Schema builders ───────────────────────────────────────────────────────────

/**
 * Build the named-vectors config for collection creation.
 * HNSW params are matched to the existing codebase_chunks_768 production values.
 */
function buildVectorsConfig(contract) {
  const vectors = {};
  for (const [name, dim] of Object.entries(contract.namedVectors)) {
    vectors[name] = {
      size:     dim,
      distance: contract.distance || 'Cosine',
      hnsw_config: {
        m:                16,
        ef_construct:     100,
        full_scan_threshold: 10000,
      },
      on_disk: false,
    };
  }
  return vectors;
}

/**
 * Build the sparse-vectors config for BM42 lane.
 */
function buildSparseVectorsConfig(contract) {
  return {
    [contract.sparseVectorKey]: {
      index: { on_disk: false },
    },
  };
}

/**
 * Payload field indexes required for parity audit and retrieval filtering.
 */
const PAYLOAD_INDEXES = [
  { field: 'packet_key',   schema: { type: 'keyword' } },
  { field: 'source_ref',   schema: { type: 'keyword' } },
  { field: 'feature_id',   schema: { type: 'keyword' } },
  { field: 'domain_class', schema: { type: 'keyword' } },
  { field: 'title_id',     schema: { type: 'keyword' } },
  { field: 'tags',         schema: { type: 'keyword' } },
  { field: 'updated_at',   schema: { type: 'datetime' } },
];

// ── Existence check ───────────────────────────────────────────────────────────

/**
 * Returns the existing collection info, or null if it doesn't exist.
 */
async function getExistingCollection(name) {
  try {
    const data = await qdrantGet(`/collections/${name}`);
    return data.result ?? null;
  } catch (err) {
    if (err.message.includes('404') || err.message.includes('Not found')) return null;
    throw err;
  }
}

/**
 * Compare live vector schema against contract.
 * Returns list of mismatches (empty = schemas agree).
 */
function detectSchemaMismatches(existingInfo, contract) {
  const mismatches = [];
  const liveVectors = existingInfo.config?.params?.vectors ?? {};

  for (const [name, expectedDim] of Object.entries(contract.namedVectors)) {
    const liveVec = liveVectors[name];
    if (!liveVec) {
      mismatches.push(`named vector "${name}" missing in live collection`);
      continue;
    }
    if (liveVec.size !== expectedDim) {
      mismatches.push(
        `named vector "${name}" dim mismatch: live=${liveVec.size}, contract=${expectedDim}`
      );
    }
  }

  return mismatches;
}

// ── Preflight: post-creation verification ─────────────────────────────────────

async function runPostCreationPreflight(name, contract) {
  log('Running post-creation preflight…');
  const info = await getExistingCollection(name);
  if (!info) fail(`Collection ${name} not found immediately after creation`);

  const mismatches = detectSchemaMismatches(info, contract);
  if (mismatches.length > 0) {
    console.error('[provision:preflight] Schema mismatches after creation:');
    mismatches.forEach(m => console.error(' •', m));
    process.exit(1);
  }

  log('Preflight PASS — collection schema matches contract');
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(DRY_RUN ? '=== DRY RUN (no changes will be made) ===' : '=== APPLY MODE ===');
  log(`Target collection: ${TARGET_COLLECTION}`);
  log(`Qdrant: ${QDRANT_URL}`);

  // 1. Validate contract exists
  const contract = COLLECTION_CONTRACTS[TARGET_COLLECTION];
  if (!contract) fail(`No contract found for collection "${TARGET_COLLECTION}" in COLLECTION_CONTRACTS`);
  log(`Contract version: ${contract.contractVersion}`);
  log(`Required vectors: ${contract.requiredVectors.join(', ')}`);
  log(`Recommended vectors: ${(contract.recommendedVectors ?? []).join(', ')}`);
  log(`Routing vectors: ${(contract.routingVectors ?? []).join(', ')}`);
  log(`Sparse vector key: ${contract.sparseVectorKey}`);

  // 2. Verify Qdrant is reachable
  try {
    await qdrantGet('/');
    log('Qdrant reachable ✓');
  } catch (err) {
    fail(`Qdrant unreachable at ${QDRANT_URL}: ${err.message}`);
  }

  // 3. Check if collection already exists
  const existing = await getExistingCollection(TARGET_COLLECTION);

  if (existing) {
    log(`Collection "${TARGET_COLLECTION}" already exists`);
    const status = existing.status ?? 'unknown';
    const pointCount = existing.points_count ?? 0;
    log(`  status: ${status}, points: ${pointCount}`);

    const mismatches = detectSchemaMismatches(existing, contract);
    if (mismatches.length > 0) {
      console.error('[provision:FATAL] Existing collection schema contradicts contract:');
      mismatches.forEach(m => console.error(' •', m));
      console.error('');
      console.error('  Do NOT modify the existing collection in-place.');
      console.error('  Options:');
      console.error('  A) Delete the collection manually and re-run with --apply');
      console.error('     curl -X DELETE http://127.0.0.1:6333/collections/' + TARGET_COLLECTION);
      console.error('  B) Rename it to a backup before reprovisioning');
      process.exit(1);
    }

    log('Existing collection schema matches contract — no action needed');
    log('Run the parity repair script to populate it:');
    log(`  npm run atlas:qdrant:repair:preflight  (verify parity)`);
    process.exit(0);
  }

  // 4. Build creation payload
  const createBody = {
    vectors:        buildVectorsConfig(contract),
    sparse_vectors: buildSparseVectorsConfig(contract),
    hnsw_config: {
      m:            16,
      ef_construct: 100,
    },
    optimizers_config: {
      indexing_threshold: 10000,
    },
    on_disk_payload: false,
  };

  if (VERBOSE) {
    verb('Collection create body:', JSON.stringify(createBody, null, 2));
  }

  log('');
  log('Would create:');
  log(`  Collection: ${TARGET_COLLECTION}`);
  log(`  Named vectors:`);
  for (const [name, dim] of Object.entries(contract.namedVectors)) {
    const isRequired    = (contract.requiredVectors    ?? []).includes(name);
    const isRecommended = (contract.recommendedVectors ?? []).includes(name);
    const isRouting     = (contract.routingVectors     ?? []).includes(name);
    const label = isRequired ? '(required)' : isRecommended ? '(recommended)' : isRouting ? '(routing)' : '';
    log(`    ${name}: dim=${dim} ${label}`);
  }
  log(`  Sparse vectors: ${contract.sparseVectorKey}`);
  log(`  Payload indexes: ${PAYLOAD_INDEXES.map(i => i.field).join(', ')}`);

  if (DRY_RUN) {
    log('');
    log('DRY RUN complete. To apply, run:');
    log('  npm run atlas:qdrant:provision:v2:apply');
    process.exit(0);
  }

  // 5. Create collection
  log('');
  log(`Creating collection "${TARGET_COLLECTION}"…`);
  await qdrantPut(`/collections/${TARGET_COLLECTION}`, createBody);
  log(`Collection created ✓`);

  // 6. Create payload indexes
  log('Creating payload indexes…');
  for (const { field, schema } of PAYLOAD_INDEXES) {
    await qdrantPut(`/collections/${TARGET_COLLECTION}/index?wait=true`, {
      field_name:   field,
      field_schema: schema.type,  // simple string form: "keyword" | "datetime" | "integer" | "float"
    });
    verb(`  Payload index created: ${field} (${schema.type})`);
  }
  log(`Payload indexes created ✓`);

  // 7. Write contract metadata as a sentinel point (point_id=0).
  // Named-vector collections require at least one named vector even for payload-only points.
  // Use a zero-filled content_384 vector; the sentinel is excluded from retrieval via payload filter.
  log('Writing contract metadata sentinel…');
  const zeroVec384 = new Array(384).fill(0);
  await qdrantPost(`/collections/${TARGET_COLLECTION}/points`, {
    points: [
      {
        id: 0,
        vector: { content_384: zeroVec384 },
        payload: {
          _atlas_system_record: true,
          _atlas_record_kind:   'collection_contract',
          _contract_version:    contract.contractVersion,
          _provisioned_at:      new Date().toISOString(),
          _required_vectors:    contract.requiredVectors,
          _recommended_vectors: contract.recommendedVectors ?? [],
          _routing_vectors:     contract.routingVectors ?? [],
        },
      },
    ],
  });
  log('Contract metadata sentinel written ✓');

  // 8. Post-creation preflight
  await runPostCreationPreflight(TARGET_COLLECTION, contract);

  log('');
  log('=== PROVISION COMPLETE ===');
  log(`Collection "${TARGET_COLLECTION}" is ready.`);
  log('');
  log('Next steps:');
  log('  1. Verify preflight:  npm run atlas:qdrant:repair:preflight');
  log('  2. Population plan:   npm run atlas:qdrant:population:plan');
  log('  3. Wave 0 (25 pts):   npm run atlas:qdrant:populate:wave0');
}

main().catch(err => {
  console.error('[provision:UNHANDLED]', err);
  process.exit(1);
});
