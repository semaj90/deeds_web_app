/**
 * scripts/atlas/compress-manifold-vectors.mjs
 *
 * GPU Autoencoding: Compresses 768d Qdrant vectors to 64d using the trained autoencoder.
 * Stores result in codebase_chunks_64d collection.
 */

import { getRedis } from '../../src/lib/server/redis.ts';
import { qdrantScroll, qdrantEnsureCollection, qdrantUpsertPoints } from '../qdrant-client.mjs';

const SRC_COLLECTION = 'codebase_chunks_768';
const DEST_COLLECTION = 'codebase_chunks_64d';

async function main() {
  console.log('⚡ Atlas: Compressing 768d -> 64d Manifold Vectors...');

  const redis = getRedis();
  const weights = await redis.hgetall('ace:autoencoder:weights');
  if (!weights.W1) {
    console.error('❌ No weights found in Redis. Run python scripts/train-autoencoder.py first.');
    process.exit(1);
  }

  // Helper to apply linear layer
  const applyLinear = (input, weight, bias, rows, cols) => {
    const output = new Array(rows).fill(0);
    for (let i = 0; i < rows; i++) {
      let sum = bias[i];
      for (let j = 0; j < cols; j++) {
        sum += input[j] * weight[i * cols + j];
      }
      output[i] = sum;
    }
    return output;
  };

  const relu = (arr) => arr.map(v => Math.max(0, v));
  const normalize = (arr) => {
    const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0));
    return arr.map(v => v / (norm || 1));
  };

  const W1 = weights.W1.split(',').map(Number);
  const b1 = weights.b1.split(',').map(Number);
  const W2 = weights.W2.split(',').map(Number);
  const b2 = weights.b2.split(',').map(Number);

  // 1. Ensure collection exists
  const ensured = await qdrantEnsureCollection(DEST_COLLECTION, 64);
  if (!ensured) {
    console.error('❌ Failed to ensure destination collection in Qdrant');
    process.exit(1);
  }

  // 2. Scroll and Compress
  let offset = null;
  let count = 0;

  while (true) {
    const pts = await qdrantScroll(SRC_COLLECTION, { limit: 100, offset, with_vector: true });
    if (!pts || pts.length === 0) break;

    const upsertPoints = pts.map(pt => {
      const v768 = pt.vector.content || pt.vector;
      // Encoder logic: Linear(768, 256) -> ReLU -> Linear(256, 64) -> Normalize
      const h = relu(applyLinear(v768, W1, b1, 256, 768));
      const z = normalize(applyLinear(h, W2, b2, 64, 256));

      return {
        id: pt.id,
        vector: z,
        payload: { ...pt.payload, original_dim: 768 }
      };
    });

    const ok = await qdrantUpsertPoints(DEST_COLLECTION, upsertPoints, true);
    if (!ok) {
      console.warn('Warning: upsert returned non-ok for batch');
    }

    count += pts.length;
    // qdrantScroll returns raw points but not next_page_offset; fall back to null to stop if empty
    offset = null;
    process.stdout.write(`\r   Compressed ${count} points...`);
    if (!offset) break;
  }

  console.log(`\n✅ 768d -> 64d compression complete. Stored in ${DEST_COLLECTION}.`);
  process.exit();
}

main();
