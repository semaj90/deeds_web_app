import nodeAdapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Cosmetic warnings suppressed at config level (a11y + unused CSS).
// Real errors (type errors, SSR issues) are NOT suppressed.
const suppressedWarnings = new Set([
  'css_unused_selector',
  'a11y_label_has_associated_control',
  'a11y_click_events_have_key_events',
  'a11y_no_static_element_interactions',
  'a11y_consider_explicit_label',
  'a11y_interactive_supports_focus',
  'a11y_no_interactive_element_to_noninteractive_role',
  'css_vendor_prefix',
]);

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    runes: true,
    compatibility: {
      componentApi: 4
    },
    warningFilter: (warning) => !suppressedWarnings.has(warning.code),
  },
  // Use svelte-preprocess for safe defaults (TypeScript, PostCSS, scss, etc.)
  preprocess: vitePreprocess(),

  vitePlugin: {
    inspector: false,
    dynamicCompileOptions({ filename }) {
      // Svelte 4 legacy packages (lucide-svelte uses $$props) need runes disabled.
      // svelte-sonner and bits-ui use $props() runes and must NOT be overridden.
      if (filename.includes('node_modules') &&
          !filename.includes('svelte-sonner') &&
          !filename.includes('bits-ui') &&
          !filename.includes('svelte-tiptap')) {
        return { runes: false };
      }
    }
  },

  kit: {
    // Ensure we explicitly use the Node adapter (not adapter-auto)
    adapter: nodeAdapter({ out: 'build', precompress: true }),

    // Common path aliases (update to match your repo layout)
    alias: {
      '$lib/server/db/utils': './src/lib/server/db/utils.ts',
      '$lib/server/db/drizzle': './src/lib/server/db/drizzle.ts',
      '$lib/server/db/client': './src/lib/server/db/client.ts',
      '$lib/server/db/schema-postgres': './src/lib/server/db/schema-postgres.ts',
      '$lib/server/db/drizzle-vector-config': './src/lib/server/db/drizzle-vector-config.ts',
      '$lib/server/auth/lucia': './src/lib/server/auth/lucia.ts',
      '$lib/server/cache/redis': './src/lib/server/cache/redis.ts',
      '$lib/server/optimize/query-cache': './src/lib/server/optimize/query-cache.ts',
      '$lib/server/vector/qdrant': './src/lib/server/vector/qdrant.ts',
      '$lib/server/storage/minio': './src/lib/server/storage/minio.ts',
      '$lib/server/ai/summarization': './src/lib/server/ai/summarization.ts',
      '$lib/api/production-service-client': './src/lib/api/production-service-client.ts',
      '$lib/services/xstate-integration': './src/lib/services/xstate-integration.ts',
      '$lib/messaging/rabbitmq-xstate-integration':
        './src/lib/messaging/rabbitmq-xstate-integration.ts',
      '$lib/webasm/llama-cpp-engine': './src/lib/webasm/llama-cpp-engine.ts',
      '$lib/cache/proto-serializer': './src/lib/cache/proto-serializer.ts',
      '$lib/components/ui': './src/lib/components/ui',
      '$lib/utils': './src/lib/utils',
    },
    // Configure environment variables to expose PUBLIC_OLLAMA_URL to client-side code.
    // This allows the client to directly access Ollama if needed, or via a proxy.
    env: {
      publicPrefix: 'PUBLIC_', // Ensures variables starting with PUBLIC_ are exposed to client
      privatePrefix: '', // Default: all non-PUBLIC_ vars accessible server-side via $env/dynamic/private
    },
  },
};

export default config;
