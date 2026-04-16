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
      'tests/routes/phase109-tag-chunks.test.ts',
      'tests/routes/get-degraded-shape.test.ts',
      'tests/routes/get-degraded-shape-pass-a.test.ts',
      'tests/routes/codebase-index-degraded-shape.test.ts',
      'tests/routes/kag-ingest-notebook-contract.test.ts',
      'tests/routes/ai-models.test.ts',
      // SvelteKit 2 + Svelte 5 audit tests (added 2026-04-15)
      'tests/runes/svelte5-rune-compliance.test.ts',
      'tests/routes/sveltekit-load-patterns.test.ts',
      'tests/routes/sveltekit-form-actions.test.ts',
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
