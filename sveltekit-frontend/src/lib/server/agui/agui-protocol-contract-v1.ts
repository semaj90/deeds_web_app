import { z } from 'zod';

export const AgUiRunStartedEventV1Schema = z.object({
	type: z.literal('RUN_STARTED'),
	threadId: z.string().min(1),
	runId: z.string().min(1),
	timestamp: z.string().datetime().optional(),
}).strict();

export const AgUiTextMessageStartEventV1Schema = z.object({
	type: z.literal('TEXT_MESSAGE_START'),
	messageId: z.string().min(1),
	role: z.enum(['assistant', 'system', 'tool']),
}).strict();

export const AgUiTextMessageContentEventV1Schema = z.object({
	type: z.literal('TEXT_MESSAGE_CONTENT'),
	messageId: z.string().min(1),
	delta: z.string(),
}).strict();

export const AgUiTextMessageEndEventV1Schema = z.object({
	type: z.literal('TEXT_MESSAGE_END'),
	messageId: z.string().min(1),
}).strict();

export const AgUiToolCallStartEventV1Schema = z.object({
	type: z.literal('TOOL_CALL_START'),
	toolCallId: z.string().min(1),
	toolName: z.string().min(1),
}).strict();

export const AgUiToolCallArgsEventV1Schema = z.object({
	type: z.literal('TOOL_CALL_ARGS'),
	toolCallId: z.string().min(1),
	delta: z.string(),
}).strict();

export const AgUiToolCallEndEventV1Schema = z.object({
	type: z.literal('TOOL_CALL_END'),
	toolCallId: z.string().min(1),
}).strict();

export const AgUiToolCallResultEventV1Schema = z.object({
	type: z.literal('TOOL_CALL_RESULT'),
	toolCallId: z.string().min(1),
	result: z.string(),
}).strict();

export const AgUiRunFinishedEventV1Schema = z.object({
	type: z.literal('RUN_FINISHED'),
	threadId: z.string().min(1),
	runId: z.string().min(1),
	receiptHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
}).strict();

export const AgUiRunRefusedEventV1Schema = z.object({
	type: z.literal('RUN_REFUSED'),
	threadId: z.string().min(1),
	runId: z.string().min(1),
	code: z.enum([
		'WORKSPACE_NOT_ADMITTED',
		'UNAUTHORIZED',
		'MANIFEST_VALIDATION_FAILED',
		'BUDGET_EXCEEDED',
	]),
	reason: z.string().min(1),
}).strict();

export const AgUiEventV1Schema = z.discriminatedUnion('type', [
	AgUiRunStartedEventV1Schema,
	AgUiTextMessageStartEventV1Schema,
	AgUiTextMessageContentEventV1Schema,
	AgUiTextMessageEndEventV1Schema,
	AgUiToolCallStartEventV1Schema,
	AgUiToolCallArgsEventV1Schema,
	AgUiToolCallEndEventV1Schema,
	AgUiToolCallResultEventV1Schema,
	AgUiRunFinishedEventV1Schema,
	AgUiRunRefusedEventV1Schema,
]);

export type AgUiEventV1 = z.infer<typeof AgUiEventV1Schema>;

export const AgUiRunAgentInputV1Schema = z.object({
	threadId: z.string().min(1),
	runId: z.string().min(1),
	query: z.string().min(1),
	contextManifestChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
	permissionTier: z.enum(['READ_ONLY', 'DIAGNOSTIC_LOCAL', 'AUTHORITY_ADMITTED']).default('READ_ONLY'),
}).strict();

export type AgUiRunAgentInputV1 = z.infer<typeof AgUiRunAgentInputV1Schema>;

/**
 * Validates a complete sequence of AG-UI protocol events.
 * Enforces terminal-event uniqueness, lifecycle ordering, and thread/run correlation.
 */
export function validateAgUiEventSequenceV1(events: readonly AgUiEventV1[]): {
	valid: boolean;
	threadId: string;
	runId: string;
	messageCount: number;
	toolCallCount: number;
	terminalType: 'RUN_FINISHED' | 'RUN_REFUSED';
} {
	if (!events || events.length === 0) {
		throw new Error('AGUI_EMPTY_EVENT_SEQUENCE');
	}

	const parsed = events.map((e) => AgUiEventV1Schema.parse(e));
	const first = parsed[0];
	if (first.type !== 'RUN_STARTED') {
		throw new Error(`AGUI_INVALID_SEQUENCE_START: First event must be RUN_STARTED, got '${first.type}'`);
	}

	const threadId = first.threadId;
	const runId = first.runId;

	const last = parsed[parsed.length - 1];
	if (last.type !== 'RUN_FINISHED' && last.type !== 'RUN_REFUSED') {
		throw new Error(`AGUI_INVALID_SEQUENCE_TERMINATION: Last event must be RUN_FINISHED or RUN_REFUSED, got '${last.type}'`);
	}

	let runStartedCount = 0;
	let terminalCount = 0;
	let messageStartCount = 0;
	let messageEndCount = 0;
	let toolCallStartCount = 0;
	let toolCallEndCount = 0;

	for (const ev of parsed) {
		if (ev.type === 'RUN_STARTED') {
			runStartedCount++;
			if (ev.threadId !== threadId || ev.runId !== runId) {
				throw new Error('AGUI_CORRELATION_MISMATCH: threadId or runId differs from sequence start');
			}
		} else if (ev.type === 'RUN_FINISHED' || ev.type === 'RUN_REFUSED') {
			terminalCount++;
			if (ev.threadId !== threadId || ev.runId !== runId) {
				throw new Error('AGUI_CORRELATION_MISMATCH: terminal threadId or runId differs from sequence start');
			}
		} else if (ev.type === 'TEXT_MESSAGE_START') {
			messageStartCount++;
		} else if (ev.type === 'TEXT_MESSAGE_END') {
			messageEndCount++;
		} else if (ev.type === 'TOOL_CALL_START') {
			toolCallStartCount++;
		} else if (ev.type === 'TOOL_CALL_END') {
			toolCallEndCount++;
		}
	}

	if (runStartedCount !== 1) {
		throw new Error(`AGUI_DUPLICATE_START: Found ${runStartedCount} RUN_STARTED events`);
	}
	if (terminalCount !== 1) {
		throw new Error(`AGUI_DUPLICATE_TERMINAL: Found ${terminalCount} terminal events`);
	}
	if (messageStartCount !== messageEndCount) {
		throw new Error(`AGUI_UNBALANCED_MESSAGES: ${messageStartCount} message starts vs ${messageEndCount} ends`);
	}
	if (toolCallStartCount !== toolCallEndCount) {
		throw new Error(`AGUI_UNBALANCED_TOOL_CALLS: ${toolCallStartCount} tool call starts vs ${toolCallEndCount} ends`);
	}

	return {
		valid: true,
		threadId,
		runId,
		messageCount: messageStartCount,
		toolCallCount: toolCallStartCount,
		terminalType: last.type as 'RUN_FINISHED' | 'RUN_REFUSED',
	};
}

/**
 * Formats an AG-UI event as an SSE data payload string.
 */
export function formatAgUiSseEventV1(event: AgUiEventV1): string {
	const parsed = AgUiEventV1Schema.parse(event);
	return `data: ${JSON.stringify(parsed)}\n\n`;
}
