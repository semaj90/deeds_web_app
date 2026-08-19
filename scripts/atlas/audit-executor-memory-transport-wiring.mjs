#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function contains(file, patterns) {
  try {
    const text = await fs.readFile(path.join(root, file), 'utf8');
    return patterns.every((pattern) => typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text));
  } catch {
    return false;
  }
}

async function exists(file) {
  try { await fs.access(path.join(root, file)); return true; } catch { return false; }
}

const gates = {
  RAPIDS_SIDECAR: await exists('python/atlas_rapids_sidecar.py'),
  CUVS_EXACT_PRESENT: await contains('python/atlas_rapids_sidecar.py', ['brute_force.build', 'brute_force.search']),
  CAGRA_PRESENT: await contains('python/atlas_rapids_sidecar.py', ['cagra_neighbors.build', 'cagra_neighbors.search']),
  CUGRAPH_PRESENT: await contains('sveltekit-frontend/scripts/atlas/cugraph-pagerank.py', ['cugraph']),
  CUTILE_PROBE_PRESENT: await exists('python/parent_atlas_cutile_sm86_probe.py'),
  GPU_LEASE_PRESENT: await exists('sveltekit-frontend/schemas/atlas/runtime/gpu-lease.v1.okf'),
  EXECUTION_DATA_REF_PRESENT: await exists('sveltekit-frontend/schemas/atlas/runtime/execution-data-ref.v1.okf'),
  RESOURCE_PLAN_PRESENT: await exists('sveltekit-frontend/schemas/atlas/runtime/execution-resource-plan.v1.okf'),
  PRECOMPUTED_SIGNAL_REUSE_PRESENT: await exists('sveltekit-frontend/src/lib/server/atlas/runtime/precomputed-signal-registry.ts'),
  TRPC_HELPER_PRESENT: await exists('sveltekit-frontend/src/lib/server/trpc/helpers/atlas-runtime-capabilities.ts'),
  SIMdJSON_PRESENT: (await exists('simd-bridge/cpp/simdjson_bridge.cc')) || (await exists('sveltekit-frontend/src/lib/server/native/simdjson.ts')),
  DUCKDB_PRESENT: (await exists('sveltekit-frontend/src/lib/server/db/duckdb.ts')) || (await contains('package.json', [/duckdb/i])),
  VALKEY_OR_REDIS_PRESENT: (await exists('sveltekit-frontend/src/lib/server/redis.ts')) || (await contains('sveltekit-frontend/package.json', [/redis|valkey/i])),
  GRPC_PRESENT: (await contains('go.mod', [/grpc/i])) || (await contains('sveltekit-frontend/package.json', [/grpc/i])),
  QUIC_PRESENT: (await contains('go.mod', [/quic-go/i])) || (await contains('sveltekit-frontend/go.mod', [/quic-go/i])),
  RUST_PRESENT: (await exists('Cargo.toml')) || (await exists('simd-bridge/rust/Cargo.toml')),
};

// Semantic correctness gate is intentionally independent from package presence.
const rapidsSource = await fs.readFile(path.join(root, 'python/atlas_rapids_sidecar.py'), 'utf8').catch(() => '');
gates.RAPIDS_SEMANTIC_COSINE =
  /brute_force\.build\([^\n]+metric\s*=\s*["']cosine["']/.test(rapidsSource) &&
  /cagra_neighbors\.IndexParams\([\s\S]*?metric\s*=\s*["']cosine["']/.test(rapidsSource) &&
  !/metric\s*=\s*["']sqeuclidean["']/.test(rapidsSource);

const failed = Object.entries(gates).filter(([, value]) => !value).map(([name]) => name);
console.log(JSON.stringify({
  schema: 'atlas.executor-memory-transport-wiring-audit.v1',
  status: failed.length ? 'PARTIAL' : 'PROVEN_STATIC_WIRING',
  gates,
  failed,
  notes: [
    'Presence does not prove runtime package versions or numerical parity.',
    'RAPIDS semantic cosine is a correctness blocker; do not override it with package-availability proof.',
    'DuckDB/simdjson/Redis/Rust/Go/QUIC remain helpers/executors behind existing ownership boundaries.',
  ],
}, null, 2));
process.exitCode = failed.length ? 1 : 0;
