// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { SERVER_CHAT_MODEL, SERVER_EMBEDDING_MODEL, SERVER_GEMMA4_MODEL } from '$lib/ai/model-ids.js';
import { shouldEscalateToServer } from '$lib/ai/client-router.js';
import { getEmbeddingModelId, getReasoningModelId } from './model-registry.js';

describe('model lanes', () => {
	it('keeps EmbeddingGemma on the embedding lane', () => {
		expect(getEmbeddingModelId()).toBe(SERVER_EMBEDDING_MODEL);
	});

	it('keeps Gemma4 on the reasoning lane', () => {
		expect([SERVER_CHAT_MODEL, SERVER_GEMMA4_MODEL]).toContain(getReasoningModelId('legal'));
	});

	it('defaults client chat to helper ONNX instead of client Gemma4', () => {
		const decision = shouldEscalateToServer('hello', [], {});
		expect(decision.source).toBe('local-onnx');
	});

	it('allows client Gemma4 only when explicitly enabled', () => {
		const decision = shouldEscalateToServer('hello', [], {
			allowClientGemma: true,
			e2bReady: true,
		});
		expect(decision.source).toBe('local-e2b');
	});
});
