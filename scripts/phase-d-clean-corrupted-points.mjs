#!/usr/bin/env node
/**
 * Phase D: Clean corrupted Qdrant points
 *
 * Delete Qdrant points that have no source_ref (corrupted/incomplete)
 */

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';

async function getCorruptedPoints() {
  const corrupted = [];
  let nextPageOffset = null;

  try {
    // Scroll through all points and collect those with missing source_ref
    for (let batch = 0; batch < 50; batch++) {
      const response = await fetch(
        `${QDRANT_URL}/collections/${COLLECTION}/points/scroll`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            limit: 100,
            offset: nextPageOffset,
            with_payload: true,
            with_vector: false
          })
        }
      );

      if (!response.ok) {
        console.error('Failed to fetch points:', response.status);
        break;
      }

      const data = await response.json();
      const points = data.result?.points ?? [];

      if (points.length === 0) break;

      for (const point of points) {
        if (!point.payload?.source_ref) {
          corrupted.push(point);
        }
      }

      nextPageOffset = data.result?.next_page_offset;
      if (!nextPageOffset) break;

      if (batch % 5 === 0) {
        console.log(`  Scanned ${(batch + 1) * 100} points, found ${corrupted.length} corrupted...`);
      }
    }

    return corrupted;
  } catch (err) {
    console.error('Error fetching corrupted points:', err.message);
    return corrupted;
  }
}

async function deletePoints(pointIds) {
  try {
    const response = await fetch(
      `${QDRANT_URL}/collections/${COLLECTION}/points/delete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: pointIds })
      }
    );

    if (!response.ok) {
      console.error('Failed to delete points:', response.status);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error deleting points:', err.message);
    return false;
  }
}

async function main() {
  console.log('═══ Phase D: Clean Corrupted Qdrant Points ═══\n');

  console.log('Scanning for points with missing source_ref...');
  const corrupted = await getCorruptedPoints();

  if (corrupted.length === 0) {
    console.log('✅ No corrupted points found!');
    return;
  }

  console.log(`Found ${corrupted.length} corrupted points:\n`);
  for (const point of corrupted.slice(0, 10)) {
    console.log(`  - Point ${point.id}: payload keys = [${Object.keys(point.payload).join(', ')}]`);
  }

  if (corrupted.length > 10) {
    console.log(`  ... and ${corrupted.length - 10} more\n`);
  }

  const pointIds = corrupted.map(p => p.id);
  console.log(`\nDeleting ${pointIds.length} corrupted points...`);

  const success = await deletePoints(pointIds);

  if (success) {
    console.log(`✅ Successfully deleted ${pointIds.length} corrupted points`);
  } else {
    console.log(`❌ Failed to delete corrupted points`);
    process.exit(1);
  }
}

main();
