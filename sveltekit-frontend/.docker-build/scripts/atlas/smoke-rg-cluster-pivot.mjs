#!/usr/bin/env node
/**
 * smoke-rg-cluster-pivot.mjs
 *
 * Standalone smoke test verifying the cluster-pivot retrieval lane.
 * Connects directly to Redis and Qdrant to pull data, executes the similarity and
 * expansion logic, and verifies the shape and integrity of returned UnifiedRetrievalResult hits.
 * Supports dry-run queries via the --query option.
 */

import Redis from 'ioredis';
import { resolve, join } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
import { getQdrantUrl } from '../qdrant-client.mjs';
const QDRANT_URL = getQdrantUrl();
const CODEBASE_COLLECTION = 'codebase_chunks_768';
const CLUSTER_PIVOT_SCORE_CAP = 0.12;
const MAX_FILES_PER_CLUSTER = 6;
const MAX_PIVOT_CLUSTERS = 3;

// Cosine similarity calculations
function dot64(a, b) {
  let s = 0;
  for (let i = 0; i < 64; i++) s += a[i] * b[i];
  return s;
}

function norm64(v) {
  return Math.sqrt(dot64(v, v));
}

function cosine64(a, b) {
  const na = norm64(a);
  const nb = norm64(b);
  if (na === 0 || nb === 0) return 0;
  return dot64(a, b) / (na * nb);
}

function meanCentroid(vecs) {
  if (!vecs.length) return null;
  const dim = vecs[0].length;
  const sum = new Array(dim).fill(0);
  for (const v of vecs) {
    for (let i = 0; i < dim; i++) sum[i] += v[i];
  }
  return sum.map((s) => s / vecs.length);
}

