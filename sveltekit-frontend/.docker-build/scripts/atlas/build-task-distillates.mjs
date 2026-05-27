#!/usr/bin/env node
/**
 * scripts/atlas/build-task-distillates.mjs
 * 
 * Generates actionable "task distillates" from hypergraph cluster analysis
 * and manual task mappings for common operations in the Deeds codebase.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const CLUSTERS_JSON = resolve(process.cwd(), 'docs/graph/hypergraph-clusters.json');
const OUT_FILE = resolve(process.cwd(), 'tmp/task-distillates.json');

const MANUAL_TASKS = [
  {
    task_key: "fix_upload_route",
    summary: "Coordinate file ingestion across SvelteKit routes, S3/Minio storage, and background processing workers.",
    clusters: [5, 24, 42], // Guessed cluster IDs based on previous knowledge or common IDs
    top_paths: [
      "src/routes/api/ingest/+server.ts",
      "src/lib/server/storage/minio-client.ts",
      "src/lib/workers/ingest-worker.ts"
    ],
    redis_refs: ["ace:cluster:5", "ace:cluster:24"],
    tool_policy: "read_write",
    recommended_actions: [
      "Check bucket permissions",
      "Validate worker queue connection",
      "Verify upload form schema"
    ]
  },
  {
    task_key: "wire_langextract_to_kag",
    summary: "Use Docling/Granite for document parsing, LangExtract for entities/events/claims, then project results into Postgres, Qdrant, and Neo4j.",
    clusters: [32, 72, 94, 82],
    top_paths: [
      "src/lib/server/services/langextract-service.ts",
      "src/lib/server/langextract-client.ts",
      "src/lib/server/ace/context-assembler.ts"
    ],
    redis_refs: ["ace:cluster:32", "ace:cluster:72", "ace:cluster:94"],
    tool_policy: "read_only",
    recommended_actions: [
      "Validate extraction schema",
      "Dry-run KAG projection",
      "Cache ACE context packet"
    ]
  },
  {
    task_key: "hypergraph_routing_debug",
    summary: "Debug query-time manifold routing, greedy centroid lookups, and fail-open retrieval logic.",
    clusters: [10, 15, 88],
    top_paths: [
      "src/lib/server/retrieval/hypergraph-routing-service.ts",
      "src/lib/server/retrieval/hyperrag-fusion-service.ts",
      "scripts/hypergraph-lookup-server.mjs"
    ],
    redis_refs: ["ace:cluster:10", "ace:cluster:15"],
    tool_policy: "read_only",
    recommended_actions: [
      "Inspect hg-lookup-server logs",
      "Check Redis cluster:forest:embed:* keys",
      "Verify Qdrant gpu_cluster/som_cluster tags"
    ]
  }
];

function main() {
  console.log('🏗️  Atlas: Building Task Distillates...');

  let allDistillates = [...MANUAL_TASKS];

  if (existsSync(CLUSTERS_JSON)) {
    try {
      const data = JSON.parse(readFileSync(CLUSTERS_JSON, 'utf-8'));
      const clusters = data.clusters || [];
      
      console.log(`🔍 Augmenting with ${clusters.length} cluster-inferred tasks...`);
      
      const inferred = clusters.map(c => ({
        task_key: `cluster_task_${c.id}`,
        summary: `Operational task for manifold: ${c.inferredTopic}. Focused on ${c.topDirs[0]?.dir ?? 'root'}.`,
        clusters: [c.id],
        top_paths: c.topPaths.slice(0, 3).map(p => p.path),
        redis_refs: [`ace:cluster:${c.id}`],
        tool_policy: "read_only",
        recommended_actions: [
          `Analyze ${c.topSymbols[0]?.symbol ?? 'core symbols'}`,
          `Check directory coherence in ${c.topDirs[0]?.dir ?? 'target'}`
        ]
      }));
      
      allDistillates = [...allDistillates, ...inferred];
    } catch (err) {
      console.warn(`⚠️  Failed to parse clusters.json: ${err.message}`);
    }
  }

  writeFileSync(OUT_FILE, JSON.stringify(allDistillates, null, 2));
  console.log(`✅ Wrote ${allDistillates.length} task distillates to ${OUT_FILE}`);
}

main();
