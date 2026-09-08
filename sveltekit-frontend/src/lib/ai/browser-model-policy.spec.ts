import { describe, expect, it } from 'vitest';
import { CLIENT_E2B_MODEL_ID, CLIENT_EMBEDDING_MODEL } from './model-ids.js';
import { selectBrowserModel } from './browser-model-policy.js';

describe('browser-model-policy', () => {
	it('selects Gemma 4 E2B ONNX only for browser generation', () => {
		expect(selectBrowserModel('GENERATION')).toMatchObject({
			modelId: CLIENT_E2B_MODEL_ID,
			role: 'GENERATION',
			runtime: 'transformers-webgpu',
			dtype: 'q4f16'
		});
	});

	it('selects EmbeddingGemma only for browser embeddings', () => {
		expect(selectBrowserModel('EMBEDDING')).toMatchObject({
			modelId: CLIENT_EMBEDDING_MODEL,
			role: 'EMBEDDING',
			runtime: 'onnx-webgpu',
			dtype: 'semantic_768'
		});
	});

	it('fails closed because no browser AtlasGemma reranker exists yet', () => {
		expect(() => selectBrowserModel('RERANKING')).toThrow('BROWSER_ATLAS_RERANKER_UNAVAILABLE');
	});

	it('does not expose MTP GGUF or mxbai as browser selections', () => {
		const selections = [selectBrowserModel('GENERATION'), selectBrowserModel('EMBEDDING')];
		expect(selections.map((selection) => selection.modelId).join('|')).not.toMatch(/mxbai|gguf|mtp/i);
	});
});
