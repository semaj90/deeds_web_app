#!/usr/bin/env node
/**
 * turbovec-grpc-health.mjs
 * Probe the TurboVec gRPC server Health() method.
 *
 * Usage:
 *   node scripts/atlas/turbovec-grpc-health.mjs
 *   node scripts/atlas/turbovec-grpc-health.mjs --url=127.0.0.1:50062
 *   node scripts/atlas/turbovec-grpc-health.mjs --timeout=5000
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args         = process.argv.slice(2);
const urlArg       = args.find(a => a.startsWith('--url='));
const timeoutArg   = args.find(a => a.startsWith('--timeout='));
const GRPC_URL     = urlArg     ? urlArg.split('=', 2)[1]     : (process.env.TURBOVEC_SIDECAR_GRPC_URL ?? '127.0.0.1:50062');
const TIMEOUT_MS   = Number(timeoutArg ? timeoutArg.split('=', 2)[1] : 5000) || 5000;
const PROTO_PATH   = path.resolve(__dirname, '../../proto/active/turbovec_cuda.proto');

// Candidate node_modules roots — script may be called from repo root or sveltekit-frontend
const CANDIDATE_ROOTS = [
  path.resolve(__dirname, '../../sveltekit-frontend/node_modules'),
  path.resolve(__dirname, '../../node_modules'),
  path.resolve(process.cwd(), 'node_modules'),
  path.resolve(process.cwd(), '../node_modules'),
];

function makeRequire(root) {
  return createRequire(pathToFileURL(path.join(root, '_dummy.js')).href);
}

async function tryLoadGrpc() {
  for (const root of CANDIDATE_ROOTS) {
    try {
      const req = makeRequire(root);
      const grpc        = req('@grpc/grpc-js');
      const protoLoader = req('@grpc/proto-loader');
      return { grpc, protoLoader };
    } catch { /* try next */ }
  }
  return null;
}

async function main() {
  const loaded = await tryLoadGrpc();
  if (!loaded) {
    console.error(JSON.stringify({
      ok: false,
      url: GRPC_URL,
      error: '@grpc/grpc-js not found in any candidate node_modules root',
      tried: CANDIDATE_ROOTS,
    }));
    process.exit(1);
  }

  const { grpc, protoLoader } = loaded;

  const packageDef = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const descriptor = grpc.loadPackageDefinition(packageDef);
  const pkg        = descriptor.turbovec;
  const client     = new pkg.TurboVecCudaService(
    GRPC_URL,
    grpc.credentials.createInsecure()
  );

  const deadline = Date.now() + TIMEOUT_MS;

  client.health({}, { deadline }, (err, response) => {
    client.close();
    if (err) {
      console.error(JSON.stringify({ ok: false, url: GRPC_URL, error: err.message }));
      process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, url: GRPC_URL, ...response }, null, 2));
    process.exit(0);
  });
}

main().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
