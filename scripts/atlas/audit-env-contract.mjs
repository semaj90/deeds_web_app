#!/usr/bin/env node
/**
 * @file scripts/atlas/audit-env-contract.mjs
 * @description Audits environment variables from .env files and writes the canonical Environment Contract artifact.
 * Stage 1 (Producer) in the Parent Atlas mutation contract gate system.
 *
 * Output:
 *   docs/reports/env-contract-audit.json — canonical audit artifact (read-only, no mutations)
 *
 * Execution:
 *   node scripts/atlas/audit-env-contract.mjs [--dry-run]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

const ENV_PATTERNS = [
  '.env',
  '.env.local',
  'sveltekit-frontend/.env',
  'sveltekit-frontend/.env.local'
];

const REQUIRED_SERVER_KEYS = [
  'DATABASE_URL', 'POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_DB',
  'POSTGRES_USER', 'POSTGRES_PASSWORD',
  'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD',
  'QDRANT_URL', 'QDRANT_API_KEY',
  'LLAMA_SERVER_URL', 'TRACE_MCP_URL',
  'TURBOVEC_GRPC_URL', 'XGBOOST_URL',
  'TENSORRT_BRIDGE_NODE_PATH', 'CUDA_VISIBLE_DEVICES'
];

const REQUIRED_CLIENT_KEYS = [
  'PUBLIC_APP_NAME', 'PUBLIC_ENABLE_ONNX_EMBEDDINGS',
  'PUBLIC_ONNX_MODEL_PATH', 'PUBLIC_ENABLE_WEBGPU',
  'PUBLIC_EMBEDDING_DIM'
];

function redactValue(key, value) {
  if (!value) return value;
  if (key.toUpperCase().includes('PASSWORD') || key.toUpperCase().includes('SECRET') || key.toUpperCase().includes('KEY')) {
    return '[REDACTED]';
  }
  if (key.toUpperCase().includes('URL') && value.includes('@')) {
    return value.replace(/:[^@]*@/, ':***@');
  }
  return value;
}

async function readEnvFiles() {
  const envData = {};
  const foundFiles = [];

  for (const pattern of ENV_PATTERNS) {
    const fullPath = path.resolve(ROOT, pattern);
    try {
      const content = await fs.readFile(fullPath, 'utf8');
      foundFiles.push(pattern);

      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;

        const key = trimmed.substring(0, eqIdx).trim();
        let value = trimmed.substring(eqIdx + 1).trim();

        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        if (key && value) {
          envData[key] = value;
        }
      }
    } catch (err) {
      // File not found is OK
    }
  }

  return { envData, foundFiles };
}

async function generateAudit() {
  console.log('[audit-env-contract] Reading environment files...');
  const { envData, foundFiles } = await readEnvFiles();

  if (VERBOSE) {
    console.log(`[audit-env-contract] Found files: ${foundFiles.join(', ')}`);
  }

  const foundServerKeys = REQUIRED_SERVER_KEYS.filter(k => k in envData);
  const foundClientKeys = REQUIRED_CLIENT_KEYS.filter(k => k in envData);
  const missingServerKeys = REQUIRED_SERVER_KEYS.filter(k => !(k in envData));

  const audit = {
    metadata: {
      generated_at: new Date().toISOString(),
      source_files: foundFiles,
      server_keys_found: foundServerKeys.length,
      server_keys_required: REQUIRED_SERVER_KEYS.length,
      server_keys_missing: missingServerKeys,
      client_keys_found: foundClientKeys.length,
      secrets_redacted: true
    },
    payload: {
      keys: {}
    },
    ace_kag_dag_hits: []
  };

  // Populate keys with redacted values
  for (const key of Object.keys(envData)) {
    const isServer = REQUIRED_SERVER_KEYS.includes(key);
    const isClient = REQUIRED_CLIENT_KEYS.includes(key);

    if (isServer || isClient) {
      audit.payload.keys[key] = {
        present: true,
        scope: isServer ? 'server' : 'client',
        is_secret: key.toUpperCase().includes('PASSWORD') ||
                   key.toUpperCase().includes('SECRET') ||
                   key.toUpperCase().includes('KEY'),
        redacted_value: redactValue(key, envData[key])
      };
    }
  }

  const outputPath = path.resolve(ROOT, 'docs/reports/env-contract-audit.json');

  if (DRY_RUN) {
    console.log('[audit-env-contract] DRY RUN: would write to', outputPath);
    console.log('\nAudit structure:');
    console.log(JSON.stringify(audit, null, 2));
    return;
  }

  // Ensure directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // Write audit JSON
  await fs.writeFile(outputPath, JSON.stringify(audit, null, 2));

  console.log(`[audit-env-contract] ✅ Wrote env contract audit to ${outputPath}`);
  console.log(`[audit-env-contract] Server keys: ${foundServerKeys.length}/${REQUIRED_SERVER_KEYS.length}`);
  console.log(`[audit-env-contract] Client keys: ${foundClientKeys.length}/${REQUIRED_CLIENT_KEYS.length}`);
  if (missingServerKeys.length > 0) {
    console.warn(`[audit-env-contract] ⚠️  Missing server keys: ${missingServerKeys.join(', ')}`);
  }
}

generateAudit().catch(err => {
  console.error('[audit-env-contract] ❌ FAILED:', err.message);
  process.exit(1);
});