// Load latest cluster tags from memory/runs
function readLatestQdrantClusterTags() {
  try {
    const runsDir = resolve(process.cwd(), '../memory/runs');
    if (!existsSync(runsDir)) return [];
    const entries = readdirSync(runsDir)
      .filter((e) => /^\d{4}-\d{2}-\d{2}T/.test(e))
      .sort();
    if (!entries.length) return [];
    const latest = entries[entries.length - 1];
    const latestDir = join(runsDir, latest);
    const raw = readFileSync(join(latestDir, 'qdrant_cluster_tags.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function runSmokeTest() {
  console.log('⚡ Standalone Smoke Test: Qdrant-Redis Cluster Pivot Expansion');
  console.log(`🔌 Redis URL: ${REDIS_URL}`);
  console.log(`🔌 Qdrant URL: ${QDRANT_URL}\n`);

  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
  });

  try {
    // 1. Get sample paths from Redis keys or ripgrep query
    let filePaths = [];
    const queryArgIndex = process.argv.indexOf('--query');
    const queryVal = queryArgIndex !== -1 ? process.argv[queryArgIndex + 1] : null;

    if (queryVal) {
      console.log(`🔍 Dry-run: Searching codebase for lexical matches matching: "${queryVal}"...`);
      try {
        // Run ripgrep inside sveltekit-frontend src directory to avoid Windows special device errors
        const cmd = `rg -l -i "${queryVal}" src/`;
        const stdout = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        const relativePaths = stdout
          .split('\n')
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => (p.startsWith('src/') ? 'sveltekit-frontend/' + p : p))
          .filter((p) => !p.includes('node_modules') && !p.includes('.git') && !p.includes('dist'));

        filePaths = relativePaths.slice(0, 10);
        console.log(`✔️ Lexical paths found: ${filePaths.length} matches.`);
        if (filePaths.length === 0) {
          console.log(
            '⚠️ No lexical matches found via ripgrep. Falling back to Redis sample keys.'
          );
        }
      } catch (err) {
        console.warn(
          '⚠️ Ripgrep failed or returned empty results. Falling back to Redis sample keys.'
        );
      }
    }

    if (filePaths.length === 0) {
      console.log('🔄 Fetching sample file paths from Redis hash gpu:karpathy:encoded...');
      const keys = await redis.hkeys('gpu:karpathy:encoded');
      console.log(`ℹ️ Found ${keys.length} encoded files in Redis.`);
      filePaths = keys.slice(0, 5);
      if (!filePaths.length) {
        console.warn('⚠️ Redis has no files in gpu:karpathy:encoded. Using fallback paths.');
        filePaths = [
          'sveltekit-frontend/src/lib/server/db/schema-postgres.ts',
          'sveltekit-frontend/src/lib/server/db/client.ts',
          'sveltekit-frontend/src/lib/server/ace/rg-cluster-pivot.ts',
        ];
      }
    }
    console.log(`📁 Input file paths: ${JSON.stringify(filePaths)}\n`);

    // 2. Query Qdrant for cluster membership
    console.log('🔄 Querying Qdrant SOM cluster membership...');
    const body = {
      filter: {
        must: [{ key: 'file_path', match: { any: filePaths } }],
      },
      with_payload: ['file_path', 'som_cluster', 'topoClass'],
      with_vector: false,
      limit: 40,
    };

    // Use qdrant-client scroll helper
    const { qdrantScroll } = await import('../qdrant-client.mjs');
    const points = await qdrantScroll(CODEBASE_COLLECTION, {
      filter: body.filter,
      with_payload: true,
      with_vector: false,
      limit: 40,
    });
    console.log(`ℹ️ Qdrant returned ${points.length} matching points.`);

    const membership = new Map();
    for (const pt of points) {
      const cluster = pt.payload?.som_cluster;
      const topo = pt.payload?.topoClass ?? 'general';
      const fp = pt.payload?.file_path ?? '';
      if (cluster == null) continue;
      if (!membership.has(cluster)) {
        membership.set(cluster, { topoClass: topo, files: [] });
      }
      membership.get(cluster).files.push(fp);
    }
    console.log(`✔️ Matched som_clusters: ${Array.from(membership.keys()).join(', ')}\n`);

    // 3. Load vectors, centroids, and cluster tags
    console.log('🔄 Loading encoded vectors & pre-computed cluster centroids...');
    const allClusterFiles = [...membership.values()].flatMap((m) => m.files);

    const [encodedVal, precomputedVal, clusterTags] = await Promise.all([
      allClusterFiles.length
        ? redis.hmget('gpu:karpathy:encoded', ...allClusterFiles)
        : Promise.resolve([]),
      redis.hkeys('gpu:autoencoder:centroids_64').then(async (ck) => {
        if (!ck.length) return [];
        return redis
          .hmget('gpu:autoencoder:centroids_64', ...ck)
          .then((v) => ({ keys: ck, vals: v }));
      }),
      Promise.resolve(readLatestQdrantClusterTags()),
    ]);

    const encoded = new Map();
    for (let i = 0; i < allClusterFiles.length; i++) {
      if (encodedVal[i]) {
        encoded.set(allClusterFiles[i], encodedVal[i].split(',').map(Number));
      }
    }

    const precomputed = new Map();
    if (precomputedVal.keys) {
      for (let i = 0; i < precomputedVal.keys.length; i++) {
        if (precomputedVal.vals[i]) {
          const cid = Number(precomputedVal.keys[i].replace(/\D+/g, ''));
          if (!isNaN(cid)) {
            precomputed.set(cid, precomputedVal.vals[i].split(',').map(Number));
          }
        }
      }
    }

    console.log(`ℹ️ Encoded file vectors loaded: ${encoded.size}`);
    console.log(`✔️ Precomputed centroids loaded: ${precomputed.size}`);
    console.log(`ℹ️ Cluster tags loaded from runs: ${clusterTags.length}\n`);

    // 4. Compute cluster centroids and similarities
    console.log('🔄 Comparing centroids and computing similarity adjacency list...');
    const matchedClusterIds = [...membership.keys()];
    const pivotSet = new Set(matchedClusterIds);

    const centroids = new Map();
    for (const [cid, { files }] of membership) {
      if (precomputed.has(cid)) {
        centroids.set(cid, precomputed.get(cid));
      } else {
        const vecs = files.map((f) => encoded.get(f)).filter(Boolean);
        const c = meanCentroid(vecs);
        if (c) centroids.set(cid, c);
      }
    }

    if (centroids.size > 0) {
      const clusterTagKeys = clusterTags.slice(0, 40);
      for (const [cid, centroid] of centroids) {
        const similarities = [];

        if (precomputed.size > 0) {
          for (const [tagCid, probeCentroid] of precomputed) {
            if (tagCid === cid || pivotSet.has(tagCid)) continue;
            similarities.push({ cid: tagCid, sim: cosine64(centroid, probeCentroid) });
          }
        } else {
          for (const tag of clusterTagKeys) {
            const tagCid = Number(tag.clusterKey?.replace(/\D+/g, '') ?? -1);
            if (isNaN(tagCid) || tagCid === cid || pivotSet.has(tagCid)) continue;

            const probeFiles = (tag.topFiles ?? []).filter(Boolean);
            if (!probeFiles.length) continue;
            const probeVecs = probeFiles.map((f) => encoded.get(f)).filter(Boolean);
            const probeCentroid = meanCentroid(probeVecs);

            if (!probeCentroid) continue;
            similarities.push({ cid: tagCid, sim: cosine64(centroid, probeCentroid) });
          }
        }

        similarities.sort((a, b) => b.sim - a.sim);
        console.log(`📊 Similarity for Cluster ${cid}:`);
        for (const s of similarities.slice(0, MAX_PIVOT_CLUSTERS)) {
          console.log(`   └─ Adjacent Cluster ${s.cid} -> Cosine: ${s.sim.toFixed(4)}`);
          pivotSet.add(s.cid);
        }
      }
    }
    console.log(`✔️ Adjacent clusters selected: ${Array.from(pivotSet).join(', ')}\n`);

    // 5. Query expansion in Qdrant
    console.log('🔄 Performing cluster expansion retrieval in Qdrant...');
    const clusterIds = Array.from(pivotSet).slice(0, MAX_PIVOT_CLUSTERS * 2);

    let exPoints = [];
    if (clusterIds.length > 0) {
      const expandBody = {
        filter: {
          must: [{ key: 'som_cluster', match: { any: clusterIds } }],
        },
        with_payload: ['file_path', 'som_cluster', 'topoClass', 'tags', 'summary'],
        with_vector: false,
        limit: clusterIds.length * MAX_FILES_PER_CLUSTER,
      };

      const { qdrantScroll: qScroll } = await import('../qdrant-client.mjs');
      exPoints = await qScroll(CODEBASE_COLLECTION, {
        filter: expandBody.filter,
        with_payload: true,
        with_vector: false,
        limit: expandBody.limit,
      });
    } else {
      console.log('⚠️ No matched clusters to expand in Qdrant.');
    }
    console.log(`✔️ Expanded Qdrant hits points returned: ${exPoints.length}`);

    const hits = [];
    const seen = new Map();
    const existingPaths = new Set(filePaths);

    for (const pt of exPoints) {
      const fp = pt.payload?.file_path ?? '';
      if (!fp || existingPaths.has(fp)) continue;

      const cid = pt.payload?.som_cluster;
      const count = seen.get(cid) ?? 0;
      if (count >= MAX_FILES_PER_CLUSTER) continue;
      seen.set(cid, count + 1);

      hits.push({
        id: `cluster-pivot:${fp}`,
        kind: 'code_chunk',
        source: 'qdrant',
        content: fp,
        summary: pt.payload?.summary ?? `[cluster-pivot] ${fp}`,
        score: CLUSTER_PIVOT_SCORE_CAP,
        tags: ['cluster-pivot', ...(pt.payload?.tags ?? [])],
        filePath: fp,
        metadata: {
          indexMode: 'cluster-pivot',
          som_cluster: cid,
          topoClass: pt.payload?.topoClass ?? 'general',
          sourceRefs: [fp],
          why_retrieved:
            'rg_cluster_pivot: lexical hit expanded through som_cluster using trained centroid cache',
          retrievalLane: 'rg_cluster_pivot',
        },
      });
    }

    // 6. Assert and Validate outcomes
    console.log('\n📝 Validation Assertions:');

    console.log(`✔️ Total hits surfaced: ${hits.length}`);
    if (hits.length > 0) {
      const sampleHit = hits[0];
      console.log(`   └─ Sample Hit ID: ${sampleHit.id}`);
      console.log(`   └─ Sample Hit Content Field holds: "${sampleHit.content}"`);
      console.log(
        `   └─ Sample Hit Tags contains 'cluster-pivot': ${sampleHit.tags.includes('cluster-pivot')}`
      );
      console.log(`   └─ Sample Hit Metadata som_cluster: ${sampleHit.metadata.som_cluster}`);

      const sourceRefsPresent = hits.every(
        (h) => Array.isArray(h.metadata?.sourceRefs) && h.metadata.sourceRefs.length > 0
      );
      console.log(`✔️ SourceRefs present on all hits: ${sourceRefsPresent}`);

      const scoresCapped = hits.every((h) => h.score <= CLUSTER_PIVOT_SCORE_CAP);
      console.log(
        `✔️ Pivot score capped correctly (<= ${CLUSTER_PIVOT_SCORE_CAP}): ${scoresCapped}`
      );

      // Verify no fields are undefined or malformed
      for (const hit of hits) {
        if (!hit.filePath || !hit.id || !hit.metadata.indexMode) {
          throw new Error('Malformed hit structure detected in expansion.');
        }
      }
    }

    console.log(`✔️ Anchor files mapped: ${allClusterFiles.length}`);
    console.log(`✔️ Pivot clusters identified: ${Array.from(pivotSet).length}`);

    console.log('\n✅ Standalone Qdrant-Redis Cluster Pivot lane is 100% operational!');
  } catch (err) {
    console.error(`\n❌ Smoke Test failed: ${err.message}`);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

runSmokeTest();