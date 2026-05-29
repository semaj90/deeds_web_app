#!/usr/bin/env node
/**
 * fix-g17-localhost.mjs
 * Removes redundant localhost fallbacks from server files.
 * Patterns fixed:
 *   1. ENV.FOO ?? 'http://localhost:PORT'  → ENV.FOO  (ENV already has the fallback)
 *   2. process.env.FOO ?? 'http://localhost:PORT' → ENV.FOO (with ENV import ensured)
 *   3. ENV.FOO ?? 'redis://localhost:PORT' → ENV.FOO
 *   4. ENV.FOO ?? '127.0.0.1:PORT' → ENV.FOO
 *
 * Usage: node scripts/fix-g17-localhost.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC_SERVER = join(ROOT, 'src/lib/server');
const DRY_RUN = process.argv.includes('--dry-run');

// Patterns that are redundant because ENV already has these defaults in env.server.ts
// Format: [searchRegex, replacement]
const REDUNDANT_ENV_FALLBACKS = [
  // Qdrant
  [/ENV\.QDRANT_URL\s*\?\?\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.QDRANT_URL'],
  // Ollama
  [/ENV\.OLLAMA_BASE_URL\s*\?\?\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.OLLAMA_BASE_URL'],
  [/ENV\.OLLAMA_URL\s*\?\?\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.OLLAMA_BASE_URL'],
  // Redis
  [/ENV\.REDIS_URL\s*\?\?\s*['"]redis:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.REDIS_URL'],
  // Neo4j
  [/ENV\.NEO4J_URI\s*\?\?\s*['"]bolt:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.NEO4J_URI'],
  // Generic http/https localhost or 127.0.0.1 patterns with ENV prefix
  [/ENV\.(\w+_URL)\s*\?\?\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.$1'],
  [/ENV\.(\w+_URL)\s*\|\|\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.$1'],
  // gRPC address patterns
  [/ENV\.(\w+_GRPC_URL)\s*\?\?\s*['"](?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.$1'],
];

// Process.env patterns that should use ENV instead
// Map: [process.env.KEY regex, ENV.KEY]
const PROCESS_ENV_REPLACEMENTS = [
  // Redis
  [/process\.env\.REDIS_URL\s*\?\?\s*['"]redis:\/\/localhost:\d+['"]/g, 'ENV.REDIS_URL'],
  [/process\.env\.REDIS_URL\s*\|\|\s*['"]redis:\/\/localhost:\d+['"]/g, 'ENV.REDIS_URL'],
  // Qdrant
  [/process\.env\.QDRANT_URL\s*\?\?\s*['"]http:\/\/localhost:\d+['"]/g, 'ENV.QDRANT_URL'],
  [/process\.env\.QDRANT_URL\s*\|\|\s*['"]http:\/\/localhost:\d+['"]/g, 'ENV.QDRANT_URL'],
  // Ollama
  [/process\.env\.OLLAMA_URL\s*\?\?\s*['"]http:\/\/localhost:\d+['"]/g, 'ENV.OLLAMA_BASE_URL'],
  [/process\.env\.OLLAMA_BASE_URL\s*\?\?\s*['"]http:\/\/localhost:\d+['"]/g, 'ENV.OLLAMA_BASE_URL'],
  [/process\.env(?:\?\.)?\.OLLAMA_BASE_URL\s*\?\?\s*process\.env(?:\?\.)?\.OLLAMA_URL\s*\?\?\s*['"]http:\/\/localhost:\d+['"]/g, 'ENV.OLLAMA_BASE_URL'],
  // Neo4j
  [/process\.env\.NEO4J_URI\s*\?\?\s*['"]bolt:\/\/localhost:\d+['"]/g, 'ENV.NEO4J_URI'],
  // CouchDB
  [/process\.env\.COUCHDB_URL\s*\?\?\s*['"]http:\/\/[^'"]+['"]/g, 'ENV.COUCHDB_URL'],
  [/process\.env\.COUCHDB_URL\s*\|\|\s*['"]http:\/\/[^'"]+['"]/g, 'ENV.COUCHDB_URL'],
  // RabbitMQ
  [/process\.env\.RABBITMQ_URL\s*\?\?\s*['"]amqp:\/\/[^'"]+['"]/g, 'ENV.RABBITMQ_URL'],
  [/process\.env\.RABBITMQ_URL\s*\|\|\s*['"]amqp:\/\/[^'"]+['"]/g, 'ENV.RABBITMQ_URL'],
  // MinIO
  [/process\.env\.MINIO_URL\s*\?\?\s*['"]http:\/\/localhost:\d+['"]/g, 'ENV.MINIO_URL'],
  [/process\.env\.MINIO_URL\s*\|\|\s*['"]http:\/\/localhost:\d+['"]/g, 'ENV.MINIO_URL'],
  // CHR97 / Enhanced RAG
  [/process\.env\.ENHANCED_RAG_URL\s*\|\|\s*['"]http:\/\/localhost:\d+['"]/g, 'ENV.ENHANCED_RAG_URL'],
  [/process\.env\.FRONTEND_BASE_URL\s*\|\|\s*['"]http:\/\/localhost:\d+['"]/g, 'ENV.FRONTEND_BASE_URL'],
  // vLLM / Context7
  [/process\.env\.VLLM_URL\s*\|\|\s*['"]http:\/\/localhost:\d+['"]/g, 'ENV.VLLM_URL'],
  [/process\.env\.CONTEXT7_MCP_URL\s*\|\|\s*['"]http:\/\/localhost:\d+['"]/g, 'ENV.CONTEXT7_MCP_URL'],
  // Trace MCP
  [/process\.env\.TRACE_MCP_URL\s*\?\?\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.TRACE_MCP_URL'],
  // Neo4j HTTP (browser API)
  [/process\.env\.NEO4J_HTTP_URL\s*\?\?\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.NEO4J_HTTP_URL'],
  [/process\.env\.NEO4J_URL\s*\?\?\s*['"]bolt:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.NEO4J_URI'],
  // TensorRT / Triton (also covers process.env.TENSORRT_URL)
  [/process\.env\.TENSORRT_URL\s*\?\?\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.TENSORRT_URL'],
  [/process\.env\.TRITON_URL\s*\|\|\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.TRITON_URL'],
  [/process\.env\.TRITON_URL\s*\?\?\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.TRITON_URL'],
  // TurboQuant aliases (GEMMA_BASE, TURBOQUANT_URL, TURBO_URL all map to the same service)
  [/process\.env\.GEMMA_BASE\s*\?\?\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.TURBOQUANT_BASE_URL'],
  [/process\.env\.TURBOQUANT_URL\s*\?\?\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.TURBOQUANT_BASE_URL'],
  [/process\.env\.TURBO_URL\s*\?\?\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.TURBOQUANT_BASE_URL'],
  // Generation gRPC (orphaned service)
  [/process\.env\.GENERATION_GRPC_URL\s*\?\?\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.GENERATION_GRPC_URL'],
  [/process\.env\.GENERATION_SERVICE_URL\s*\|\|\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.GENERATION_SERVICE_URL'],
  // Ollama 127.0.0.1 variant
  [/process\.env\.OLLAMA_BASE_URL\s*\|\|\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.OLLAMA_BASE_URL'],
  [/process\.env\.OLLAMA_BASE_URL\s*\?\?\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.OLLAMA_BASE_URL'],
  // Redis 127.0.0.1 variant
  [/process\.env\.REDIS_URL\s*\?\?\s*['"]redis:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.REDIS_URL'],
  // Qdrant 127.0.0.1 variant
  [/process\.env\.QDRANT_URL\s*\?\?\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.QDRANT_URL'],
  // Generic URL patterns
  [/process\.env\.(PUBLIC_API_URL)\s*\?\?\s*['"]http(?:s)?:\/\/(?:localhost|127\.0\.0\.1):\d+['"]/g, 'ENV.PUBLIC_API_URL'],
];

function getAllTsFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'env.server.ts' || entry === 'env.server.js') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) results.push(...getAllTsFiles(full));
    else if (entry.endsWith('.ts') || entry.endsWith('.js') || entry.endsWith('.mjs')) results.push(full);
  }
  return results;
}

const files = getAllTsFiles(SRC_SERVER);
let totalFixed = 0;
let filesFixed = 0;

for (const file of files) {
  let src = readFileSync(file, 'utf8');
  if (!src.includes('localhost') && !src.includes('127.0.0.1')) continue;

  let changed = src;
  let fixCount = 0;

  // Apply redundant ENV fallback removals
  for (const [pattern, replacement] of REDUNDANT_ENV_FALLBACKS) {
    const before = changed;
    changed = changed.replace(pattern, replacement);
    if (changed !== before) fixCount++;
  }

  // Apply process.env replacements (only if ENV is already imported or we'll add it)
  const needsEnvImport = changed.includes("process.env.") && !changed.includes("from '$lib/server/env.server");
  for (const [pattern, replacement] of PROCESS_ENV_REPLACEMENTS) {
    const before = changed;
    changed = changed.replace(pattern, replacement);
    if (changed !== before) fixCount++;
  }

  // If we added ENV references but there's no ENV import, add it
  if (fixCount > 0 && !src.includes("from '$lib/server/env.server") && changed.includes('ENV.')) {
    // Find a good place to add the import (after the last import line)
    const importMatch = changed.match(/^(import[^;]+;)\n/m);
    if (importMatch) {
      const lastImportIdx = changed.lastIndexOf('\nimport ');
      if (lastImportIdx !== -1) {
        const lineEnd = changed.indexOf('\n', lastImportIdx + 1);
        if (lineEnd !== -1) {
          changed =
            changed.slice(0, lineEnd + 1) +
            "import { ENV } from 'sveltekit-frontend/src/lib/server/env.server.ts';\n" +
            changed.slice(lineEnd + 1);
        }
      }
    }
  }

  if (changed !== src) {
    const rel = file.replace(ROOT + '\\', '').replace(ROOT + '/', '');
    if (DRY_RUN) {
      console.log(`[dry] would fix ${fixCount} pattern(s): ${rel}`);
    } else {
      writeFileSync(file, changed, 'utf-8');
      console.log(`[fix] ${fixCount} pattern(s): ${rel}`);
    }
    totalFixed += fixCount;
    filesFixed++;
  }
}

console.log(`\n${DRY_RUN ? '[dry-run]' : '[done]'} Fixed ${totalFixed} patterns in ${filesFixed} files.`);
