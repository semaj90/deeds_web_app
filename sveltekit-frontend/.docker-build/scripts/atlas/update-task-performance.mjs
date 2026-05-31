#!/usr/bin/env node
/**
 * scripts/atlas/update-task-performance.mjs
 *
 * Updates performance metrics (hit_rate, accepted_rate) for task distillates in Qdrant.
 */

import { qdrantScroll, qdrantUpdatePayload, getQdrantUrl } from '../qdrant-client.mjs';
const QDRANT_URL = getQdrantUrl();
const COLLECTION = 'task_distillates';

async function main() {
  const taskKey = process.argv[2];
  const metric = process.argv[3] || 'hit_rate';

  if (!taskKey) {
    console.error('Usage: update-task-performance.mjs <taskKey> [hit_rate|accepted_rate]');
    process.exit(1);
  }

  console.log(`📈 Atlas: Incrementing ${metric} for Task: ${taskKey}`);

  try {
    // In Qdrant, we can use the 'set_payload' with a filter.
    // However, to 'increment' we usually need to fetch first or use a script (if supported).
    // Here we use a simple overwrite with a default increment for simulation.

    // 1. Find the point
    const pts = await qdrantScroll(COLLECTION, {
      filter: { must: [{ key: 'task_key', match: { value: taskKey } }] },
      limit: 1,
      with_payload: true,
    });
    const point = pts?.[0];

    if (!point) {
      console.warn(`⚠️  Task ${taskKey} not found in Qdrant.`);
      return;
    }

    const currentVal = point.payload[metric] || 0;
    const newVal = currentVal + 1;

    // 2. Update
    const ok = await qdrantUpdatePayload(COLLECTION, {
      payload: { [metric]: newVal },
      points: [point.id],
    });
    if (ok) {
      console.log(`✅ ${metric} updated to ${newVal} for ${taskKey}`);
    } else {
      console.error('❌ Update failed');
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
  }
}

main();
