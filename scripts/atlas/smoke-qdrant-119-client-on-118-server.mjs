/**
 * Read-only compatibility smoke test: proves the @qdrant/js-client-rest 1.19.x
 * client works against the currently-live Qdrant 1.18.2 server, BEFORE the
 * Docker image is touched and BEFORE any of the ~20 live .search()/.recommend()
 * call sites are migrated to .query()/.queryBatch()/.queryGroups().
 *
 * Requires @qdrant/js-client-rest@1.19.x to actually be resolvable from this
 * script's node_modules (either because the real dependency has been bumped,
 * or because it's been installed in an isolated scratch project and this file
 * copied there for a dry run — see docs/reports/qdrant-119-client-on-118-server-smoke-v1.json
 * for the isolated-scratch proof captured 2026-08-26).
 *
 * Never writes to Qdrant. See QDRANT-UPGRADE-01..07 tranche in
 * openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md.
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

const HOST = process.env.QDRANT_HOST ?? '127.0.0.1';
const PORT = Number(process.env.QDRANT_PORT ?? 6333);
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';
const RECEIPT_OUT = process.env.RECEIPT_OUT ?? null;

const client = new QdrantClient({ host: HOST, port: PORT });

const checks = {};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resolveSdkVersion() {
  try {
    const searchPaths = require.resolve.paths('@qdrant/js-client-rest') || [];
    for (const base of searchPaths) {
      const pkgPath = path.join(base, '@qdrant', 'js-client-rest', 'package.json');
      if (existsSync(pkgPath)) {
        return JSON.parse(readFileSync(pkgPath, 'utf8')).version;
      }
    }
  } catch {
    // fall through
  }
  return 'unknown';
}

async function main() {
  const sdkVersion = resolveSdkVersion();

  const rootResp = await fetch(`http://${HOST}:${PORT}/`);
  const root = await rootResp.json();
  const serverVersion = root.version ?? root.result?.version ?? null;

  console.log({ sdkVersion, serverVersion });
  assert(sdkVersion.startsWith('1.19.'), `Expected JS SDK 1.19.x, got ${sdkVersion}`);

  // --- Collection read + config inspection (find the real named vector) ---
  const info = await client.getCollection(COLLECTION);
  assert(info, 'Collection lookup failed');
  checks.collectionRead = 'PASS';

  const vectorsConfig = info.config?.params?.vectors;
  let vectorName = null;
  if (vectorsConfig && typeof vectorsConfig === 'object' && !Array.isArray(vectorsConfig)) {
    const names = Object.keys(vectorsConfig);
    if (names.length > 0 && names[0] !== 'size') vectorName = names[0];
  }
  console.log({ vectorsConfigShape: vectorsConfig, resolvedVectorName: vectorName });

  // --- Scroll: get one real fixture point with vector + payload ---
  const scroll = await client.scroll(COLLECTION, {
    limit: 1,
    with_payload: true,
    with_vector: true,
  });
  const point = scroll.points?.[0];
  assert(point, 'No fixture point found');
  checks.scroll = 'PASS';

  const rawVector = point.vector;
  const vector = Array.isArray(rawVector)
    ? rawVector
    : (vectorName ? rawVector?.[vectorName] : Object.values(rawVector ?? {})[0]);
  assert(Array.isArray(vector) && vector.length === 768, 'Could not obtain a 768-D fixture vector');

  // --- Dense Query API (1.19 client -> 1.18.2 server) ---
  const denseArgs = { query: vector, limit: 5, with_payload: true, with_vector: false };
  if (vectorName) denseArgs.using = vectorName;
  const dense = await client.query(COLLECTION, denseArgs);

  assert(Array.isArray(dense.points), 'query() did not return { points: [...] }');
  checks.queryResponseShape = 'PASS';
  assert(dense.points.length > 0, 'Dense Query API returned zero hits');
  assert(dense.points.some((p) => String(p.id) === String(point.id)), 'Fixture point not recovered by self-query');
  checks.queryApi = 'PASS';
  checks.namedVector = vectorName ? 'PASS' : 'SKIPPED (unnamed/default vector collection)';

  console.log({ denseQuery: 'PASS', resultCount: dense.points.length, fixturePointId: point.id, vectorName });

  // --- score_threshold ---
  const thresholded = await client.query(COLLECTION, { ...denseArgs, score_threshold: 0.0 });
  assert(Array.isArray(thresholded.points), 'score_threshold query failed to return points');
  checks.scoreThreshold = 'PASS';

  // --- Payload filter using a REAL field from the fixture point ---
  const sourceRef = point.payload?.source_ref;
  if (sourceRef) {
    const filtered = await client.query(COLLECTION, {
      ...denseArgs,
      filter: { must: [{ key: 'source_ref', match: { value: sourceRef } }] },
    });
    assert(Array.isArray(filtered.points) && filtered.points.length > 0, 'Filtered query failed');
    checks.payloadFilter = 'PASS';
  } else {
    checks.payloadFilter = 'SKIPPED (fixture point has no source_ref payload field)';
  }

  // --- Recommend via Query API ---
  const recommendArgs = {
    query: { recommend: { positive: [point.id], negative: [] } },
    limit: 5,
    with_payload: true,
  };
  if (vectorName) recommendArgs.using = vectorName;
  const recommended = await client.query(COLLECTION, recommendArgs);
  assert(Array.isArray(recommended.points), 'recommend query() did not return { points: [...] }');
  checks.recommendQuery = 'PASS';

  // --- Data invariant: read-only, confirm current point count for the receipt ---
  const countAfter = await client.count(COLLECTION, { exact: true });
  checks.noWritesPerformed = true;

  console.log('All checks:', checks);
  console.log('QDRANT_119_CLIENT_ON_118_SERVER=PASS');

  if (RECEIPT_OUT) {
    const receipt = {
      schema: 'atlas.qdrant-runtime-upgrade-smoke.v1',
      generatedAt: new Date().toISOString(),
      serverVersion,
      clientVersion: sdkVersion,
      collection: COLLECTION,
      vectorName,
      pointCountAfter: countAfter?.count ?? null,
      checks,
      writesPerformed: false,
      status: 'QDRANT_119_CLIENT_ON_118_SERVER_PROVEN',
    };
    writeFileSync(RECEIPT_OUT, JSON.stringify(receipt, null, 2));
    console.log('Receipt written to', RECEIPT_OUT);
  }
}

main().catch((err) => {
  console.error('QDRANT_119_CLIENT_ON_118_SERVER=FAIL');
  console.error(err);
  process.exit(1);
});
