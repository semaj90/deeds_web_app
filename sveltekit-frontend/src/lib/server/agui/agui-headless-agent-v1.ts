import {
	AgUiEventV1Schema,
	AgUiRunAgentInputV1Schema,
	validateAgUiEventSequenceV1,
	type AgUiEventV1,
	type AgUiRunAgentInputV1,
} from './agui-protocol-contract-v1.js';

export interface AgUiHeadlessAgentOptionsV1 {
	endpointUrl?: string;
	timeoutMs?: number;
	signal?: AbortSignal;
	customFetch?: typeof fetch;
}

export interface AgUiRunResultV1 {
	threadId: string;
	runId: string;
	events: AgUiEventV1[];
	assembledText: string;
	terminalType: 'RUN_FINISHED' | 'RUN_REFUSED';
	receiptHash?: string;
	refusalReason?: string;
}

/**
 * Headless AG-UI client agent for SvelteKit 2 and Parent Atlas.
 * Dispatches RunAgentInput and streams typed protocol events over HTTP SSE
 * without any UI library or React dependencies.
 */
export class AgUiHeadlessAgentV1 {
	private readonly defaultEndpoint: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: { defaultEndpoint?: string; fetchImpl?: typeof fetch } = {}) {
		this.defaultEndpoint = options.defaultEndpoint ?? '/api/atlas/studio/stream';
		this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
	}

	async execute(
		input: AgUiRunAgentInputV1,
		options: AgUiHeadlessAgentOptionsV1 = {},
	): Promise<AgUiRunResultV1> {
		const parsedInput = AgUiRunAgentInputV1Schema.parse(input);
		const endpoint = options.endpointUrl ?? this.defaultEndpoint;
		const timeoutMs = options.timeoutMs ?? 15000;
		const signal = options.signal ?? AbortSignal.timeout(timeoutMs);

		const res = await this.fetchImpl(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'text/event-stream',
			},
			body: JSON.stringify(parsedInput),
			signal,
		});

		if (!res.ok) {
			const errText = await res.text();
			throw new Error(`AGUI_HTTP_ERROR_${res.status}: ${errText}`);
		}

		if (!res.body) {
			throw new Error('AGUI_EMPTY_RESPONSE_BODY');
		}

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		const collectedEvents: AgUiEventV1[] = [];
		let assembledText = '';
		let receiptHash: string | undefined;
		let refusalReason: string | undefined;

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed || !trimmed.startsWith('data:')) continue;

					const jsonStr = trimmed.slice(5).trim();
					if (!jsonStr) continue;

					const rawEvent = JSON.parse(jsonStr);
					const event = AgUiEventV1Schema.parse(rawEvent);
					collectedEvents.push(event);

					if (event.type === 'TEXT_MESSAGE_CONTENT') {
						assembledText += event.delta;
					} else if (event.type === 'RUN_FINISHED') {
						receiptHash = event.receiptHash;
					} else if (event.type === 'RUN_REFUSED') {
						refusalReason = event.reason;
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		const validation = validateAgUiEventSequenceV1(collectedEvents);

		return {
			threadId: validation.threadId,
			runId: validation.runId,
			events: collectedEvents,
			assembledText,
			terminalType: validation.terminalType,
			receiptHash,
			refusalReason,
		};
	}
}
