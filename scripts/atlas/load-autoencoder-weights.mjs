#!/usr/bin/env node

/**
 * Load trained autoencoder weights from .npy files into Redis
 * Purpose: Enable latent64 prefilter by loading pre-trained VAE weights
 *
 * Autoencoder: 768-d input → latent_64 bottleneck → 768-d reconstruction
 * Weights trained offline, loaded into Redis L1 cache for immediate use
 *
 * Usage:
 *   npm run atlas:autoencoder:load:weights:dry       # Inspect weights, no write
 *   npm run atlas:autoencoder:load:weights:apply     # Load into Redis
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Autoencoder architecture
  input_dim: 768,
  latent_dim: 64,
  output_dim: 768,

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || 'redis',  // Valkey default password
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
  },

  // Weight file locations
  weights_dir: path.resolve(__dirname, '../../models/autoencoder'),
  weights_files: {
    encoder_w: 'W_enc_768_128.npy',   // Shape: (768, 128)
    encoder_b: 'b_enc_128.npy',       // Shape: (128,)
    latent_w: 'W_enc_128_64.npy',     // Shape: (128, 64)
    latent_b: 'b_enc_64.npy',         // Shape: (64,)
    decoder_w: 'W_dec_64_128.npy',    // Shape: (64, 128)
    decoder_b: 'b_dec_128.npy',       // Shape: (128,)
    output_w: 'W_dec_128_768.npy',    // Shape: (128, 768)
    output_b: 'b_dec_768.npy',        // Shape: (768,)
  },

  // Redis key prefix for autoencoder weights
  redis_prefix: 'autoencoder:weights',
};

// ============================================================================
// NPY FILE PARSER (Minimal — handles float32 arrays only)
// ============================================================================

/**
 * Parse .npy file and extract float32 array
 * .npy format: magic bytes (6) + version (2) + header_len (2-4) + header + array_data
 */
function parseNpyFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  // Convert Node.js Buffer to ArrayBuffer for DataView
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const view = new DataView(arrayBuffer);

  // Check magic bytes (0x93, 'N', 'U', 'M', 'P', 'Y')
  if (view.getUint8(0) !== 0x93) {
    throw new Error(`Invalid .npy file: ${filePath} (bad magic bytes)`);
  }
  const magic = buffer.toString('latin1', 1, 6);
  if (magic !== 'NUMPY') {
    throw new Error(`Invalid .npy file: ${filePath} (magic: ${magic})`);
  }

  // Version (major, minor)
  const major = view.getUint8(6);
  const minor = view.getUint8(7);

  let headerLen, headerStart;
  if (major === 1) {
    headerLen = view.getUint16(8, true);
    headerStart = 10;
  } else if (major === 3) {
    headerLen = view.getBigUint64(8, true);
    headerStart = 16;
  } else {
    throw new Error(`Unsupported .npy version: ${major}.${minor}`);
  }

  // Parse header (Python dictionary as string, very minimal parsing)
  const headerStr = buffer.toString('latin1', headerStart, headerStart + headerLen);

  // Extract dtype and shape from header string
  let dtype = 'float32'; // default
  let shape = [];

  const dtypeMatch = headerStr.match(/'descr':\s*'([<|>]?[fiFc]\d+)'/);
  if (dtypeMatch) {
    const descr = dtypeMatch[1];
    if (descr.includes('f4') || descr.includes('f32')) {
      dtype = 'float32';
    } else if (descr.includes('f8') || descr.includes('f64')) {
      dtype = 'float64';
    } else if (descr.match(/f(\d+)/)) {
      const bits = parseInt(descr.match(/f(\d+)/)[1]) * 8;
      dtype = `float${bits}`;
    }
  }

  const shapeMatch = headerStr.match(/'shape':\s*\(([^)]+)\)/);
  if (shapeMatch) {
    shape = shapeMatch[1].split(',').map(s => {
      const n = parseInt(s.trim());
      return isNaN(n) ? 1 : n;
    });
  }

  // Extract array data
  const dataStart = headerStart + headerLen;
  const dataBuffer = buffer.slice(dataStart);

  let floatArray;
  if (dtype === 'float32') {
    floatArray = new Float32Array(dataBuffer.buffer, dataBuffer.byteOffset, dataBuffer.byteLength / 4);
  } else if (dtype === 'float64') {
    floatArray = new Float64Array(dataBuffer.buffer, dataBuffer.byteOffset, dataBuffer.byteLength / 8);
  } else {
    throw new Error(`Unsupported dtype: ${dtype}`);
  }

  return {
    shape,
    dtype,
    data: Array.from(floatArray),
  };
}

