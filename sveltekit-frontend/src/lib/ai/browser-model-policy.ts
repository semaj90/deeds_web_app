import {
	CLIENT_E2B_DEVICE,
	CLIENT_E2B_DTYPE,
	CLIENT_E2B_MODEL_ID,
	CLIENT_EMBEDDING_DIMS,
	CLIENT_EMBEDDING_MODEL
} from './model-ids.js';

export type BrowserInferenceIntent = 'GENERATION' | 'EMBEDDING' | 'RERANKING';

export type BrowserModelSelection = {
	modelId: string;
	role: Exclude<BrowserInferenceIntent, 'RERANKING'>;
	runtime: 'transformers-webgpu' | 'onnx-webgpu';
	dtype: string;
	}

/**
 * Browser model ownership is deliberately narrower than server model routing.
 * The E2B ONNX model generates text; EmbeddingGemma emits semantic vectors.
 * Neither is a browser reranker, and the MTP GGUF/mxbai sidecar are not browser
 * assets at all.
 */
export function selectBrowserModel(intent: BrowserInferenceIntent): BrowserModelSelection {
	if (intent === 'RERANKING') {
		throw new Error('BROWSER_ATLAS_RERANKER_UNAVAILABLE');
	}
	if (intent === 'GENERATION') {
		return {
			modelId: CLIENT_E2B_MODEL_ID,
			role: 'GENERATION',
			runtime: 'transformers-webgpu',
			dtype: CLIENT_E2B_DTYPE
		};
	}
	return {
		modelId: CLIENT_EMBEDDING_MODEL,
		role: 'EMBEDDING',
		runtime: 'onnx-webgpu',
		dtype: `semantic_${CLIENT_EMBEDDING_DIMS}`
	};
}
