import { sveltekit } from '@sveltejs/kit/vite';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import UnoCSS from 'unocss/vite';
import { defineConfig } from 'vite';
import { goHMRBridge, goModuleGraph } from './vite-plugins/go-hmr-bridge';
// import { bitsUiIntegrityPlugin } from './scripts/vite-plugin-bits-ui-integrity.mjs';

const require = createRequire(import.meta.url);

if (!process.env.ESBUILD_BINARY_PATH) {
  const esbuildPackage = require.resolve('esbuild/package.json');
  const binName = process.platform === 'win32' ? 'esbuild.exe' : 'esbuild';
  process.env.ESBUILD_BINARY_PATH = path.join(path.dirname(esbuildPackage), 'bin', binName);
}

const generatedDir = path.resolve(__dirname, '.svelte-kit/generated');
const serverInternals = path.resolve(generatedDir, 'server');
const publicInternals = path.resolve(generatedDir, 'client');

// Workaround for Windows esbuild CommonJS resolver issue with scoped packages
const esbuildCommonJsResolverPatch = {
  name: 'esbuild-commonjs-resolver-patch',
  resolveId(id) {
    // Intercept the problematic @sveltejs/kit internal file
    if (id.includes('@sveltejs/kit') && id.includes('paths/internal/server')) {
      return id;
    }
  },
  load(id) {
    // Return the file content directly to bypass esbuild's CommonJS resolver
    if (id.includes('@sveltejs/kit') && id.includes('paths/internal/server')) {
      try {
        const content = fs.readFileSync(id, 'utf-8');
        return content;
      } catch (e) {
        // Fallback if file doesn't exist
        return null;
      }
    }
  },
};

// Stub out native .node addons (canvas, etc.) that can't be bundled by Rollup
const stubNativeAddons = {
  name: 'stub-native-addons',
  resolveId(id) {
    if (id.endsWith('.node') || id.includes('canvas.node')) {
      return { id: '\0native-addon-stub', external: false };
    }
  },
  load(id) {
    if (id === '\0native-addon-stub') {
      return 'export default {};';
    }
  },
};

// Strip dashed define keys that cause esbuild errors
const stripDashedDefineKeys = {
  name: 'strip-dashed-define-keys',
  enforce: 'post',
  configResolved(config) {
    const originalDefine = config.define || {};
    const badKeys = Object.keys(originalDefine).filter((k) => k.includes('-'));
    if (badKeys.length > 0) {
      console.warn('[vite] Stripping invalid define keys with hyphens:', badKeys);
      badKeys.forEach((k) => delete config.define[k]);
    }

    // Also check esbuild.define
    if (config.esbuild?.define) {
      const esbuildBadKeys = Object.keys(config.esbuild.define).filter((k) => k.includes('-'));
      if (esbuildBadKeys.length > 0) {
        console.warn('[vite] Stripping invalid esbuild.define keys with hyphens:', esbuildBadKeys);
        esbuildBadKeys.forEach((k) => delete config.esbuild.define[k]);
      }
    }
  },
};

