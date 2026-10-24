import { describe, expect, it } from 'vitest';
import { AgUiHeadlessAgentV1 } from './agui-headless-agent-v1.js';
import { formatAgUiSseEventV1, type AgUiEventV1 } from './agui-protocol-contract-v1.js';

describe('agui-headless-agent-v1', () => {
	it('streams and parses protocol events cleanly from a mock endpoint', async () => {
		const mockEvents: AgUiEventV1[] = [
			{ type: 'RUN_STARTED', threadId: 'thread-test', runId: 'run-test' },
			{ type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' },
			{ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Hello from ' },
			{ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Headless AG-UI!' },
			{ type: 'TEXT_MESSAGE_END', messageId: 'm1' },
			{
				type: 'RUN_FINISHED',
				threadId: 'thread-test',
				runId: 'run-test',
				receiptHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
			},
		];

		const sseBody = mockEvents.map(formatAgUiSseEventV1).join('');

		const mockFetch = async () =>
			new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode(sseBody));
						controller.close();
					},
				}),
				{
					status: 200,
					headers: { 'Content-Type': 'text/event-stream' },
				},
			);

		const agent = new AgUiHeadlessAgentV1({ fetchImpl: mockFetch as any });

		const result = await agent.execute({
			threadId: 'thread-test',
			runId: 'run-test',
			query: 'Explain AG-UI without Prisma',
		});

		expect(result.threadId).toBe('thread-test');
		expect(result.runId).toBe('run-test');
		expect(result.terminalType).toBe('RUN_FINISHED');
		expect(result.assembledText).toBe('Hello from Headless AG-UI!');
		expect(result.receiptHash).toBe('sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
		expect(result.events).toHaveLength(6);
	});

	it('handles clean abort / cancellation signal', async () => {
		const controller = new AbortController();
		controller.abort(); // pre-aborted

		const mockFetch = async () => {
			throw new DOMException('The user aborted a request.', 'AbortError');
		};

		const agent = new AgUiHeadlessAgentV1({ fetchImpl: mockFetch as any });

		await expect(
			agent.execute(
				{
					threadId: 'thread-abort',
					runId: 'run-abort',
					query: 'Abort test',
				},
				{ signal: controller.signal },
			),
		).rejects.toThrow();
	});
});
