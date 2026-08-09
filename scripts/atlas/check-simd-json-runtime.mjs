#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import os from 'os';

const root = resolve(process.cwd());
const files = {
  bridge: resolve(root, 'sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts'),
  jsonFast: resolve(root, 'sveltekit-frontend/src/lib/server/utils/json-fast.ts'),
  simdUtil: resolve(root, 'sveltekit-frontend/src/lib/utils/simd-json-parser.ts'),
  qdrantSmoke: resolve(root, 'sveltekit-frontend/scripts/qdrant/simdjson-smoke.mjs'),
  dispatchSmoke: resolve(root, 'sveltekit-frontend/scripts/tests/smoke-simdjson-dispatch.mjs'),
  qdrantParserSmoke: resolve(root, 'sveltekit-frontend/scripts/smoke/qdrant-simdjson-parser-smoke.mjs'),
  nativeScan: resolve(root, 'parent-atlas-graph-runtime-enhancement/native/simdjson_edge_scan.cpp'),
  rustBuilder: resolve(root, 'scripts/simd/build-rust-simdjson.mjs'),
};

function hasAvx2() {
  const flags = os.cpus?.()?.[0]?.flags;
  if (Array.isArray(flags)) return flags.includes('avx2');
  try {
    const cpuinfo = readFileSync('/proc/cpuinfo', 'utf8');
    return /(?:^|\s)avx2(?:\s|$)/i.test(cpuinfo);
  } catch {
    return false;
  }
}

async function tryImportBridge() {
  try {
    const bridgeUrl = pathToFileURL(resolve(root, 'sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts')).href;
    const bridge = await import(bridgeUrl);
    return {
      import_ok: true,
      active_backend: bridge?.isSimdJsonAvailable?.() ? 'native' : 'json.parse',
      bridge_exports: {
        fastJsonParse: typeof bridge?.fastJsonParse === 'function',
        isSimdJsonAvailable: typeof bridge?.isSimdJsonAvailable === 'function',
      },
    };
  } catch (error) {
    return {
      import_ok: false,
      import_error: error instanceof Error ? error.message : String(error),
      active_backend: 'unknown',
      bridge_exports: {
        fastJsonParse: false,
        isSimdJsonAvailable: false,
      },
    };
  }
}

const bridge = await tryImportBridge();
const report = {
  bridge_present: existsSync(files.bridge),
  json_fast_present: existsSync(files.jsonFast),
  legacy_simd_parser_present: existsSync(files.simdUtil),
  native_scan_present: existsSync(files.nativeScan),
  rust_builder_present: existsSync(files.rustBuilder),
  smoke_present: {
    qdrant: existsSync(files.qdrantSmoke),
    dispatch: existsSync(files.dispatchSmoke),
    qdrant_parser: existsSync(files.qdrantParserSmoke),
  },
  avx2_available: hasAvx2(),
  bridge_import_ok: bridge.import_ok,
  bridge_import_error: bridge.import_error ?? null,
  active_backend: bridge.active_backend,
  bridge_exports: bridge.bridge_exports,
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
  },
};

console.log(JSON.stringify(report, null, 2));

if (!report.bridge_present) process.exitCode = 1;