export default defineConfig(({ mode }) => {
  // Don't load env vars with loadEnv - let SvelteKit handle it naturally
  const wsPort = '5173';

  // Feature flag to enable/disable CommonJS resolver patch
  const ENABLE_CJS_RESOLVER_PATCH = process.env.ENABLE_CJS_RESOLVER_PATCH === 'true';

  // Ensure logs directory exists
  const logsDir = path.resolve(__dirname, '..', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  return {
    assetsInclude: ['**/*.woff2'], // Added for font assets
    // Fix for Vite 6 SSR compatibility with SvelteKit 2.49+
    // These globals are normally injected by SvelteKit but Vite 6 SSR needs them explicitly
    define: {
      // Path configuration
      SVELTEKIT_PATHS_BASE: '""',
      SVELTEKIT_PATHS_ASSETS: '""',
      SVELTEKIT_APP_DIR: '"_app"',
      SVELTEKIT_PATHS_RELATIVE: 'false',
      // Client-side variants (with double underscore)
      SVELTEKIT_PATHS_BASE__: '""',
      SVELTEKIT_PATHS_ASSETS__: '""',
      SVELTEKIT_APP_DIR__: '"_app"',
      SVELTEKIT_HASH_ROUTING__: 'false',
      // Feature flags
      SVELTEKIT_SERVER_TRACING_ENABLED__: 'false',
      SVELTEKIT_CLIENT_ROUTING__: 'true',
      SVELTEKIT_EMBEDDED__: 'false',
      SVELTEKIT_HAS_SERVER_LOAD__: 'true',
      SVELTEKIT_HAS_UNIVERSAL_LOAD__: 'true',
      // App version polling
      SVELTEKIT_APP_VERSION_FILE__: '"_app/version.json"',
      SVELTEKIT_APP_VERSION_POLL_INTERVAL__: '0',
      // Adapter info
      SVELTEKIT_ADAPTER_NAME__: '"@sveltejs/adapter-node"',
      // Dev mode flag
      SVELTEKIT_dev: mode === 'development' ? 'true' : 'false',
    },
    plugins: [
      stubNativeAddons,
      stripDashedDefineKeys,
      goHMRBridge(),
      goModuleGraph(),
      ENABLE_CJS_RESOLVER_PATCH && esbuildCommonJsResolverPatch,
      sveltekit({
        compilerOptions: {
          runes: true, // Enable runes mode for Svelte 5
        },
        onwarn(warning, handler) {
          // Suppress $$props warnings from lucide-svelte (Svelte 4 library in Svelte 5)
          if (warning.code === 'legacy_props_invalid' && warning.filename?.includes('node_modules/lucide-svelte')) {
            return;
          }
          handler(warning);
        },
      }),
      UnoCSS(),
      // bitsUiIntegrityPlugin({ failOnError: false: autoFix, false: false }), // Disabled for faster startup
      // HMR error logger plugin
      {
        name: 'hmr-error-logger',
        handleHotUpdate(ctx) {
          const logPath = path.join(logsDir, 'hmr-errors.log');
          const timestamp = new Date().toISOString();
          const logEntry = `[${timestamp}] HMR update: ${ctx.file}\n`;
          fs.appendFileSync(logPath, logEntry);
        },
        configureServer(server) {
          // Log WebSocket errors
          server.ws.on('error', (error) => {
            const logPath = path.join(logsDir, 'hmr-errors.log');
            const timestamp = new Date().toISOString();
            const logEntry = `[${timestamp}] ❌ WebSocket error: ${error.message}\n${error.stack}\n\n`;
            fs.appendFileSync(logPath, logEntry);
            console.error('WebSocket error logged to hmr-errors.log');
          });

          // Log client connection issues
          server.ws.on('connection', (socket) => {
            socket.on('error', (error) => {
              const logPath = path.join(logsDir, 'hmr-errors.log');
              const timestamp = new Date().toISOString();
              const logEntry = `[${timestamp}] ❌ Client WebSocket error: ${error.message}\n`;
              fs.appendFileSync(logPath, logEntry);
            });
          });
        },
      },
    ].filter(Boolean),
    server: {
      port: 5173,
      strictPort: true,
      host: '0.0.0.0',
      // Performance: Exclude large binary assets from file watching
      watch: {
        ignored: [
          '**/static/models/**',
          '**/static/gemma3_270m_onnx/**',
          '**/static/embeddinggemma_300m_onnx/**',
          '**/static/ort/*.wasm', // Keep .mjs/.d.ts but ignore large .wasm files
        ],
      },
      // Proxy gRPC and API requests
      proxy: {
        '/grpc': {
          target: 'http://localhost:50051',
          changeOrigin: true,
          secure: false,
        },
        '/api/cuda': {
          target: 'http://localhost:8097',
          changeOrigin: true,
          secure: false,
        },
        // New service proxies for E2 repository
        '/api/ingestion': {
          target: 'http://localhost:3003',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/ingestion/, ''),
        },
        '/api/yolo-sam': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/yolo-sam/, ''),
        },
        '/api/ast-fixer': {
          target: 'http://localhost:3002',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/ast-fixer/, ''),
        },
        '/api/playwright-auditor': {
            target: 'http://localhost:8082',
            changeOrigin: true,
            secure: false,
            rewrite: (path) => path.replace(/^\/api\/playwright-auditor/, ''),
        },
        // POI API proxy (Phase 8)
        // '/api/persons-of-interest': {
        //   target: 'http://localhost:8000',
        //   changeOrigin: true,
        //   secure: false,
        // },
        // WebSocket proxy for legal AI services
        '/ws/rag': {
          target: `ws://localhost:${wsPort}`, // enhanced-rag Go service
          ws: true,
          changeOrigin: true,
        },
        '/ws/canvas': {
          target: 'ws://localhost:8095', // evidence canvas collaboration
          ws: true,
          changeOrigin: true,
        },
        '/ws/chat': {
          target: 'ws://localhost:8096', // AI chat service
          ws: true,
          changeOrigin: true,
        },
        // Health check proxy - DISABLED: was routing to non-existent service
        // '/health': {
        //   target: `http://localhost:${wsPort}`,
        //   changeOrigin: true,
        // },
        // Add more WebSocket endpoints as needed
      },
    },
    preview: {
      port: 4173,
      host: '0.0.0.0',
    },
    css: {
      transformer: 'postcss',  // Disable lightningcss for Vite 8
    },
    build: {
      target: 'ES2022',
      minify: 'esbuild',
      cssMinify: 'esbuild',  // Use esbuild for CSS (lightningcss has issues with @apply and malformed var())
      sourcemap: false,
      // Skip processing large binary assets (ONNX models, WASM files)
      assetsInlineLimit: 0, // Don't inline any assets (keeps them as separate files)
      rollupOptions: {
        external: ['@xenova/transformers', 'piper-wasm'],
        output: {
          manualChunks: (id) => {
            // Rolldown requires manualChunks to be a function, not an object
            // Split vendor chunks for better caching and parallel processing
            if (id.includes('node_modules/bits-ui')) {
              return 'vendor-bits-ui';
            }
            if (id.includes('node_modules/svelte')) {
              return 'vendor-svelte';
            }
            if (id.includes('node_modules/@internationalized')) {
              return 'vendor-i18n';
            }
            if (id.includes('node_modules/onnxruntime-web')) {
              return 'vendor-onnx';
            }
            // Group large components by feature
            if (id.includes('/components/ai/')) {
              return 'features-ai';
            }
            if (id.includes('/components/evidence/')) {
              return 'features-evidence';
            }
            if (id.includes('/components/legal/')) {
              return 'features-legal';
            }
            // drizzle-orm, langchain — server-only (externalized by SvelteKit)
          },
          // Exclude large binary assets from the bundle
          assetFileNames: (assetInfo) => {
            // Keep ONNX models and large binaries in their original location
            if (assetInfo.name?.match(/\.(onnx|onnx_data|wasm|bin)$/)) {
              return 'assets/[name][extname]';
            }
            return 'assets/[name]-[hash][extname]';
          },
        },
      },
      chunkSizeWarningLimit: 1000,
      reportCompressedSize: false,
    },
    optimizeDeps: {
      exclude: ['@webgpu/types', 'lucide-svelte'],
      include: [
        '@grpc/grpc-js',
        '@grpc/proto-loader',
        'bits-ui',
        '@internationalized/date',
        'drizzle-orm',
        'svelte',
        '@sveltejs/kit',
        'onnxruntime-web',
        '@huggingface/transformers',
      ],
      esbuildOptions: {
        target: 'ES2022',
        // Keep worker_threads as external during pre-bundling so Vite's alias resolves it at serve time
        plugins: [
          {
            name: 'worker-threads-shim',
            setup(build: any) {
              build.onResolve({ filter: /^worker_threads$/ }, () => ({
                path: path.resolve('src/lib/shims/worker-threads-browser-shim.js'),
              }));
            },
          },
        ],
      },
    },
    esbuild: {
      target: 'esnext',
      legalComments: 'none',
      treeShaking: false,
      // Work around esbuild issue with scoped packages containing hyphens
      banner: '',
      footer: '',
      // Force esbuild to skip transforming problematic define statements
      define: {},
    },
    clearScreen: false,
    ssr: {
      external: ['canvas', '@napi-rs/canvas', 'simdjson-wasm', 'onnxruntime-web', '@xenova/transformers', 'piper-wasm'],
    },
    resolve: {
      alias: {
        __SERVER__: serverInternals,
        __PUBLIC__: publicInternals,
        // Shim worker_threads for onnxruntime-web (Emscripten WASM loaders import it at module level)
        'worker_threads': path.resolve('src/lib/shims/worker-threads-browser-shim.js'),
      },
      dedupe: ['svelte'],
    },
  };
});
