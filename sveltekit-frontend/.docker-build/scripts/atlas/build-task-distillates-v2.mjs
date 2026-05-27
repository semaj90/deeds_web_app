#!/usr/bin/env node
/**
 * scripts/atlas/build-task-distillates.mjs
 * 
 * Generates actionable "task distillates" from manual mappings and cluster data.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DISTILLATES_OUT = resolve(process.cwd(), 'tmp/task-distillates-v2.json');

const TASKS = [
  {
    task_key: "debug_hyperrag_routing",
    summary: "Use topology routing, Redis cluster cards, Qdrant gpu_cluster filters, KAG notes, and fail-open unfiltered retrieval.",
    clusters: ["72", "73", "94", "82"],
    cluster_aliases: ["ace_context", "retrieval_graph", "redis_cache", "grpc_mcp_tools"],
    top_paths: [
      "src/lib/server/retrieval/hyperrag-fusion-service.ts",
      "src/lib/server/ace/context-assembler.ts",
      "src/lib/server/grpc/retrieval-client.ts"
    ],
    rg_queries: [
      "topologyRouting",
      "gpu_cluster",
      "som_cluster",
      "ace:cluster",
      "HyperRagFusionService"
    ],
    tool_policy: "read_only",
    recommended_actions: [
      "Check routing provenance",
      "Verify cluster filter hit count",
      "Retry unfiltered if too few hits",
      "Inject ACE cluster cards"
    ]
  },
  {
    task_key: "wire_langextract_to_kag",
    summary: "Use Docling/Granite for document parsing, LangExtract for entities/events/claims, then project results into Postgres, Qdrant, and Neo4j.",
    clusters: ["32", "72", "94", "82"],
    cluster_aliases: ["langextract_services", "ace_context", "redis_cache", "grpc_mcp_tools"],
    top_paths: [
      "src/lib/server/services/langextract-service.ts",
      "src/lib/server/langextract-client.ts",
      "src/lib/server/ace/context-assembler.ts"
    ],
    rg_queries: ["LangExtract", "langextract-service", "metadata_envelopes"],
    tool_policy: "read_write",
    recommended_actions: [
      "Validate extraction schema",
      "Dry-run KAG projection",
      "Cache ACE context packet"
    ]
  },
  {
    task_key: "analyze_legal_evidence",
    summary: "Retrieve legal corpus citations, analyze uploaded evidence files, and correlate using graph-authority PageRank.",
    clusters: ["47", "92", "73", "32"],
    cluster_aliases: ["legal_corpus_routes", "evidence_upload_ui", "retrieval_graph", "langextract_services"],
    top_paths: [
      "src/routes/api/library/corpus/+server.ts",
      "src/lib/server/legal/constitution-fetcher.ts",
      "src/lib/server/graph/neo4j-gds.ts"
    ],
    rg_queries: ["law-citations", "constitution", "evidence-command-center"],
    tool_policy: "read_only",
    recommended_actions: [
      "Search legal_corpus_routes",
      "Extract citations from evidence",
      "Rank by graph authority"
    ]
  }
];

function main() {
  console.log('🏗️  Atlas: Building Task Distillates (v2)...');
  writeFileSync(DISTILLATES_OUT, JSON.stringify(TASKS, null, 2));
  console.log(`✅ Saved ${TASKS.length} task distillates to ${DISTILLATES_OUT}`);
}

main();
