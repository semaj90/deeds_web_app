#!/usr/bin/env node
/**
 * Qdrant Vector & HNSW Memory Optimization Script
 *
 * Configures codebase_chunks_768 to use on-disk HNSW indexing (reducing VRAM/RAM index footprint)
 * and configures codebase_chunks_64d to use Binary Quantization (minimizing retrieval RAM overhead).
 */

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

async function patchCollection(name, body) {
  const url = `${QDRANT_URL}/collections/${encodeURIComponent(name)}`;
  console.log(`⏳ Patching collection "${name}" at ${url}...`);
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ Failed to patch collection "${name}": HTTP ${res.status} - ${errText}`);
      return false;
    }
    const result = await res.json();
    console.log(`✅ Successfully patched collection "${name}":`, JSON.stringify(result.result ?? result));
    return true;
  } catch (err) {
    console.error(`❌ Network error while patching "${name}":`, err.message);
    return false;
  }
}

async function verifyCollection(name) {
  const url = `${QDRANT_URL}/collections/${encodeURIComponent(name)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.result;
  } catch (err) {
    return null;
  }
}

async function main() {
  console.log('=== Qdrant Memory Optimization Suite ===\n');

  // 1. Configure on-disk HNSW index for codebase_chunks_768
  const patchHnsw = await patchCollection('codebase_chunks_768', {
    hnsw_config: {
      on_disk: true
    }
  });

  // 2. Configure Binary Quantization for codebase_chunks_64d
  const patchBinaryQuant = await patchCollection('codebase_chunks_64d', {
    quantization_config: {
      binary: {
        always_ram: true
      }
    }
  });

  console.log('\n=== Verifying Quantization & Index Settings ===\n');
  
  const col768 = await verifyCollection('codebase_chunks_768');
  if (col768) {
    console.log(`codebase_chunks_768:`);
    console.log(`  HNSW On-Disk: ${col768.config?.hnsw_config?.on_disk}`);
    console.log(`  Quantization: ${JSON.stringify(col768.config?.quantization_config ?? 'none')}`);
  }

  const col64 = await verifyCollection('codebase_chunks_64d');
  if (col64) {
    console.log(`codebase_chunks_64d:`);
    console.log(`  HNSW On-Disk: ${col64.config?.hnsw_config?.on_disk}`);
    console.log(`  Quantization: ${JSON.stringify(col64.config?.quantization_config ?? 'none')}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
