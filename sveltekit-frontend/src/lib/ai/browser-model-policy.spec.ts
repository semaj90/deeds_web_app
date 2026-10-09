import { describe, expect, it } from 'vitest';
import { CLIENT_E2B_MODEL_ID, CLIENT_E2B_MODEL_REVISION, CLIENT_EMBEDDING_MODEL } from './model-ids.js';
import { evaluateBrowserModelEvaluationAdmission, selectBrowserModel } from './browser-model-policy.js';

describe('browser-model-policy', () => {
	it('selects Gemma 4 E2B ONNX only for browser generation', () => {
		expect(selectBrowserModel('GENERATION')).toMatchObject({
			modelId: CLIENT_E2B_MODEL_ID,
			modelRevision: CLIENT_E2B_MODEL_REVISION,
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

	it('rejects model evaluation before initialization unless approval and exact local revisions are bound', () => {
		expect(evaluateBrowserModelEvaluationAdmission({
			approved: false,
			artifactRevision: null,
			modelSource: 'REMOTE',
			remoteModelsDisabled: false
		})).toEqual({ status: 'REJECTED', reason: 'REVIEW_NOT_APPROVED' });
		expect(evaluateBrowserModelEvaluationAdmission({
			approved: true,
			artifactRevision: null,
			modelSource: 'LOCAL',
			remoteModelsDisabled: true
		})).toEqual({ status: 'REJECTED', reason: 'ARTIFACT_REVISION_UNBOUND' });
	});

	it('rejects remote model sources and enabled remote fetching', () => {
		const artifactRevision = `sha256:${'a'.repeat(64)}`;
		expect(evaluateBrowserModelEvaluationAdmission({
			approved: true,
			artifactRevision,
			modelSource: 'REMOTE',
			remoteModelsDisabled: true
		})).toEqual({ status: 'REJECTED', reason: 'REMOTE_SOURCE_FORBIDDEN' });
		expect(evaluateBrowserModelEvaluationAdmission({
			approved: true,
			artifactRevision,
			modelSource: 'LOCAL',
			remoteModelsDisabled: false
		})).toEqual({ status: 'REJECTED', reason: 'REMOTE_MODELS_NOT_DISABLED' });
	});

	it('admits only a reviewed, local, checksum-bound model with remote fetching disabled', () => {
		expect(evaluateBrowserModelEvaluationAdmission({
			approved: true,
			artifactRevision: `sha256:${'b'.repeat(64)}`,
			modelSource: 'LOCAL',
			remoteModelsDisabled: true
		})).toEqual({ status: 'ADMITTED' });
	});
});
