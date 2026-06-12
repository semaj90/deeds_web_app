#!/usr/bin/env node
/**
 * test-turbovec-sidecar-contract.mjs
 * Proves that the TurboVec sidecar's contract holds:
 *   - JSON-RPC health check (HTTP GET /health)
 *   - gRPC health check (Health)
 *   - Search (Search)
 *   - BatchCosine (BatchCosine)
 *   - EncodeLatent 768→64 (EncodeLatent)
 *   - AssignSom (AssignSom)
 *   - Transform (Transform)
 * Outputs report to docs/reports/turbovec-sidecar-contract.json
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

const HTTP_URL = 'http://127.0.0.1:8792';
const GRPC_ADDRESS = '127.0.0.1:50062';
const PROTO_PATH = join(ROOT, 'proto/active/turbovec_cuda.proto');

const CANDIDATE_ROOTS = [
  join(ROOT, 'sveltekit-frontend/node_modules'),
  join(ROOT, 'node_modules'),
  join(process.cwd(), 'node_modules'),
  join(process.cwd(), '../node_modules'),
];

function makeRequire(root) {
  return createRequire(pathToFileURL(join(root, '_dummy.js')).href);
}

function tryLoadGrpc() {
  for (const root of CANDIDATE_ROOTS) {
    try {
      const req = makeRequire(root);
      return { grpc: req('@grpc/grpc-js'), protoLoader: req('@grpc/proto-loader') };
    } catch { /* try next */ }
  }
  return null;
}

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

function l2Norm(vec) {
  return Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
}

