import { describe, expect, it } from 'vitest';
import {
	validateAgUiEventSequenceV1,
	formatAgUiSseEventV1,
	type AgUiEventV1,
} from './agui-protocol-contract-v1.js';

describe('agui-protocol-contract-v1', () => {
	it('validates a complete successful AG-UI streaming lifecycle', () => {
		const events: AgUiEventV1[] = [
			{ type: 'RUN_STARTED', threadId: 'thread-1', runId: 'run-1' },
			{ type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' },
			{ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Diagnostic ready' },
			{ type: 'TEXT_MESSAGE_END', messageId: 'm1' },
			{
				type: 'RUN_FINISHED',
				threadId: 'thread-1',
				runId: 'run-1',
				receiptHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			},
		];

		const result = validateAgUiEventSequenceV1(events);
		expect(result.valid).toBe(true);
		expect(result.threadId).toBe('thread-1');
		expect(result.runId).toBe('run-1');
		expect(result.messageCount).toBe(1);
		expect(result.terminalType).toBe('RUN_FINISHED');
	});

	it('validates tool call event pairs inside the lifecycle', () => {
		const events: AgUiEventV1[] = [
			{ type: 'RUN_STARTED', threadId: 'thread-1', runId: 'run-1' },
			{ type: 'TOOL_CALL_START', toolCallId: 'call-1', toolName: 'read_evidence' },
			{ type: 'TOOL_CALL_ARGS', toolCallId: 'call-1', delta: '{"evidenceRef":"file:///src/app.ts"}' },
			{ type: 'TOOL_CALL_END', toolCallId: 'call-1' },
			{ type: 'TOOL_CALL_RESULT', toolCallId: 'call-1', result: 'verified content' },
			{ type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' },
			{ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Evidence verified.' },
			{ type: 'TEXT_MESSAGE_END', messageId: 'm1' },
			{ type: 'RUN_FINISHED', threadId: 'thread-1', runId: 'run-1' },
		];

		const result = validateAgUiEventSequenceV1(events);
		expect(result.valid).toBe(true);
		expect(result.toolCallCount).toBe(1);
		expect(result.messageCount).toBe(1);
	});

	it('validates a refusal event lifecycle without synthesizing a run', () => {
		const events: AgUiEventV1[] = [
			{ type: 'RUN_STARTED', threadId: 'thread-2', runId: 'run-2' },
			{
				type: 'RUN_REFUSED',
				threadId: 'thread-2',
				runId: 'run-2',
				code: 'WORKSPACE_NOT_ADMITTED',
				reason: 'Authority pin unverified on live bytes',
			},
		];

		const result = validateAgUiEventSequenceV1(events);
		expect(result.valid).toBe(true);
		expect(result.terminalType).toBe('RUN_REFUSED');
	});

	it('rejects sequences not starting with RUN_STARTED', () => {
		const events: AgUiEventV1[] = [
			{ type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' },
			{ type: 'TEXT_MESSAGE_END', messageId: 'm1' },
			{ type: 'RUN_FINISHED', threadId: 'thread-1', runId: 'run-1' },
		];

		expect(() => validateAgUiEventSequenceV1(events)).toThrow('AGUI_INVALID_SEQUENCE_START');
	});

	it('rejects sequences without valid terminal events', () => {
		const events: AgUiEventV1[] = [
			{ type: 'RUN_STARTED', threadId: 'thread-1', runId: 'run-1' },
			{ type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' },
		];

		expect(() => validateAgUiEventSequenceV1(events)).toThrow('AGUI_INVALID_SEQUENCE_TERMINATION');
	});

	it('rejects mismatched threadId or runId across events', () => {
		const events: AgUiEventV1[] = [
			{ type: 'RUN_STARTED', threadId: 'thread-1', runId: 'run-1' },
			{ type: 'RUN_FINISHED', threadId: 'different-thread', runId: 'run-1' },
		];

		expect(() => validateAgUiEventSequenceV1(events)).toThrow('AGUI_CORRELATION_MISMATCH');
	});

	it('formats SSE stream data correctly', () => {
		const sse = formatAgUiSseEventV1({
			type: 'TEXT_MESSAGE_CONTENT',
			messageId: 'm1',
			delta: 'Chunk 1',
		});
		expect(sse).toBe('data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"Chunk 1"}\n\n');
	});
});