// ============================================================================
// REDIS OPERATIONS
// ============================================================================

async function loadWeightsToRedis(redis, dryRun = false) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('AUTOENCODER WEIGHTS LOADER');
  console.log(`${'='.repeat(70)}\n`);

  const weights = {};
  const stats = {
    files_loaded: 0,
    total_params: 0,
    errors: [],
  };

  // Load each weight file
  for (const [key, filename] of Object.entries(CONFIG.weights_files)) {
    const filePath = path.join(CONFIG.weights_dir, filename);

    try {
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${filePath}`);
        stats.errors.push(`Missing: ${filename}`);
        continue;
      }

      const npy = parseNpyFile(filePath);
      console.log(`✅ Loaded ${filename}`);
      console.log(`   Shape: ${npy.shape.join('x')}, Dtype: ${npy.dtype}`);

      weights[key] = npy;
      stats.files_loaded++;
      stats.total_params += npy.data.length;
    } catch (err) {
      console.log(`❌ Error loading ${filename}: ${err.message}`);
      stats.errors.push(`Error: ${filename} - ${err.message}`);
    }
  }

  console.log(`\nLoaded ${stats.files_loaded}/${Object.keys(CONFIG.weights_files).length} weight files`);
  console.log(`Total parameters: ${stats.total_params.toLocaleString()}\n`);

  if (stats.errors.length > 0) {
    console.log('❌ ERRORS:');
    stats.errors.forEach(e => console.log(`   - ${e}`));
    return stats;
  }

  if (dryRun) {
    console.log('🟡 DRY RUN — Not writing to Redis\n');
    return stats;
  }

  // Write to Redis
  console.log('📝 Writing weights to Redis...\n');

  try {
    for (const [key, npy] of Object.entries(weights)) {
      const redisKey = `${CONFIG.redis_prefix}:${key}`;
      const redisValue = JSON.stringify({
        shape: npy.shape,
        dtype: npy.dtype,
        data: npy.data,
        loaded_at: new Date().toISOString(),
      });

      await redis.set(redisKey, redisValue, 'EX', 86400 * 30); // 30-day TTL
      console.log(`✅ Stored ${redisKey}`);
    }

    // Store metadata
    const metadata = {
      input_dim: CONFIG.input_dim,
      latent_dim: CONFIG.latent_dim,
      output_dim: CONFIG.output_dim,
      loaded_at: new Date().toISOString(),
      file_count: stats.files_loaded,
      total_params: stats.total_params,
    };

    await redis.set(
      `${CONFIG.redis_prefix}:metadata`,
      JSON.stringify(metadata),
      'EX',
      86400 * 30
    );

    console.log(`\n✅ Autoencoder weights loaded to Redis`);
    console.log(`   Prefix: ${CONFIG.redis_prefix}`);
    console.log(`   TTL: 30 days`);
    console.log(`   Total parameters: ${stats.total_params.toLocaleString()}\n`);

  } catch (err) {
    console.log(`❌ Redis write error: ${err.message}\n`);
    stats.errors.push(`Redis: ${err.message}`);
  }

  return stats;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');

  const redis = new Redis(CONFIG.redis);

  try {
    console.log(`Connecting to Redis: ${CONFIG.redis.host}:${CONFIG.redis.port}\n`);

    // Test connection with PING
    await redis.ping();
    console.log(`✅ Connected to Redis: ${CONFIG.redis.host}:${CONFIG.redis.port}\n`);

    const stats = await loadWeightsToRedis(redis, dryRun);

    if (stats.errors.length === 0) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}\n`);
    process.exit(1);
  } finally {
    await redis.disconnect().catch(() => {});
  }
}

main();
