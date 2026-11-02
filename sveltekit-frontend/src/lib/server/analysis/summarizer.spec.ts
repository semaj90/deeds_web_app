import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockResolveTarget, mockTrace } = vi.hoisted(() => ({
	mockResolveTarget: vi.fn(),
	mockTrace: vi.fn(),
}));

vi.mock('$lib/server/llm/runtime-contract.js', () => ({ resolveLlamaInferenceTarget: mockResolveTarget }));
vi.mock('$lib/server/observability/langfuse.js', () => ({ traceLLM: mockTrace }));

import { summarizeDocument } from './summarizer.js';

describe('summarizeDocument', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mockResolveTarget.mockResolvedValue({ baseUrl: 'http://127.0.0.1:8090', model: 'ornith-1.5-9b' });
		mockTrace.mockImplementation(async (_name, _metadata, run) => run({ end: vi.fn() }));
	});

	it('keeps the final unterminated SSE event and bounds summary length', async () => {
		const generated = Array.from({ length: 65 }, (_, index) => `word${index}`).join(' ');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
			`data: ${JSON.stringify({ choices: [{ delta: { content: generated } }] })}`,
			{ headers: { 'Content-Type': 'text/event-stream' } },
		)));

		const summary = await summarizeDocument('A legal document body with enough content to produce a useful summary. '.repeat(4), 50);

		expect(summary.split(/\s+/)).toHaveLength(50);
		expect(summary).toContain('word49');
	});

	it('includes the beginning and end of long source text in the request', async () => {
		const documentText = `${'BEGINNING FACT. '.repeat(1_500)} FINAL OUTCOME RETAINED.`;
		const fetchMock = vi.fn().mockResolvedValue(new Response('data: [DONE]\n', {
			headers: { 'Content-Type': 'text/event-stream' },
		}));
		vi.stubGlobal('fetch', fetchMock);

		await summarizeDocument(documentText);

		const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(request.messages[1].content).toContain('BEGINNING FACT.');
		expect(request.messages[1].content).toContain('FINAL OUTCOME RETAINED.');
		expect(request.messages[1].content).toContain('[Middle of document omitted for context limits]');
	});

	it('labels its failure result as an excerpt rather than a generated summary', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
		const input = `OPENING FACT. ${'supporting detail '.repeat(100)} FINAL OUTCOME.`;

		const result = await summarizeDocument(input);

		expect(result).toContain('[Excerpt only — model summary unavailable]');
		expect(result).toContain('OPENING FACT.');
		expect(result).toContain('FINAL OUTCOME.');
	});
});
