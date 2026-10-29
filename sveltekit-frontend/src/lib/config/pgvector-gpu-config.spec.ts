import { describe, expect, it, vi } from 'vitest';

const configured = vi.hoisted(() => ({
	getCudaServiceUrl: vi.fn(() => 'http://cuda.internal:8765'),
	getDatabaseUrl: vi.fn(() => 'postgresql://configured.test/atlas'),
	getOllamaUrl: vi.fn(() => 'http://ollama.internal:11434'),
}));

vi.mock('./env.server.js', () => configured);

import { getCudaServiceUrl, getDatabaseUrl, getEmbeddingModel, PGVECTOR_CONFIG } from './pgvector-gpu-config.js';

describe('legacy pgvector GPU configuration', () => {
	it('delegates database and service endpoints to the shared server config', () => {
		expect(getDatabaseUrl()).toBe('postgresql://configured.test/atlas');
		expect(PGVECTOR_CONFIG.database.url).toBe('postgresql://configured.test/atlas');
		expect(getCudaServiceUrl('submit')).toBe('http://cuda.internal:8765/api/v1/submit');
		expect(PGVECTOR_CONFIG.ollama.url).toBe('http://ollama.internal:11434');
	});

	it('exposes only the Ollama embedding model, not an Ollama chat model', () => {
		expect(getEmbeddingModel()).toBe('embeddinggemma:latest');
		expect(PGVECTOR_CONFIG.ollama.models).not.toHaveProperty('chat');
	});
});
