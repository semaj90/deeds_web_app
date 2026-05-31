#!/usr/bin/env node
/**
 * index-task-distillates.mjs
 *
 * Part of the Atlas topological retrieval infrastructure.
 * Indexes cluster-level "task distillates" (actionable summaries)
 * into Qdrant to allow the agent to find relevant topological
 * manifolds based on task descriptions.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getQdrantUrl } from '../qdrant-client.mjs';

const QDRANT_URL = getQdrantUrl();
const CLUSTERS_JSON = path.join(process.cwd(), 'docs/graph/hypergraph-clusters.json');
const COLLECTION = 'codebase_chunks_768'; // Or a dedicated one

async function main() {
  console.log('🏛️  Atlas: Indexing Task Distillates');

  if (!existsSync(CLUSTERS_JSON)) {
    console.error(`❌ Missing cluster digest: ${CLUSTERS_JSON}`);
    process.exit(1);
  }

  try {
    const data = JSON.parse(readFileSync(CLUSTERS_JSON, 'utf-8'));
    const clusters = data.clusters || [];

    console.log(`📦 Found ${clusters.length} clusters for distillation.`);

    // In this repo, distillates are often injected as 'summary_lenses'
    // or as special metadata points in the main collection.
    // We will prepare the JSON for a backfill run.

    const distillates = clusters.map((c) => ({
      clusterId: c.id,
      topic: c.inferredTopic,
      summary: `This topological manifold covers ${c.inferredTopic}. It is centered around ${c.topDirs[0]?.dir}.`,
      actions: [
        `Modify symbols: ${c.topSymbols
          .slice(0, 3)
          .map((s) => s.symbol)
          .join(', ')}`,
        `Inspect files: ${c.topPaths
          .slice(0, 2)
          .map((p) => p.path)
          .join(', ')}`,
      ],
    }));

    const outPath = path.join(process.cwd(), 'tmp/atlas-distillates.json');
    writeFileSync(outPath, JSON.stringify(distillates, null, 2));

    console.log(`✅ Wrote ${distillates.length} distillates to ${outPath}`);
    console.log('🚀 Next step: Run backfill-distillate-embeddings.mjs');
  } catch (err) {
    console.error(`❌ Atlas Distillate Error: ${err.message}`);
    process.exit(1);
  }
}

import { writeFileSync } from 'node:fs';
main();
