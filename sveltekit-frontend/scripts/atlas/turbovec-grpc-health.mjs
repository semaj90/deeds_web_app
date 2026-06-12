#!/usr/bin/env node
/**
 * turbovec-grpc-health.mjs
 * Health check probe for the TurboVec Cuda gRPC server.
 */
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROTO_PATH = path.resolve(__dirname, '../../../proto/active/turbovec_cuda.proto');
const GRPC_PORT = Number(process.env.TURBOVEC_SIDECAR_GRPC_URL ? process.env.TURBOVEC_SIDECAR_GRPC_URL.split(':')[1] : 50062);
const ADDRESS = `127.0.0.1:${GRPC_PORT}`;

console.log(`[grpc-health] Probing TurboVec gRPC server at ${ADDRESS}...`);

try {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const descriptor = grpc.loadPackageDefinition(packageDefinition);
  const TurboVecCudaService = descriptor.turbovec.TurboVecCudaService;

  const client = new TurboVecCudaService(ADDRESS, grpc.credentials.createInsecure());

  const queryVector = new Array(768).fill(0.0);

  client.search(
    { queryVector, topK: 1, quaternionRot: [] },
    { deadline: Date.now() + 2000 },
    (err, response) => {
      if (err) {
        console.error(`❌ [grpc-health] Probe failed: ${err.message}`);
        process.exit(1);
      }
      console.log(`✅ [grpc-health] Probe succeeded! Backend: ${response.backend}, candidates count: ${response.candidates?.length ?? 0}`);
      client.close();
      process.exit(0);
    }
  );
} catch (e) {
  console.error(`❌ [grpc-health] Failed to initialize probe: ${e.message}`);
  process.exit(1);
}
