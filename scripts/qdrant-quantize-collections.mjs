#!/usr/bin/env node
/**
 * Qdrant Scalar Quantization Script
 *
 * Applies INT8 scalar quantization to all populated Qdrant collections.
 * This gives ~4x memory savings (float32 → int8) with 99%+ accuracy retention.
 *
 * Usage: node scripts/qdrant-quantize-collections.mjs [--dry-run] [--qdrant-url http://localhost:6333]
 */

const QDRANT_URL = process.argv.find(a => a.startsWith('--qdrant-url='))?.split('=')[1]
  || 'http://localhost:6333';
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`\n=== Qdrant Scalar Quantization ===`);
  console.log(`URL: ${QDRANT_URL}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}\n`);

  // 1. Get all collections
  const collectionsRes = await fetch(`${QDRANT_URL}/collections`);
  if (!collectionsRes.ok) {
    console.error(`Failed to fetch collections: ${collectionsRes.status} ${collectionsRes.statusText}`);
    process.exit(1);
  }
  const { result } = await collectionsRes.json();
  const collectionNames = result.collections.map(c => c.name);
  console.log(`Found ${collectionNames.length} collections\n`);

  // 2. Get details for each collection
  const stats = [];
  for (const name of collectionNames) {
    const infoRes = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(name)}`);
    if (!infoRes.ok) {
      console.warn(`  SKIP ${name}: failed to get info (${infoRes.status})`);
      continue;
    }
    const { result: info } = await infoRes.json();

    const pointsCount = info.points_count ?? 0;
    const vectorsCount = info.vectors_count ?? 0;
    const segmentsCount = info.segments_count ?? 0;
    const status = info.status;
    const hasQuantization = !!info.config?.quantization_config;
    const quantType = hasQuantization
      ? (info.config.quantization_config.scalar?.type
         || info.config.quantization_config.product?.compression
         || 'unknown')
      : 'none';

    // Estimate storage: vectors * dims * bytes_per_element
    // float32 = 4 bytes, int8 = 1 byte per dimension
    let vectorDims = 0;
    const vectorsConfig = info.config?.params?.vectors;
    if (vectorsConfig) {
      if (typeof vectorsConfig.size === 'number') {
        // Single unnamed vector
        vectorDims = vectorsConfig.size;
      } else if (typeof vectorsConfig === 'object') {
        // Named vectors — sum all dimensions for estimation
        for (const [vName, vConf] of Object.entries(vectorsConfig)) {
          if (vConf && typeof vConf.size === 'number') {
            vectorDims += vConf.size;
          }
        }
      }
    }

    // vectors_count not always returned — use points_count as proxy
    const effectiveVectors = vectorsCount || pointsCount;
    const estimatedF32Bytes = effectiveVectors * vectorDims * 4;
    const estimatedI8Bytes = effectiveVectors * vectorDims * 1;
    const savingsMB = ((estimatedF32Bytes - estimatedI8Bytes) / (1024 * 1024)).toFixed(1);

    stats.push({
      name,
      pointsCount,
      vectorsCount,
      vectorDims,
      segmentsCount,
      status,
      hasQuantization,
      quantType,
      estimatedF32MB: (estimatedF32Bytes / (1024 * 1024)).toFixed(1),
      estimatedI8MB: (estimatedI8Bytes / (1024 * 1024)).toFixed(1),
      savingsMB
    });
  }

  // 3. Print summary table
  console.log('Collection'.padEnd(40) + 'Points'.padStart(10) + 'Dims'.padStart(8) +
    'F32 MB'.padStart(10) + 'I8 MB'.padStart(10) + 'Save MB'.padStart(10) + '  Quant');
  console.log('-'.repeat(98));

  let totalSavings = 0;
  const toQuantize = [];

  for (const s of stats.sort((a, b) => b.pointsCount - a.pointsCount)) {
    const quantLabel = s.hasQuantization ? `int8` : 'NONE';
    console.log(
      s.name.padEnd(40) +
      String(s.pointsCount).padStart(10) +
      String(s.vectorDims).padStart(8) +
      s.estimatedF32MB.padStart(10) +
      s.estimatedI8MB.padStart(10) +
      s.savingsMB.padStart(10) +
      `  ${quantLabel}`
    );

    if (s.pointsCount > 0 && !s.hasQuantization) {
      toQuantize.push(s);
      totalSavings += parseFloat(s.savingsMB);
    }
  }

  console.log('-'.repeat(98));
  console.log(`\nCollections needing quantization: ${toQuantize.length}`);
  console.log(`Estimated total savings: ${totalSavings.toFixed(1)} MB\n`);

  if (toQuantize.length === 0) {
    console.log('All populated collections already have quantization. Nothing to do.');
    return;
  }

  // 4. Apply quantization
  if (DRY_RUN) {
    console.log('DRY RUN — skipping quantization. Remove --dry-run to apply.\n');
    return;
  }

  console.log('Applying INT8 scalar quantization...\n');

  let success = 0;
  let failed = 0;

  for (const s of toQuantize) {
    process.stdout.write(`  ${s.name} (${s.pointsCount} points)... `);

    try {
      const patchRes = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(s.name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantization_config: {
            scalar: {
              type: 'int8',
              quantile: 0.99,
              always_ram: true
            }
          }
        })
      });

      if (patchRes.ok) {
        console.log('OK');
        success++;
      } else {
        const errBody = await patchRes.text();
        console.log(`FAILED (${patchRes.status}: ${errBody.slice(0, 100)})`);
        failed++;
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} quantized, ${failed} failed`);

  // 5. Verify — re-check collections
  if (success > 0) {
    console.log('\nVerifying quantization status...\n');
    for (const s of toQuantize) {
      const verifyRes = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(s.name)}`);
      if (verifyRes.ok) {
        const { result: info } = await verifyRes.json();
        const hasQ = !!info.config?.quantization_config;
        const qType = hasQ ? (info.config.quantization_config.scalar?.type || '?') : 'none';
        console.log(`  ${s.name}: quantization=${qType}, status=${info.status}`);
      }
    }
  }

  console.log('\nNote: Qdrant applies quantization in background. Collections may show');
  console.log('status="yellow" briefly while optimizer rebuilds segments.\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
