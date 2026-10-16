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

import { ATLAS_MODEL_BINDINGS, getActiveChatBinding } from './model-registry.js';

describe('atlas model bindings', () => {
	it('has exactly one enabled chat binding served by llama-server :8090', () => {
		const chat = getActiveChatBinding();
		expect(chat.modelId).toBe('ornith-1.5-9b');
		expect(chat.backend).toBe('llama-server');
		expect(chat.endpoint).toBe('http://127.0.0.1:8090/v1');
	});

	it('keeps vision disabled until a runtime capability test enables it', () => {
		const vision = ATLAS_MODEL_BINDINGS.filter((b) => b.role === 'vision');
		expect(vision.length).toBeGreaterThan(0);
		for (const b of vision) expect(b.enabled).toBe(false);
	});

	it('never routes an enabled chat binding to Ollama or another backend', () => {
		const badChat = ATLAS_MODEL_BINDINGS.filter((b) => b.role === 'chat' && b.enabled && b.backend !== 'llama-server');
		expect(badChat).toEqual([]);
	});

	it('keeps the legacy Gemma4 identity disabled and distinct from the chat model', () => {
		const legacy = ATLAS_MODEL_BINDINGS.find((b) => b.modelId === 'gemma4:e4b-it-q4_K_M');
		expect(legacy?.enabled).toBe(false);
		expect(legacy?.modelId).not.toBe('ornith-1.5-9b');
	});

	it('records the chat weight digest as a 64-char lowercase SHA-256', () => {
		const chat = ATLAS_MODEL_BINDINGS.find((b) => b.role === 'chat');
		expect(chat?.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
	});
});
