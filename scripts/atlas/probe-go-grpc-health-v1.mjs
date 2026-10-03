#!/usr/bin/env node
/**
 * Read-only, bounded Health RPC probe for the three Go service owners.
 * Usage: node scripts/atlas/probe-go-grpc-health-v1.mjs --service=retrieval|search|embedding [--url=host:port]
 * This invokes only the service's Health RPC; it never sends search, embedding, or mutation requests.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const serviceArg = process.argv.find((arg) => arg.startsWith('--service='))?.split('=', 2)[1];
const urlArg = process.argv.find((arg) => arg.startsWith('--url='))?.split('=', 2)[1];
const timeoutArg = process.argv.find((arg) => arg.startsWith('--timeout='))?.split('=', 2)[1];
const timeoutMs = Math.min(10_000, Math.max(500, Number(timeoutArg) || 4_000));
const services = {
  retrieval: { port: 50053, proto: 'retrieval.proto', package: ['yorha', 'retrieval'], service: 'RetrievalService', requestService: 'retrieval' },
  search: { port: 50055, proto: 'library_search.proto', package: ['library', 'search'], service: 'LibrarySearchService', requestService: 'search' },
  embedding: { port: 50051, proto: 'embedding.proto', package: ['embedding'], service: 'EmbeddingService', requestService: 'embedding' }
};

function fail(message) {
  process.stdout.write(`${JSON.stringify({ schema: 'atlas.go-grpc-health-probe.v1', readOnly: true, writesPerformed: false, canonicalAuthority: false, ok: false, error: message })}\n`);
  process.exitCode = 1;
}

async function main() {
  const config = services[serviceArg];
  if (!config) return fail('Supply --service=retrieval, --service=search, or --service=embedding.');
  const url = urlArg ?? `127.0.0.1:${config.port}`;
  const protoPath = path.join(repoRoot, 'proto', 'active', config.proto);
  const includeDirs = [path.join(repoRoot, 'proto', 'active'), path.join(repoRoot, 'proto')];
  const moduleRoots = [path.join(repoRoot, 'sveltekit-frontend', 'node_modules'), path.join(repoRoot, 'node_modules')];
  let grpc;
  let protoLoader;
  for (const root of moduleRoots) {
    try {
      const req = createRequire(pathToFileURL(path.join(root, '_probe.js')).href);
      grpc = req('@grpc/grpc-js');
      protoLoader = req('@grpc/proto-loader');
      break;
    } catch { /* try next installed dependency root */ }
  }
  if (!grpc || !protoLoader) return fail('@grpc/grpc-js or @grpc/proto-loader is unavailable in the repository dependencies.');

  let client;
  let timer;
  try {
    const definition = await protoLoader.load(protoPath, {
      includeDirs, keepCase: false, longs: Number, enums: String, defaults: true, oneofs: true
    });
    let descriptor = grpc.loadPackageDefinition(definition);
    for (const key of config.package) descriptor = descriptor[key];
    const Service = descriptor[config.service];
    if (!Service) throw new Error(`Service ${config.service} missing from ${config.proto}`);
    client = new Service(url, grpc.credentials.createInsecure());
    const response = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Health RPC timed out after ${timeoutMs}ms`)), timeoutMs + 250);
      client.health({ service: config.requestService }, { deadline: Date.now() + timeoutMs }, (err, value) => {
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(value);
      });
    });
    process.stdout.write(`${JSON.stringify({
      schema: 'atlas.go-grpc-health-probe.v1', generatedAt: new Date().toISOString(),
      service: serviceArg, endpoint: url, rpc: 'Health', rpcReachable: true,
      serviceHealth: response.status ?? 'UNKNOWN', response,
      readOnly: true, writesPerformed: false, canonicalAuthority: false
    }, null, 2)}\n`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    if (timer) clearTimeout(timer);
    client?.close();
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
