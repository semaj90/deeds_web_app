import {
	CLIENT_E2B_DEVICE,
	CLIENT_E2B_DTYPE,
	CLIENT_E2B_MODEL_ID,
	CLIENT_E2B_MODEL_REVISION,
	CLIENT_EMBEDDING_DIMS,
	CLIENT_EMBEDDING_MODEL
} from './model-ids.js';

export type BrowserInferenceIntent = 'GENERATION' | 'EMBEDDING' | 'RERANKING';

export type BrowserModelSelection = {
	modelId: string;
	modelRevision?: string;
	role: Exclude<BrowserInferenceIntent, 'RERANKING'>;
	runtime: 'transformers-webgpu' | 'onnx-webgpu';
	dtype: string;
};

export type BrowserModelEvaluationAdmissionInput = {
	approved: boolean;
	artifactRevision: string | null;
	modelSource: 'LOCAL' | 'REMOTE';
	remoteModelsDisabled: boolean;
};

export type BrowserModelEvaluationAdmission =
	| { status: 'ADMITTED' }
	| {
			status: 'REJECTED';
			reason: 'REVIEW_NOT_APPROVED' | 'ARTIFACT_REVISION_UNBOUND' | 'REMOTE_SOURCE_FORBIDDEN' | 'REMOTE_MODELS_NOT_DISABLED';
		};

export function evaluateBrowserModelEvaluationAdmission(
	input: BrowserModelEvaluationAdmissionInput
): BrowserModelEvaluationAdmission {
	if (!input.approved) return { status: 'REJECTED', reason: 'REVIEW_NOT_APPROVED' };
	if (!/^sha256:[a-f0-9]{64}$/i.test(input.artifactRevision ?? '')) {
		return { status: 'REJECTED', reason: 'ARTIFACT_REVISION_UNBOUND' };
	}
	if (input.modelSource !== 'LOCAL') return { status: 'REJECTED', reason: 'REMOTE_SOURCE_FORBIDDEN' };
	if (!input.remoteModelsDisabled) return { status: 'REJECTED', reason: 'REMOTE_MODELS_NOT_DISABLED' };
	return { status: 'ADMITTED' };
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
			modelRevision: CLIENT_E2B_MODEL_REVISION,
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
