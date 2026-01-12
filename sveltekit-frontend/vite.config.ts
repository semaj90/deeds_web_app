import { sveltekit } from '@sveltejs/kit/vite';
import UnoCSS from 'unocss/vite';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { defineConfig } from 'vite';
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
      stripDashedDefineKeys,
      ENABLE_CJS_RESOLVER_PATCH && esbuildCommonJsResolverPatch,
      sveltekit({
        compilerOptions: {
          runes: true, // Enable runes mode for Svelte 5
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
        '/api/persons-of-interest': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
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
        // Health check proxy
        '/health': {
          target: `http://localhost:${wsPort}`,
          changeOrigin: true,
        },
        // Add more WebSocket endpoints as needed
      },
    },
    preview: {
      port: 4173,
      host: '0.0.0.0',
    },
    build: {
      target: 'ES2022',
      minify: 'terser',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            webgpuAi: ['$lib/webgpu/webgpu-ai-engine'],
            cognitiveRouter: ['$lib/ai/cognitive-smart-router'],
            gpuInference: ['$lib/services/cuda-vector-integration'],
            bitsUi: ['bits-ui'],
            drizzle: ['drizzle-orm'],
            langchain: ['langchain', '@langchain/core'],
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
      ],
      esbuildOptions: {
        target: 'ES2022',
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
    resolve: {
      alias: {
        __SERVER__: serverInternals,
        __PUBLIC__: publicInternals,
        // Shim node-postgres imports to use postgres-js adapter (conservative)
        // 'drizzle-orm/node-postgres': path.resolve(
        //   __dirname,
        //   'src/lib/shims/drizzle-node-postgres.ts'
        // ),
      },
      dedupe: ['svelte'],
    },
  };
});
