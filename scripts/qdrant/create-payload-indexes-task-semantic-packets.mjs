#!/usr/bin/env node
/**
 * create-payload-indexes-task-semantic-packets.mjs
 *
 * Creates the Qdrant collection `task_semantic_packets` (768-dim, cosine) and
 * adds payload indexes matching the Postgres mirror (drizzle/manual/proposed_20260530_task_semantic_packets.sql).
 *
 * Indexed payload fields (so we can filter by them in vector search):
 *  - workspace_id (keyword)
 *  - workspace_task_id (keyword)
 *  - feature_id (keyword)
 *  - point_kind (keyword)
 *  - cluster_id (keyword)
 *  - centroid_id (keyword)
 *  - status (keyword)
 *  - agent_pickup_ready (bool)
 *  - observed_at (integer timestamp in ms)
 *  - updated_at (integer timestamp in ms)
 *  - deleted (bool)
 *  - semantic_path (keyword[] / list)
 *
 * Usage:
 *   node scripts/qdrant/create-payload-indexes-task-semantic-packets.mjs            # dry-run
 *   node scripts/qdrant/create-payload-indexes-task-semantic-packets.mjs --apply    # create collection + indexes
 */

import http from 'http';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = process.env.QDRANT_TSP_COLLECTION || 'task_semantic_packets';
const DIMS = parseInt(process.env.QDRANT_TSP_DIMS || '768', 10);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

function qdrantRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(QDRANT_URL + urlPath);
    const opts = {
      hostname: url.hostname,
      port: url.port || 6333,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) {
      const payload = JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Field → Qdrant payload schema type
// See https://qdrant.tech/documentation/concepts/indexing/#payload-index
const PAYLOAD_INDEXES = [
  { field_name: 'workspace_id',        field_schema: 'keyword' },
  { field_name: 'workspace_task_id',   field_schema: 'keyword' },
  { field_name: 'feature_id',          field_schema: 'keyword' },
  { field_name: 'point_kind',          field_schema: 'keyword' },
  { field_name: 'cluster_id',          field_schema: 'keyword' },
  { field_name: 'centroid_id',         field_schema: 'keyword' },
  { field_name: 'status',              field_schema: 'keyword' },
  { field_name: 'agent_pickup_ready',  field_schema: 'bool' },
  { field_name: 'deleted',             field_schema: 'bool' },
  { field_name: 'observed_at',         field_schema: 'integer' },
  { field_name: 'updated_at',          field_schema: 'integer' },
  { field_name: 'semantic_path',       field_schema: 'keyword' },
  { field_name: 'related_feature_ids', field_schema: 'keyword' },
  { field_name: 'related_task_ids',    field_schema: 'keyword' },
  { field_name: 'related_file_paths',  field_schema: 'keyword' },
];

async function main() {
  console.log('🛠️  Qdrant Task Semantic Packet — payload index setup');
  console.log('   Collection: ' + COLLECTION);
  console.log('   Qdrant URL: ' + QDRANT_URL);
  console.log('   Dims:       ' + DIMS);
  console.log('   Mode:       ' + (APPLY ? 'APPLY' : 'DRY-RUN'));
  console.log();

  // 1. Check if collection exists
  console.log('[1/3] Checking if collection exists...');
  const check = await qdrantRequest('GET', `/collections/${COLLECTION}`);
  const exists = check.status >= 200 && check.status < 300;
  console.log(`  Collection ${COLLECTION}: ${exists ? 'EXISTS' : 'NOT FOUND'}`);

  // 2. Create collection if missing
  if (!exists) {
    if (APPLY) {
      console.log('[2/3] Creating collection...');
      const create = await qdrantRequest('PUT', `/collections/${COLLECTION}`, {
        vectors: {
          size: DIMS,
          distance: 'Cosine',
        },
      });
      if (create.status >= 200 && create.status < 300) {
        console.log(`  ✓ Created ${COLLECTION} (${DIMS}-dim, cosine)`);
      } else {
        console.error(`  ✗ Creation failed:`, create.status, create.data);
        process.exit(1);
      }
    } else {
      console.log('[2/3] DRY-RUN — would create collection with config:');
      console.log('  { vectors: { size: ' + DIMS + ', distance: "Cosine" } }');
    }
  } else {
    console.log('[2/3] Collection already exists; skipping create');
  }

  // 3. Create payload indexes
  console.log(`[3/3] ${APPLY ? 'Creating' : 'Previewing'} ${PAYLOAD_INDEXES.length} payload indexes...`);
  let created = 0;
  let skipped = 0;
  for (const idx of PAYLOAD_INDEXES) {
    if (APPLY) {
      const result = await qdrantRequest('PUT', `/collections/${COLLECTION}/index?wait=true`, idx);
      if (result.status >= 200 && result.status < 300) {
        console.log(`  ✓ ${idx.field_name} (${idx.field_schema})`);
        created++;
      } else if (result.status === 200 || (result.data && JSON.stringify(result.data).includes('already exists'))) {
        console.log(`  ~ ${idx.field_name} (already indexed)`);
        skipped++;
      } else {
        console.log(`  ✗ ${idx.field_name}: status ${result.status}`, JSON.stringify(result.data).slice(0, 120));
      }
    } else {
      console.log(`  [PREVIEW] ${idx.field_name} (${idx.field_schema})`);
    }
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Collection:        ${COLLECTION}`);
  console.log(`Dimensions:        ${DIMS} (cosine)`);
  console.log(`Indexes ${APPLY ? 'created' : 'planned'}: ${APPLY ? `${created} new, ${skipped} existed` : PAYLOAD_INDEXES.length}`);
  console.log();
  console.log('Next: implement TaskSemanticPacketManager in');
  console.log('  sveltekit-frontend/src/lib/server/task-semantic/task-semantic-manager.ts');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
