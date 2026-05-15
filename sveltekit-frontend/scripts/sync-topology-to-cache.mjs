import { db } from '../src/lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import fs from 'node:fs';

const GRAPH_PATH = './docs/graph/codebase-graph.json';

async function main() {
  console.log('📡 [Topology] Syncing SOM clusters from codebase-graph.json to tensor_analysis_cache...');

  if (!fs.existsSync(GRAPH_PATH)) {
    console.error('❌ codebase-graph.json not found.');
    process.exit(1);
  }

  const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8'));
  const files = graph.files || [];
  console.log(`📊 Found ${files.length} files in graph.`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const filePath = file.rel;
    const somCluster = file.somCluster;

    if (somCluster === undefined) {
      skippedCount++;
      continue;
    }

    // Update tensor_analysis_cache where output_meta->>'filePath' matches
    const result = await db.execute(sql`
      UPDATE tensor_analysis_cache
      SET som_cluster = ${somCluster}
      WHERE output_meta->>'filePath' = ${filePath}
    `);

    if (result.rowCount > 0) {
      updatedCount += result.rowCount;
    }
  }

  console.log(`\n🎉 Sync complete.`);
  console.log(`✅ Updated ${updatedCount} records in tensor_analysis_cache.`);
  console.log(`⏭️  Skipped ${skippedCount} files (no SOM data).`);
}

main().catch(err => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
