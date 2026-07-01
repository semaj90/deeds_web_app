import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {
		title: 'ONNX GPU + Client Cache Test',
		description: 'Comprehensive test suite for ONNX Runtime, WebGPU, IndexedDB, and LokiJS',
		testInfo: {
			embeddingModel: {
				name: 'EmbeddingGemma 300M (ONNX)',
				path: '/embeddinggemma_300m_onnx/model.onnx',
				size: '291 MB',
				outputDim: 384,
				purpose: 'Client-side embedding for batch packets',
				location: 'browser'
			},
			fallbackModel: {
				name: 'Gemma4 E2B (ONNX) — NEW',
				path: '/gemma4_e2b_onnx/model.onnx',
				size: '~1.5 GB',
				speed: '120-255 tokens/sec',
				purpose: 'Fast client-side fallback text generation',
				location: 'browser',
				status: 'Requires download',
				downloadScript: 'bash scripts/download-gemma4-e2b-onnx.sh',
				huggingface: 'https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX',
				note: 'Replaces Gemma3 270M — 4x faster, better reasoning'
			},
			deprecatedModel: {
				name: 'Gemma3 270M (ONNX) — DEPRECATED',
				path: '/gemma3_270m_onnx/gemma3_270m_w8a16.onnx',
				size: '418 MB',
				status: 'Safe to delete after E2B download'
			},
			summaryModel: {
				name: 'Gemma4 9B (TurboQuant)',
				location: 'server (llama-server :8090)',
				size: '~5.3 GB quantized',
				format: 'GGUF + KV cache compression',
				purpose: 'Summary generation via /api/llm/gemma4-chat-clean',
				note: 'No browser ONNX (too large, ~9GB F32); server-side only'
			},
			cacheStack: [
				{ layer: 'L0', name: 'Client ONNX Sessions', ttl: 'session', scope: 'browser' },
				{ layer: 'L1', name: 'LokiJS In-Memory', ttl: '5-10 min', scope: 'browser' },
				{ layer: 'L2', name: 'IndexedDB (idb-keyval)', ttl: '7 days', scope: 'browser' },
				{ layer: 'L3', name: 'Redis BitFrost', ttl: '1 hour', scope: 'server' },
				{ layer: 'L4', name: 'Postgres pgvector', ttl: 'persistent', scope: 'server' }
			],
			features: [
				'✅ Client ONNX: EmbeddingGemma 300M (384-dim, 291 MB)',
				'✅ Client ONNX: Gemma4 E2B (120-255 tok/s, 1.5 GB)',
				'✅ Server: Gemma4 9B via TurboQuant llama-server (:8090)',
				'✅ WebGPU GPU acceleration (client, if available)',
				'✅ WASM SIMD fallback (client, cross-platform)',
				'✅ CPU fallback (client, compatibility)',
				'✅ Model caching (no re-download, lazy-loaded)',
				'✅ Session memoization (no re-init)',
				'✅ IndexedDB persistence (7-day TTL, survive refresh)',
				'✅ LokiJS fast queries (in-memory, 5-10 min TTL)',
				'✅ Bifrost L1 exact-match (5ms, server, 1-hour TTL)',
				'✅ Bifrost L2 semantic (2-5s, server)',
				'✅ Batch embedding API integration',
				'✅ Dual llama-server endpoints (summary :8090 + validation :8091)'
			]
		}
	};
};
