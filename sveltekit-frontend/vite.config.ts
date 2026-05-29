import { sveltekit } from '@sveltejs/kit/vite';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import UnoCSS from 'unocss/vite';
import { defineConfig } from 'vite';
// vscodeErrorLogger was archived — stub it to no-op
const vscodeErrorLogger = (_opts?: { enabled?: boolean }) => null;

// ── Dev request logger — logs /api/* hits + 4xx/5xx to terminal ───────────
function devRequestLoggerPlugin(enabled: boolean) {
  if (!enabled) return null;
  return {
    name: 'dev-request-logger',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use((req: import('http').IncomingMessage, res: import('http').ServerResponse, next: () => void) => {
        const url  = req.url ?? '';
        const method = req.method ?? 'GET';
        const start = Date.now();
        res.on('finish', () => {
          const ms     = Date.now() - start;
          const status = res.statusCode;
          const isApi  = url.startsWith('/api/') || url.includes('hermes') || url.includes('stream');
          const isErr  = status >= 400;
          if (!isApi && !isErr) return;
          const color  = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : status >= 300 ? '\x1b[36m' : '\x1b[32m';
          const reset  = '\x1b[0m';
          const dim    = '\x1b[2m';
          console.log(`${color}[vite:api] ${method} ${url} → ${status}${reset} ${dim}${ms}ms${reset}`);
        });
        next();
      });
    },
  };
}
// import { bitsUiIntegrityPlugin } from './scripts/vite-plugin-bits-ui-integrity.mjs';

const require = createRequire(import.meta.url);

if (!process.env.ESBUILD_BINARY_PATH) {
  const esbuildPackage = require.resolve('esbuild/package.json');
  const binName = process.platform === 'win32' ? 'esbuild.exe' : 'esbuild';
  const binPath = path.join(path.dirname(esbuildPackage), 'bin', binName);
  if (fs.existsSync(binPath)) {
    process.env.ESBUILD_BINARY_PATH = binPath;
  }
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

// Fix piper-wasm: api.js imports ./expressions.js which is missing from the npm package (v0.1.4)
// Redirect the import to our local shim that provides a no-op Expressions class
const fixPiperWasmExpressions = {
  name: 'fix-piper-wasm-expressions',
  resolveId(id: string, importer: string | undefined) {
    if (id === './expressions.js' && importer?.includes('piper-wasm')) {
      return path.resolve('src/lib/shims/piper-expressions-shim.js');
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
      fixPiperWasmExpressions,
      stubNativeAddons,
      stripDashedDefineKeys,
      ENABLE_CJS_RESOLVER_PATCH && esbuildCommonJsResolverPatch,
      sveltekit({
        compilerOptions: {
          runes: true, // Enable runes mode for Svelte 5
        },
        onwarn(warning, handler) {
          // Suppress $$props warnings from lucide-svelte (Svelte 4 library in Svelte 5)
          if (
            warning.code === 'legacy_props_invalid' &&
            warning.filename?.includes('node_modules/lucide-svelte')
          ) {
            return;
          }
          handler(warning);
        },
      }),
      UnoCSS(),
      vscodeErrorLogger({ enabled: mode === 'development' }),
      devRequestLoggerPlugin(mode === 'development'),
    ].filter(Boolean),
    server: {
      port: 5173,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: ['host.docker.internal', 'localhost', '127.0.0.1'],
      // Pre-transform frequently imported modules on dev server start
      warmup: {
        clientFiles: [
          'src/lib/components/ui/**/*.svelte',
          'src/lib/components/layout/**/*.svelte',
          'src/lib/stores/**/*.svelte.ts',
          'src/routes/(app)/+layout.svelte',
        ],
        ssrFiles: [
          'src/lib/server/db/client.ts',
          'src/lib/server/redis.ts',
          'src/lib/server/cache.ts',
          'src/lib/server/env.server.ts',
        ],
      },
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
          target: 'http://localhost:8000',
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
        // Removed: POI API proxy (handled by SvelteKit routes), health check proxy, WS proxies (SSE+HTTP/2 stack)
      },
    },
    preview: {
      port: 4173,
      host: '0.0.0.0',
    },
    css: {
      transformer: 'postcss', // Disable lightningcss for Vite 8
    },
    build: {
      target: 'ES2022',
      manifest: true, // Required for SvelteKit compile step to find .vite/manifest.json
      minify: 'esbuild',
      cssMinify: 'esbuild', // Use esbuild for CSS (lightningcss has issues with @apply and malformed var())
      sourcemap: false,
      // Skip processing large binary assets (ONNX models, WASM files)
      assetsInlineLimit: 0, // Don't inline any assets (keeps them as separate files)
      rollupOptions: {
        external: ['@xenova/transformers', 'piper-wasm', 'nats', 'dockerode', 'ssh2', '@napi-rs/canvas'],
        output: {
          manualChunks: (id) => {
            // Rolldown requires manualChunks to be a function, not an object
            // Split only vendor chunks - avoid splitting src/ code due to dynamic imports
            // NOTE: bits-ui NOT chunked here — forcing all bits-ui into one chunk causes
            // class declaration TDZ (Vite reorders `const x = new Cls` before `class Cls`)
            if (id.includes('node_modules/svelte')) {
              return 'vendor-svelte';
            }
            // @internationalized is small (~5KB) and only used by bits-ui date components
            // Don't force it into a separate chunk — causes empty chunk warnings when tree-shaken

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
      exclude: ['@webgpu/types', 'lucide-svelte', '@huggingface/transformers'],
      include: [
        '@grpc/grpc-js',
        '@grpc/proto-loader',
        'bits-ui',
        '@internationalized/date',
        'drizzle-orm',
        'svelte',
        '@sveltejs/kit',
        'onnxruntime-web',
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
          {
            name: 'piper-expressions-shim',
            setup(build: any) {
              // piper-wasm v0.1.4 api.js imports ./expressions.js which is missing from npm package
              build.onResolve({ filter: /^\.\/expressions\.js$/ }, (args: any) => {
                if (args.importer?.includes('piper-wasm')) {
                  return { path: path.resolve('src/lib/shims/piper-expressions-shim.js') };
                }
              });
            },
          },
        ],
      },
    },
    esbuild: {
      target: 'esnext',
      legalComments: 'none',
      treeShaking: true,
      // Work around esbuild issue with scoped packages containing hyphens
      banner: '',
      footer: '',
      // Force esbuild to skip transforming problematic define statements
      define: {},
    },
    clearScreen: false,
    ssr: {
      external: [
        'canvas',
        '@napi-rs/canvas',
        'simdjson-wasm',
        'onnxruntime-web',
        '@xenova/transformers',
        '@huggingface/transformers', // v4.0.1 exports broken (.mjs missing) — browser-only dynamic import
        'piper-wasm',
        'nats',
        'ssh2',
        'claude-mem-opencode', // subpath deep imports not in package exports map — keep as SSR external
      ],
    },
    resolve: {
      alias: {
        __SERVER__: serverInternals,
        __PUBLIC__: publicInternals,
        // @huggingface/transformers v4.0.1 has broken exports (missing .mjs files) — point to .js directly
        '@huggingface/transformers': path.resolve('node_modules/@huggingface/transformers/dist/transformers.js'),
        // Shim worker_threads for onnxruntime-web (Emscripten WASM loaders import it at module level)
        worker_threads: path.resolve('src/lib/shims/worker-threads-browser-shim.js'),
      },
      dedupe: ['svelte'],
    },
  };
});