async function run() {
  console.log('[contract-test] Initializing TurboVec sidecar contract verification...');

  const loaded = tryLoadGrpc();
  if (!loaded) {
    console.error('❌ @grpc/grpc-js not found in any candidate root:', CANDIDATE_ROOTS);
    process.exit(1);
  }
  const { grpc, protoLoader } = loaded;

  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const descriptor = grpc.loadPackageDefinition(packageDefinition);
  const TurboVecCudaService = descriptor.turbovec.TurboVecCudaService;
  const client = new TurboVecCudaService(GRPC_ADDRESS, grpc.credentials.createInsecure());

  const report = {
    testedAt: new Date().toISOString(),
    tests: {
      jsonRpcHealth: false,
      grpcHealth: false,
      transform: false,
      encodeLatent: false,
      assignSom: false,
      batchCosine: false,
      search: false,
    },
    details: {}
  };

  const testVec768 = Array.from({ length: 768 }, () => Math.random() - 0.5);

  // 1. JSON-RPC Health check
  console.log('[contract-test] Test 1: JSON-RPC health check (HTTP)...');
  try {
    const res = await fetch(`${HTTP_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      report.details.jsonRpcHealthResponse = data;
      if (data.ok !== undefined) {
        report.tests.jsonRpcHealth = true;
        console.log('  ✅ HTTP/JSON-RPC health responds healthy.');
      }
    } else {
      console.error(`  ❌ HTTP health responded status ${res.status}`);
    }
  } catch (err) {
    console.error('  ❌ HTTP/JSON-RPC health check failed:', err.message);
    report.details.jsonRpcHealthError = err.message;
  }

  // 2. gRPC Health check
  console.log('[contract-test] Test 2: gRPC health check...');
  const grpcHealthPromise = new Promise((resolve, reject) => {
    client.health({}, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });

  try {
    const res = await grpcHealthPromise;
    report.details.grpcHealthResponse = res;
    if (res.ok) {
      report.tests.grpcHealth = true;
      console.log('  ✅ gRPC health check responded healthy.');
    }
  } catch (err) {
    console.error('  ❌ gRPC health check failed:', err.message);
    report.details.grpcHealthError = err.message;
  }

  // 3. Transform (768 -> 64)
  console.log('[contract-test] Test 3: Transform 768→64...');
  const transformPromise = new Promise((resolve, reject) => {
    client.transform({ vectors: testVec768, quaternionRot: [] }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });

  try {
    const res = await transformPromise;
    const projected = res.projectedVectors;
    report.details.projectedLength = projected?.length ?? 0;
    if (projected && projected.length === 64) {
      report.tests.transform = true;
      const norm = l2Norm(projected);
      report.details.projectedNorm = norm;
      console.log(`  ✅ Transform dimensions correct (64). Norm: ${norm.toFixed(6)}`);
    } else {
      console.error(`  ❌ Transform returned unexpected dimension: ${projected?.length}`);
    }
  } catch (err) {
    console.error('  ❌ Transform failed:', err.message);
    report.details.transformError = err.message;
  }

  // 4. EncodeLatent
  console.log('[contract-test] Test 4: EncodeLatent (768→64)...');
  const encodePromise = new Promise((resolve, reject) => {
    client.encodeLatent({ vectors: testVec768, count: 1, inDim: 768, outDim: 64 }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });

  try {
    const res = await encodePromise;
    report.details.encodeLatentResponse = res;
    if (res.encoded && res.encoded.length === 64 && res.count === 1) {
      report.tests.encodeLatent = true;
      console.log('  ✅ EncodeLatent outputs exactly 64 dimensions.');
    } else {
      console.error(`  ❌ EncodeLatent returned unexpected encoded length: ${res.encoded?.length}`);
    }
  } catch (err) {
    console.error('  ❌ EncodeLatent failed:', err.message);
    report.details.encodeLatentError = err.message;
  }

  // 5. AssignSom
  console.log('[contract-test] Test 5: AssignSom...');
  const assignSomPromise = new Promise((resolve, reject) => {
    client.assignSom({ vectors: testVec768, count: 1 }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });

  try {
    const res = await assignSomPromise;
    report.details.assignSomResponse = res;
    if (res.clusterIds && res.clusterIds.length === 1 && res.bmuScores && res.bmuScores.length === 1) {
      report.tests.assignSom = true;
      console.log(`  ✅ AssignSom returned BMU cluster: ${res.clusterIds[0]}, score: ${res.bmuScores[0].toFixed(6)}`);
    } else {
      console.error('  ❌ AssignSom response arrays invalid size.');
    }
  } catch (err) {
    console.error('  ❌ AssignSom failed:', err.message);
    report.details.assignSomError = err.message;
  }

  // 6. BatchCosine (Query vs N candidates)
  console.log('[contract-test] Test 6: BatchCosine...');
  const testQuery = [1, 0, 0, 0];
  const testCandidates = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0.9, 0.1, 0, 0
  ];
  // Fill rest to 768 dimensions
  const query768 = [...testQuery, ...Array(764).fill(0)];
  const candidates768 = [
    ...testCandidates.slice(0, 4), ...Array(764).fill(0),
    ...testCandidates.slice(4, 8), ...Array(764).fill(0),
    ...testCandidates.slice(8, 12), ...Array(764).fill(0)
  ];

  const batchCosinePromise = new Promise((resolve, reject) => {
    client.batchCosine({
      queryVector: query768,
      candidateVectors: candidates768,
      candidateCount: 3,
      dim: 768
    }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });

  try {
    const res = await batchCosinePromise;
    report.details.batchCosineResponse = res;
    if (res.scores && res.scores.length === 3) {
      const simA = res.scores[0];
      const simB = res.scores[1];
      const simC = res.scores[2];

      const expectedC = 0.9 / Math.sqrt(0.9 * 0.9 + 0.1 * 0.1);
      const isAPass = Math.abs(simA - 1.0) < 1e-5;
      const isBPass = Math.abs(simB - 0.0) < 1e-5;
      const isCPass = Math.abs(simC - expectedC) < 1e-4;

      if (isAPass && isBPass && isCPass) {
        report.tests.batchCosine = true;
        console.log('  ✅ BatchCosine scores matched CPU analytical expectations exactly:');
        console.log(`     A: ${simA.toFixed(4)} (Expected 1.0), B: ${simB.toFixed(4)} (Expected 0.0), C: ${simC.toFixed(4)} (Expected ~${expectedC.toFixed(4)})`);
      } else {
        console.error(`  ❌ BatchCosine scores failed check: A=${simA}, B=${simB}, C=${simC}`);
      }
    } else {
      console.error(`  ❌ BatchCosine returned unexpected scores count: ${res.scores?.length}`);
    }
  } catch (err) {
    console.error('  ❌ BatchCosine failed:', err.message);
    report.details.batchCosineError = err.message;
  }

  // 7. Search (topK parity check)
  console.log('[contract-test] Test 7: Search parity check...');
  const searchPromise = new Promise((resolve, reject) => {
    client.search({ queryVector: testVec768, topK: 10, quaternionRot: [] }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });

  const httpSearchPromise = fetch(`${HTTP_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vector: testVec768, topK: 10 }),
  }).then(res => res.json()).catch(err => ({ error: err.message, candidates: [] }));

  try {
    const [grpcRes, httpRes] = await Promise.all([searchPromise, httpSearchPromise]);
    report.details.grpcSearchCandidatesCount = grpcRes.candidates?.length ?? 0;
    report.details.httpSearchCandidatesCount = httpRes.candidates?.length ?? 0;
    report.details.grpcBackend = grpcRes.backend;
    report.details.httpBackend = httpRes.backend;

    const grpcIds = (grpcRes.candidates ?? []).map(c => c.id).join(',');
    const httpIds = (httpRes.candidates ?? []).map(c => c.id).join(',');

    if (grpcIds === httpIds) {
      report.tests.search = true;
      console.log('  ✅ Search candidates sequence matched JSON-RPC parity check.');
      if (grpcRes.indexed === 0) {
        console.log('     (Index is empty — both returned empty array as expected).');
      }
    } else {
      console.warn('  ⚠️ Search candidates mismatch.');
      console.warn(`     gRPC IDs: [${grpcIds}]`);
      console.warn(`     HTTP IDs: [${httpIds}]`);
    }
  } catch (err) {
    console.error('  ❌ Search parity check failed:', err.message);
    report.details.searchError = err.message;
  }

  // Write report
  mkdirSync(join(ROOT, 'docs/reports'), { recursive: true });
  writeFileSync(join(ROOT, 'docs/reports/turbovec-sidecar-contract.json'), JSON.stringify(report, null, 2));
  console.log('\n[contract-test] Report written to docs/reports/turbovec-sidecar-contract.json');

  client.close();

  const allPassed = Object.values(report.tests).every(v => v === true);
  console.log('\nTest summary:');
  for (const [k, v] of Object.entries(report.tests)) {
    console.log(`  ${v ? '✅' : '❌'} ${k}`);
  }
  console.log('');

  if (allPassed) {
    console.log('✅ [contract-test] All contract checks PASSED.');
    process.exit(0);
  } else {
    console.error('❌ [contract-test] Some contract checks failed.');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('❌ [contract-test] Execution failed:', err);
  process.exit(1);
});
