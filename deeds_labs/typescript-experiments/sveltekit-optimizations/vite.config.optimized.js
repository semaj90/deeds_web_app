import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			// SvelteKit 2 optimizations
			experimental: {
				inspector: true
			}
		})
	],

	// Optimized build configuration
	build: {
		target: 'es2022',
		cssCodeSplit: true,
		cssMinify: 'lightningcss',
		minify: 'esbuild',
		sourcemap: false,

		rollupOptions: {
			output: {
				// Code splitting for better caching
				manualChunks: {
					vendor: ['svelte', '@sveltejs/kit'],
					legal: ['./src/lib/legal/**'],
					ui: ['./src/lib/components/ui/**'],
					tensorrt: ['./src/lib/tensorrt/**']
				}
			}
		},

		// Optimization for legal AI components
		optimizeDeps: {
			include: [
				'sonic-boom', // SIMD JSON
				'@tensorflow/tfjs-node', // TensorFlow.js optimizations
				'protobufjs' // Protocol buffers
			]
		}
	},

	// Development server optimizations
	server: {
		port: 5173,
		host: true,
		hmr: {
			overlay: false // Faster HMR
		},
		fs: {
			strict: false // Allow access to optimized modules
		}
	},

	// Preview server for production testing
	preview: {
		port: 4173,
		host: true
	},

	// CSS optimizations
	css: {
		preprocessorOptions: {
			scss: {
				additionalData: `@import 'src/lib/styles/optimized.scss';`
			}
		},
		lightningcss: {
			targets: '> 0.5%, last 2 versions, Firefox ESR, not dead'
		}
	},

	// Worker optimizations for heavy legal processing
	worker: {
		format: 'es'
	},

	// Environment variables for optimization flags
	define: {
		__TENSORRT_LLM_ENDPOINT__: JSON.stringify(process.env.TENSORRT_LLM_ENDPOINT || 'http://localhost:8100'),
		__QUIC_ENDPOINT__: JSON.stringify(process.env.QUIC_ENDPOINT || 'https://localhost:8103'),
		__GRPC_ENDPOINT__: JSON.stringify(process.env.GRPC_ENDPOINT || 'http://localhost:8104'),
		__CUDA_GRAPHS_ENABLED__: JSON.stringify(process.env.CUDA_GRAPHS_ENABLED === 'true'),
		__SIMD_JSON_ENABLED__: JSON.stringify(process.env.SIMD_JSON_ENABLED === 'true')
	},

	// Optimized dependency resolution
	resolve: {
		alias: {
			'$tensorrt': './src/lib/tensorrt',
			'$legal': './src/lib/legal',
			'$optimized': './src/lib/optimized'
		}
	},

	// Experimental features for performance
	experimental: {
		renderBuiltUrl(filename, { hostType }) {
			if (hostType === 'js') {
				// Optimize JS bundle loading
				return { runtime: `window.__getOptimizedUrl("${filename}")` };
			}
			return { relative: true };
		}
	}
});