#!/usr/bin/env node
/**
 * scripts/atlas/update-task-performance.mjs
 * 
 * Updates performance metrics (hit_rate, accepted_rate) for task distillates in Qdrant.
 */

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
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
    const searchRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [{ key: 'task_key', match: { value: taskKey } }]
        },
        limit: 1,
        with_payload: true
      })
    });

    const searchData = await searchRes.json();
    const point = searchData.result?.points?.[0];

    if (!point) {
      console.warn(`⚠️  Task ${taskKey} not found in Qdrant.`);
      return;
    }

    const currentVal = point.payload[metric] || 0;
    const newVal = currentVal + 1;

    // 2. Update
    const updateRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: { [metric]: newVal },
        points: [point.id]
      })
    });

    if (updateRes.ok) {
      console.log(`✅ ${metric} updated to ${newVal} for ${taskKey}`);
    } else {
      console.error(`❌ Update failed: ${await updateRes.text()}`);
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
  }
}

main();
