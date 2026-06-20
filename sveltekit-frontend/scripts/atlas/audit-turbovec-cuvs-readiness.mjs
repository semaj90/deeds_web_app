#!/usr/bin/env node
/**
 * audit-turbovec-cuvs-readiness.mjs
 *
 * Check readiness for TurboVec (Stage 1.5) and cuVS (GPU vector similarity) deployment:
 * - HTTP health check on TurboVec sidecar (:50062)
 * - Qdrant collection status (:6333)
 * - Verify tensorrt_bridge.node addon is available and loads
 * - Check cuVS library presence and compression support
 * - Validate payload structure for reranking
 *
 * Output: readiness report with blockers and recommendations
 *
 * No mutations. Read-only audit.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const WORKSPACE_ROOT = path.resolve(REPO_ROOT, '..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');

async function checkHttpService(url, timeout = 5000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return {
      available: res.ok,
      status: res.status,
      statusText: res.statusText,
    };
  } catch (err) {
    return {
      available: false,
      error: err.message,
    };
  }
}

async function checkTensorrtBridge() {
  const require = createRequire(import.meta.url);
  try {
    const addonPath = path.resolve(WORKSPACE_ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node');
    const stats = await fs.stat(addonPath);

    try {
      // Try to load the addon
      const addon = require(addonPath);
      return {
        exists: true,
        size: stats.size,
        loadable: true,
        functions: Object.keys(addon).filter((k) => typeof addon[k] === 'function'),
      };
    } catch (err) {
      return {
        exists: true,
        size: stats.size,
        loadable: false,
        error: err.message,
      };
    }
  } catch (err) {
    return {
      exists: false,
      error: err.message,
    };
  }
}

async function checkCuvsLibrary(addonFunctions = []) {
  if (addonFunctions.includes('cuvsCompressEmbedding')) {
    return {
      available: true,
      path: 'tensorrt_bridge.node:cuvsCompressEmbedding',
      note: 'cuVS-compatible compression is exposed by the loaded native addon',
    };
  }

  // Linux/container fallback.
  try {
    const cuvsPath = '/usr/local/cuda/lib64/libcuvs.so';
    await fs.stat(cuvsPath);
    return {
      available: true,
      path: cuvsPath,
    };
  } catch {
    return {
      available: false,
      path: '/usr/local/cuda/lib64/libcuvs.so',
      note: 'cuVS may not be installed or not in expected location',
    };
  }
}

async function checkQdrantCollection(qdrantUrl, collectionName) {
  try {
    const res = await fetch(`${qdrantUrl}/collections/${collectionName}`);
    if (!res.ok) {
      return {
        available: false,
        status: res.status,
      };
    }

    const data = await res.json();
    return {
      available: true,
      points_count: data.result?.points_count || 0,
      vectors_count: data.result?.vectors_count || 0,
      config: data.result?.config || {},
    };
  } catch (err) {
    return {
      available: false,
      error: err.message,
    };
  }
}

async function checkPayloadStructure(qdrantUrl, collectionName) {
  // Sample a point to verify payload has reranking fields
  try {
    const res = await fetch(`${qdrantUrl}/collections/${collectionName}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1, with_payload: true, with_vector: false }),
    });
    if (!res.ok) return { available: false };

    const data = await res.json();
    if (!data.result?.points || data.result.points.length === 0) {
      return { available: false, points_in_collection: false };
    }

    const point = data.result.points[0];
    const payload = point.payload || {};

    return {
      available: true,
      has_source_ref: 'source_ref' in payload,
      has_feature_id: 'feature_id' in payload,
      has_tags: 'tags' in payload,
      has_community_id: 'community_id' in payload,
      payload_fields: Object.keys(payload),
    };
  } catch (err) {
    return {
      available: false,
      error: err.message,
    };
  }
}

async function main() {
  loadAtlasEnv(REPO_ROOT);
  const turbovecUrl = process.env.TURBOVEC_URL || 'http://127.0.0.1:50062';
  const qdrantUrl = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

  const startTime = Date.now();
  const report = {
    generated_at: new Date().toISOString(),
    checks: {
      turbovec_http: {},
      qdrant_http: {},
      tensorrt_bridge: {},
      cuvs_library: {},
      qdrant_collection: {},
      payload_structure: {},
    },
    blockers: [],
    warnings: [],
    readiness_score: 0,
    gates_pass: false,
  };

  try {
    console.log(`[audit-turbovec-cuvs] Starting readiness audit...`);

    // Check 1: TurboVec HTTP service
    console.log(`\n[1/6] Checking TurboVec sidecar at ${turbovecUrl}...`);
    report.checks.turbovec_http = await checkHttpService(`${turbovecUrl}/health`);
    if (!report.checks.turbovec_http.available) {
      report.warnings.push('TurboVec sidecar not available at :50062; N-API fallback remains available');
      console.log(`  ⚠️ TurboVec sidecar not available`);
    } else {
      console.log(`  ✅ TurboVec available`);
    }

    // Check 2: Qdrant HTTP service
    console.log(`\n[2/6] Checking Qdrant at ${qdrantUrl}...`);
    report.checks.qdrant_http = await checkHttpService(`${qdrantUrl}/collections`);
    if (!report.checks.qdrant_http.available) {
      report.blockers.push('Qdrant not available at :6333');
      console.log(`  ❌ Qdrant not available`);
    } else {
      console.log(`  ✅ Qdrant available`);
    }

    // Check 3: tensorrt_bridge addon
    console.log(`\n[3/6] Checking tensorrt_bridge.node addon...`);
    report.checks.tensorrt_bridge = await checkTensorrtBridge();
    if (!report.checks.tensorrt_bridge.exists) {
      report.warnings.push('tensorrt_bridge.node addon not found (optional)');
      console.log(`  ⚠️ Addon not found`);
    } else if (!report.checks.tensorrt_bridge.loadable) {
      report.warnings.push('tensorrt_bridge.node exists but cannot load (may be missing CUDA DLLs)');
      console.log(`  ⚠️ Addon exists but not loadable`);
    } else {
      console.log(`  ✅ Addon available and loadable`);
      console.log(`     Functions: ${report.checks.tensorrt_bridge.functions.join(', ')}`);
    }

    // Check 4: cuVS library
    console.log(`\n[4/6] Checking cuVS library...`);
    report.checks.cuvs_library = await checkCuvsLibrary(report.checks.tensorrt_bridge.functions ?? []);
    if (!report.checks.cuvs_library.available) {
      report.warnings.push('cuVS library not found (optional, for GPU compression)');
      console.log(`  ⚠️ cuVS not found`);
    } else {
      console.log(`  ✅ cuVS available`);
    }

    // Check 5: Qdrant collection
    console.log(`\n[5/6] Checking Qdrant codebase_chunks_768 collection...`);
    report.checks.qdrant_collection = await checkQdrantCollection(qdrantUrl, 'codebase_chunks_768');
    if (!report.checks.qdrant_collection.available) {
      report.blockers.push('Qdrant codebase_chunks_768 collection not available');
      console.log(`  ❌ Collection not available`);
    } else {
      console.log(`  ✅ Collection available`);
      console.log(`     Points: ${report.checks.qdrant_collection.points_count}`);
      console.log(`     Vectors: ${report.checks.qdrant_collection.vectors_count}`);
    }

    // Check 6: Payload structure
    console.log(`\n[6/6] Checking Qdrant payload structure for reranking...`);
    report.checks.payload_structure = await checkPayloadStructure(qdrantUrl, 'codebase_chunks_768');
    if (!report.checks.payload_structure.available) {
      report.warnings.push('Could not verify payload structure (collection may be empty)');
      console.log(`  ⚠️ Could not verify`);
    } else {
      console.log(`  ✅ Payload verified`);
      console.log(`     source_ref: ${report.checks.payload_structure.has_source_ref ? '✅' : '❌'}`);
      console.log(`     feature_id: ${report.checks.payload_structure.has_feature_id ? '✅' : '❌'}`);
      console.log(`     tags: ${report.checks.payload_structure.has_tags ? '✅' : '❌'}`);
      console.log(`     community_id: ${report.checks.payload_structure.has_community_id ? '✅' : '❌'}`);
    }

    // Calculate readiness score
    let score = 0;
    if (report.checks.turbovec_http.available) score += 20;
    if (report.checks.qdrant_http.available) score += 20;
    if (report.checks.tensorrt_bridge.loadable) score += 15;
    if (report.checks.cuvs_library.available) score += 15;
    if (report.checks.qdrant_collection.available) score += 15;
    if (report.checks.payload_structure.available && report.checks.payload_structure.has_source_ref) score += 15;

    report.readiness_score = score;
    report.gates_pass = report.blockers.length === 0 && score >= 70;

    // Write report
    await fs.writeFile(
      path.join(REPORTS_DIR, 'audit-turbovec-cuvs-readiness-report.json'),
      JSON.stringify(report, null, 2)
    );

    const md = `# TurboVec & cuVS Readiness Audit

Generated: ${report.generated_at}

## Readiness Score: ${report.readiness_score}/100 ${report.readiness_score >= 70 ? '✅' : '⚠️'}

## Checks

### 1. TurboVec Sidecar (:50062)
${report.checks.turbovec_http.available ? '✅ Available' : '❌ Not available'}
${report.checks.turbovec_http.status ? `- Status: ${report.checks.turbovec_http.status}` : ''}
${report.checks.turbovec_http.error ? `- Error: ${report.checks.turbovec_http.error}` : ''}

### 2. Qdrant (:6333)
${report.checks.qdrant_http.available ? '✅ Available' : '❌ Not available'}
${report.checks.qdrant_http.status ? `- Status: ${report.checks.qdrant_http.status}` : ''}
${report.checks.qdrant_http.error ? `- Error: ${report.checks.qdrant_http.error}` : ''}

### 3. tensorrt_bridge.node Addon
${report.checks.tensorrt_bridge.exists ? '✅ Exists' : '❌ Not found'}
${report.checks.tensorrt_bridge.loadable ? '✅ Loadable' : '⚠️ Not loadable'}
${report.checks.tensorrt_bridge.size ? `- Size: ${(report.checks.tensorrt_bridge.size / 1024).toFixed(1)} KB` : ''}
${report.checks.tensorrt_bridge.error ? `- Error: ${report.checks.tensorrt_bridge.error}` : ''}

### 4. cuVS Library
${report.checks.cuvs_library.available ? '✅ Available' : '⚠️ Not found'}
${report.checks.cuvs_library.note ? `- Note: ${report.checks.cuvs_library.note}` : ''}

### 5. Qdrant Collection (codebase_chunks_768)
${report.checks.qdrant_collection.available ? '✅ Available' : '❌ Not available'}
${report.checks.qdrant_collection.points_count ? `- Points: ${report.checks.qdrant_collection.points_count}` : ''}
${report.checks.qdrant_collection.error ? `- Error: ${report.checks.qdrant_collection.error}` : ''}

### 6. Payload Structure
${report.checks.payload_structure.available ? '✅ Available' : '⚠️ Could not verify'}
${report.checks.payload_structure.has_source_ref !== undefined ? `- source_ref: ${report.checks.payload_structure.has_source_ref ? '✅' : '❌'}` : ''}
${report.checks.payload_structure.has_feature_id !== undefined ? `- feature_id: ${report.checks.payload_structure.has_feature_id ? '✅' : '❌'}` : ''}
${report.checks.payload_structure.has_tags !== undefined ? `- tags: ${report.checks.payload_structure.has_tags ? '✅' : '❌'}` : ''}
${report.checks.payload_structure.has_community_id !== undefined ? `- community_id: ${report.checks.payload_structure.has_community_id ? '✅' : '❌'}` : ''}

## Blockers

${report.blockers.length > 0 ? report.blockers.map((b) => `- ${b}`).join('\n') : 'None ✅'}

## Warnings

${report.warnings.length > 0 ? report.warnings.map((w) => `- ${w}`).join('\n') : 'None ✅'}

## Status

- Gates Pass: ${report.gates_pass ? '✅ YES' : '❌ NO'}
- Ready for TurboVec deployment: ${report.blockers.length === 0 ? '✅ YES' : '❌ NO'}
`;

    await fs.writeFile(path.join(REPORTS_DIR, 'audit-turbovec-cuvs-readiness-report.md'), md);

    console.log(`\n[audit-turbovec-cuvs] Summary:`);
    console.log(`  Readiness Score: ${report.readiness_score}/100`);
    console.log(`  Blockers: ${report.blockers.length}`);
    console.log(`  Warnings: ${report.warnings.length}`);
    console.log(`  Gates Pass: ${report.gates_pass ? '✅ YES' : '❌ NO'}`);
    console.log(`\n  Reports written to docs/reports/`);
  } catch (err) {
    console.error(`[audit-turbovec-cuvs] Error: ${err.message}`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nCompleted in ${duration}s`);
}

await main();
