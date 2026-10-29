// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	get: vi.fn(),
	set: vi.fn(),
	rpush: vi.fn(),
	expire: vi.fn(),
	hybridSearch: vi.fn(),
	generateEmbeddings: vi.fn(),
	embedOrChatFetch: vi.fn(),
}));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: () => ({
		get: mocks.get,
		set: mocks.set,
		rpush: mocks.rpush,
		expire: mocks.expire,
	}),
}));
vi.mock('$lib/server/grpc/embedding-client.js', () => ({
	generateEmbeddings: mocks.generateEmbeddings,
}));
vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
	qdrant: { hybridSearch: mocks.hybridSearch },
}));
vi.mock('$lib/server/ollama.js', () => ({
	embedOrChatFetch: mocks.embedOrChatFetch,
	getLlamaChatEndpoint: () => 'http://llm.test',
}));
vi.mock('$lib/server/env.server.js', () => ({ ENV: {} }));
vi.mock('$lib/server/llm/runtime-contract.js', () => ({ LLM_MODEL_ID: 'test-model' }));

import { POST } from './+server.js';

const session = {
	id: '123e4567-e89b-42d3-a456-426614174000',
	userId: 'user-1',
	caseId: 'case-1',
	caseData: {
		caseNumber: 'DEMO-001',
		category: 'wire_fraud',
		charge: 'fictional charge',
		primaryStatute: null,
		defendantName: 'Alex Example',
		jurisdiction: 'Fictional District',
		jurisdictionCity: null,
		financialLoss: null,
		narrative: 'Fictional test case.',
	},
	charges: [{ chargeName: 'fictional charge', statute: null, canonChunkIds: ['fixture-chunk'], isPrimary: true }],
	actors: [],
	events: [],
	procedureType: 'criminal',
	phases: ['opening_statements'],
	currentPhase: 0,
	currentTurn: 0,
	dialogueHistory: [],
	rulings: [],
	status: 'active',
	createdAt: '2026-10-28T00:00:00.000Z',
	updatedAt: '2026-10-28T00:00:00.000Z',
};

describe('POST /api/simulation/[sessionId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.get.mockResolvedValue(JSON.stringify(session));
		mocks.set.mockResolvedValue('OK');
		mocks.rpush.mockResolvedValue(1);
		mocks.expire.mockResolvedValue(1);
		mocks.generateEmbeddings.mockResolvedValue({ vectors: [Array(768).fill(0)] });
		mocks.hybridSearch.mockResolvedValue({ results: [] });
		mocks.embedOrChatFetch.mockRejectedValue(new DOMException('fixture timeout', 'TimeoutError'));
	});

	it('uses a flat jurisdiction filter and persists a scripted turn when chat times out', async () => {
		const request = new Request('http://localhost/api/simulation/123e4567-e89b-42d3-a456-426614174000', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'next_turn' }),
		});

		const response = await POST({
			params: { sessionId: session.id },
			request,
			locals: { user: { id: session.userId } },
		} as any);

		expect(response.status).toBe(200);
		const result = await response.json();
		expect(result.currentTurn).toBe(1);
		expect(result.newDialogue).toHaveLength(1);
		expect(result.newDialogue[0]).toMatchObject({
			phase: 'opening_statements',
			role: 'prosecutor',
			canonRefs: ['fixture-chunk'],
		});
		expect(result.newDialogue[0].content).toContain('[FICTIONAL SIMULATION]');
		expect(mocks.hybridSearch).toHaveBeenCalledWith(expect.objectContaining({
			collection: 'legal_canon_chunks',
			filters: { jurisdiction: 'Fictional District' },
		}));
		expect(mocks.set).toHaveBeenCalledWith(
			`sim:session:${session.id}`,
			expect.stringContaining('May it please the Court.'),
			'EX',
			14400,
		);
	});
});
