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
      'tests/vision-gpu-tools-topology-routes.spec.ts',
      'tests/ai-routes-comprehensive.spec.ts',
      'tests/yorha-v1-routes.spec.ts',
      'tests/routes/all-routes-page-server.test.ts',
      'tests/routes/all-routes-page.test.ts',
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
    },
    // Coverage settings
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/**', '**/*.d.ts', '**/*.test.ts', '**/*.spec.ts'],
    },
  },
});
