/**
 * Parent Atlas: Qdrant Collection Pruning Audit (Read-Only)
 *
 * Scans active Qdrant collections at 127.0.0.1:6333.
 * Targets exclusively:
 *  - Empty collections (points_count === 0)
 *  - Test collections with explicit 'test' tag
 *
 * Lists possible empty/test candidates for owner review. Deletion is disabled
 * until collection ownership and isolated recovery are independently proven.
 *
 * Usage:
 *   node scripts/atlas/prune-empty-qdrant-collections.mjs
 */

import http from 'node:http';

const QDRANT_HOST = '127.0.0.1';
const QDRANT_PORT = 6333;

// Exact protected collections that MUST NEVER be pruned under any circumstances
const PROTECTED_COLLECTIONS = new Set([
  'codebase_chunks_768',
  'codebase_chunks_768_v2',
  'codebase_topology_64',
  'codebase_chunks_latent256',
  'codebase_chunks_512',
  'taxonomy_nodes_768',
  'phase110_baseline_768',
  'BifrostSemanticCachePlugin',
  'cluster_narratives',
  'llm_response_cache',
  'error_embeddings',
  'error_embedding_mrl_128',
  'error_embedding_mrl_256',
  'error_embedding_mrl_512',
]);

function request(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: QDRANT_HOST,
        port: QDRANT_PORT,
        path,
        method: 'GET',
        timeout: 10000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ raw: body, statusCode: res.statusCode });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('[Qdrant-Prune] Mode: READ-ONLY AUDIT');
  console.log(`[Qdrant-Prune] Connecting to ${QDRANT_HOST}:${QDRANT_PORT}...`);

  const listRes = await request('/collections');
  const collections = listRes?.result?.collections || [];
  console.log(`[Qdrant-Prune] Discovered ${collections.length} total collections on server.`);

  const candidates = [];
  const retained = [];

  for (const c of collections) {
    const name = c.name;
    if (PROTECTED_COLLECTIONS.has(name)) {
      retained.push({ name, reason: 'EXPLICIT_PROTECTED_LIST' });
      continue;
    }

    const infoRes = await request(`/collections/${encodeURIComponent(name)}`);
    const pointsCount = infoRes?.result?.points_count;
    if (!Number.isSafeInteger(pointsCount) || pointsCount < 0) {
      throw new Error(`COLLECTION_INFO_UNVERIFIED:${name}`);
    }
    const isTest = name.includes('sparse_test');

    if (pointsCount === 0 || isTest) {
      candidates.push({
        name,
        pointsCount,
        reason: pointsCount === 0 ? 'EMPTY_COLLECTION_0_PTS' : 'EXPLICIT_TEST_COLLECTION',
      });
    } else {
      retained.push({
        name,
        pointsCount,
        reason: 'ACTIVE_POPULATED_DATA',
      });
    }
  }

  console.log('\n============================================================');
  console.log(`PRUNING CANDIDATES (${candidates.length}):`);
  console.log('============================================================');
  for (const cand of candidates) {
    console.log(` - ${cand.name.padEnd(35)} [${cand.pointsCount} pts] (${cand.reason})`);
  }

  console.log('\n============================================================');
  console.log(`RETAINED ACTIVE COLLECTIONS (${retained.length}):`);
  console.log('============================================================');
  for (const ret of retained) {
    console.log(` - ${ret.name.padEnd(35)} [${ret.pointsCount ?? 'N/A'} pts] (${ret.reason})`);
  }

  console.log('\n[READ-ONLY AUDIT COMPLETE] No collections were deleted.');
  console.log('Deletion remains disabled pending owner review and isolated recovery proof.');
}

main().catch(console.error);
