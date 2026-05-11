import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  plugins: [sveltekit(), svelteTesting()],
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, './src/lib'),
    },
    // Ensure Svelte components render in client mode for tests
    conditions: ['browser'],
  },
  test: {
    include: [
      'src/**/*.{test,spec}.{js,ts}',
      // Vitest unit tests — explicitly listed to avoid picking up 66+ Playwright files in tests/
      'tests/ace-policy.spec.ts',
      'tests/code-llm-index.spec.ts',
      'tests/openai-facade.spec.ts',
      'tests/gemma4-tool-controller.spec.ts',
      'tests/llama-tool-definitions.spec.ts',
      'tests/agents-md-relations.spec.ts',
      'tests/redis-disposable.spec.ts',
      'tests/langextract-native.spec.ts',
      'tests/ace-context-glossary.spec.ts',
      'tests/ace-ingest-route.spec.ts',
      'tests/ace-status-route.spec.ts',
      'tests/ace-summarize-route.spec.ts',
      'tests/chat-session-attachment-handoff.spec.ts',
      'tests/evidence-detail-route.test.ts',
      'tests/evidence-view-modal.spec.ts',
      'tests/evidence-workflow-integration.test.ts',
      'tests/phase76-acp-tools.property.test.ts',
      'tests/rag-search-ace-route.spec.ts',
      'tests/sse-chat-attachment-metadata.spec.ts',
      'tests/sse-chat-glossary-metadata.spec.ts',
      'tests/vector-routes.spec.ts',
      'tests/error-brain-routes.spec.ts',
      'tests/glossary-health-routes.spec.ts',
      'tests/cases-auth-evidence-routes.spec.ts',
      'tests/poi-citations-conversations-routes.spec.ts',
      'tests/reports-embed-chat-routes.spec.ts',
      'tests/infra-ollama-cache-routes.spec.ts',
      'tests/errors-feedback-fictional-routes.spec.ts',
      'tests/analytics-tags-nlp-prefs-routes.spec.ts',
      'tests/cache-recommendations-ml-sys-routes.spec.ts',
      'tests/ai-canon-routes.spec.ts',
      'tests/graph-detective-search-routes.spec.ts',
      'tests/contextual-knowledge-web-routes.spec.ts',
      'tests/runtime-connection-contract.spec.ts',
      'tests/vision-gpu-tools-topology-routes.spec.ts',
      'tests/ai-routes-comprehensive.spec.ts',
      'tests/yorha-v1-routes.spec.ts',
      'tests/docs-sync-cartridge-system-routes.spec.ts',
      'tests/cases-sub-routes.spec.ts',
      'tests/retrieval-path-wiring.spec.ts',
      'tests/ace-pipeline-wiring.spec.ts',
      'tests/library-upload-ingest.spec.ts',
      'tests/codebase-indexer.spec.ts',
      'tests/routes/all-routes-page-server.test.ts',
      'tests/routes/all-routes-page.test.ts',
      'tests/routes/cache-stats.test.ts',
      'tests/routes/codebase-tags-rename.test.ts',
      'tests/routes/codebase-index-orchestrate.test.ts',
      'tests/routes/deep-research-task-provider.test.ts',
      'tests/routes/phase109-tag-chunks.test.ts',
      'tests/routes/get-degraded-shape.test.ts',
      'tests/routes/get-degraded-shape-pass-a.test.ts',
      'tests/routes/codebase-index-degraded-shape.test.ts',
      'tests/routes/codebase-index-export-bundle.test.ts',
      'tests/routes/web-research-job-contract.test.ts',
      'tests/routes/kag-ingest-notebook-contract.test.ts',
      'tests/routes/ai-models.test.ts',
      'tests/codebase-index-postgres-fallback.spec.ts',
      'tests/codebase-index-rabbitmq-channel.spec.ts',
      'tests/codebase-index-cache-reuse.spec.ts',
      'tests/research-pipeline-smoke.spec.ts',
      'tests/retrieval-quality-regression.spec.ts',
      'tests/performance-snapshot.spec.ts',
      'tests/assist-feedback.spec.ts',
      'tests/assist-feedback-analysis.spec.ts',
      'tests/assist-defaults.spec.ts',
      // SvelteKit 2 + Svelte 5 audit tests (added 2026-04-15)
      'tests/runes/svelte5-rune-compliance.test.ts',
      'tests/routes/sveltekit-load-patterns.test.ts',
      'tests/routes/sveltekit-form-actions.test.ts',
      'tests/routes/codeintel-fix-recommender.test.ts',
      'tests/routes/codeintel-clusters-post.test.ts',
      'tests/routes/ace-wiki-graph-index.test.ts',
      'tests/routes/chat-memory-settings.test.ts',
      'tests/routes/chat-memory-search.test.ts',
      'tests/routes/chat-memory-backfill.test.ts',
      'tests/routes/cases-canvas.test.ts',
      'tests/unit/chat-memory.test.ts',
      'tests/unit/board-persistence-server.test.ts',
      'tests/lane-latency-benchmark.spec.ts',
      'tests/lane-latency-integration.spec.ts',
      'tests/hypergraph-research-grounding.spec.ts',
      'tests/hypergraph-merge-semantics.spec.ts',
      'tests/cross-language-synthesis.spec.ts',
      'tests/lane4-feedback.spec.ts',
      'tests/routes/directory-summarizer.test.ts',
      'tests/routes/codebase-index-directory-summaries.test.ts',
      'tests/routes/codebase-index-summarize-dirs.test.ts',
      'tests/unit/agents-md-quick-hit.test.ts',
      'tests/unit/ensure-dev-runtime.test.ts',
      'tests/unit/normalize-repo-path.test.ts',
      'tests/karpathy-hook.spec.ts',
      'tests/wiki-vault-watcher.spec.ts',
      'tests/manifold4-retrieval.spec.ts',
      'tests/autoencoder-projection-smoke.spec.ts',
      'tests/topology-projection-pipeline.spec.ts',
      // GPU-accelerated ACE codebase indexing cache (added 2026-05-06)
      'tests/centroid-cache-gpu.spec.ts',
      'tests/ace-code-cache.spec.ts',
      'tests/tensor-analysis-enqueue.spec.ts',
      'tests/ace-hit-tagger.spec.ts',
      // Gemma4 agentic 24hr ACE hits cache (trace.kag_search Redis layer)
      'tests/ace-hits-cache.spec.ts',
      // Admin observability dashboard endpoint contract
      'tests/admin-observability.spec.ts',
      // code-intel dashboard, Karpathy persistence, TRACE memory gain, HMM flow (added 2026-05-06)
      'tests/karpathy-persistence.spec.ts',
      'tests/trace-memory-gain.spec.ts',
      'tests/code-intel-dashboard.spec.ts',
      'tests/hmm-ace-flow.spec.ts',
      'tests/cuda-hardening.spec.ts',
      'tests/cuda-async.spec.ts',
      'tests/kv-context-controller.spec.ts',
      'tests/gemma4-dev-context-loop.spec.ts',
      // G16 auto-generated route test stubs (npm run audit:generate-route-stubs)
      'tests/routes/auto/**/*.test.ts',
      // parallel ACE retrieval lane tests (added 2026-05-06)
      'tests/retrieval-lanes.spec.ts',
      // RRF fusion module (Phase 1C — sparse + dense lane combiner, 2026-05-10)
      'tests/rrf-fuse.spec.ts',
      // Regex intent classifier (Phase A — service-worker design doc, 2026-05-10)
      'tests/intent/regex-intent.spec.ts',
      // Intent-router chain mapping + executeChain partial-results contract (Phase B)
      'tests/intent/intent-router.spec.ts',
      // /api/ai/intent-dispatch route — G26 baseline (Phase B)
      'tests/routes/intent-dispatch.spec.ts',
      // Service Worker offline timeline-client (Phase D)
      'tests/sw/timeline-client.spec.ts',
      // Sparse BM25 lane integration test (Phase 1B — Postgres ts_rank_cd, 2026-05-10)
      'tests/sparse-bm25.spec.ts',
      // multi-lane spine regression guards: skipVectorLane, aceTopkKey, gap checks
      // Multi-lane RRF replacement + cross-encoder gate (Action #2 + #3 from 2026-05-11 audit)
      'tests/multi-lane-rrf-and-rerank.spec.ts',
      // AGENTS directory-card index store + ACE context source (P1 batch — 2026-05-11)
      'tests/agents-index.spec.ts',
      // GraphRAG flag contract for build-agents-index.mjs (Neo4j sync + dry-run + skip flags)
      'tests/agents-build-index-flags.spec.ts',
      // KAG SOM-cluster source (consumer side of som-cluster-cards.mjs) — 2026-05-11
      'tests/kag-cluster-source.spec.ts',
      // Mini-active NVMe cache (compiled JSON snapshot of Neo4j + CouchDB) — 2026-05-11
      'tests/mini-active-cache.spec.ts',
      // End-to-end CLI flag-contract regression (spawns the real script + parses banner/summary)
      'tests/agents-index-cli.spec.ts',
      // Mini-Active-Cache CLI flag-contract regression (parallel guardrail to agents-index-cli)
      'tests/agents-cache-cli.spec.ts',
      // Phase A1 — regen loader contracts (graph + path-aliases foundation)
      'tests/agents-regen-loaders.spec.ts',
      // Phase A1.3 + A1.4 — Redis loader contracts (karpathy + cluster summaries)
      'tests/agents-regen-redis-loaders.spec.ts',
      'tests/multi-lane-spine.spec.ts',
      // P5 codebase relationship extractor: 7 semantic edge types
      'tests/relationship-extractor.spec.ts',
      'tests/relation-extractor.spec.ts',
      // normalizeRepoPath + ACE relation matching regression
      'tests/build-codebase-relationships.spec.ts',
      // reduce-neo4j.mjs: deduplication, caps, counters, symbol/import split
      'tests/mapreduce/reduce-neo4j.spec.ts',
      // MCP tool input hardening + rerank feedback aggregation
      'tests/mcp-trace-tools.spec.ts',
      'tests/qdrant-rerank-feedback.spec.ts',
      // operator-gated ops.* tools (propose_patch, run_targeted_test, record_fix_attempt, run_quality_gate)
      'tests/mcp-operator-tools.spec.ts',
      // AGENTS.md ingest + Qdrant topology payload backfill
      'tests/agents-md-ingest.spec.ts',
      'tests/qdrant-topology-payloads.spec.ts',
      // Step 5D HyperGraphRAG projection layer
      'tests/hypergraph-types.spec.ts',
      'tests/hypergraph-search.spec.ts',
      'tests/hypergraph-mcp-tools.spec.ts',
      'tests/hypergraph-traversal.spec.ts',
      'tests/engram-dym.spec.ts',
      'tests/engram-graph-rerank.spec.ts',
      'tests/quaternion-manifold.spec.ts',
      'tests/ace-rerank-spine.spec.ts',
      'tests/tool-ranker.spec.ts',
    ],
    exclude: [
      'node_modules/**',
      // Phase 99 corrupted — pervasive syntax errors throughout 684-line file
      'src/lib/components/agentic/__tests__/AgentChat.test.ts',
    ],
    // Skip empty files that have no test suites
    passWithNoTests: true,
    // Use jsdom for browser-like environment
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts', 'tests/setup.ts'],
    globals: true,
    // Increased timeout for async operations and property-based tests
    testTimeout: 30000,
    // Allow tests with server-side code
    server: {
      deps: {
        // Inline testing-library for proper Svelte 5 support
        inline: [/@testing-library\/svelte/],
      },
    },
    // Mock module resolution
    alias: {
      $lib: path.resolve(__dirname, './src/lib'),
      // @huggingface/transformers has broken package.json exports (main-only, no ESM)
      // Mock it so dynamic imports in ChatSession.svelte.ts resolve in test env
      '@huggingface/transformers': path.resolve(
        __dirname,
        './tests/__mocks__/huggingface-transformers.ts'
      ),
      'onnxruntime-web': path.resolve(__dirname, './tests/__mocks__/onnxruntime-web.ts'),
    },
    // Coverage settings
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/**', '**/*.d.ts', '**/*.test.ts', '**/*.spec.ts'],
    },
  },
});
