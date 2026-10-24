import {
	containsReasoningMarkerV1,
	proceduralSequenceChecksumV1,
	ProceduralSequenceV1Schema,
	type ProceduralSequenceV1,
} from './procedural-sequence-contract-v1.js';

/**
 * Procedural candidate generator (end-to-end plan step 4).
 * Calls llama-server `/v1/chat/completions` with `stream: true` (required: a thinking-capable
 * model returns empty content when streamed off). The transport is injected so tests need no server.
 * Output is a candidate only: `canonicalAuthority` and `executionAllowed` are always false.
 */

export type ProceduralCandidateStatusV1 =
	| 'VALID_CANDIDATE_NOT_ADMITTED'
	| 'REJECTED_REASONING_MARKER'
	| 'REJECTED_INVALID_JSON'
	| 'REJECTED_SCHEMA'
	| 'REJECTED_UNBOUND_SOURCE_REF'
	| 'LLAMA_SERVER_UNAVAILABLE';

export interface ProceduralCandidateResultV1 {
	status: ProceduralCandidateStatusV1;
	sequence: ProceduralSequenceV1 | null;
	sequenceChecksum: string | null;
	rawText: string;
	reasons: string[];
	canonicalAuthority: false;
	executionAllowed: false;
}

export interface ProceduralGeneratorOptionsV1 {
	endpoint: string; // e.g. http://127.0.0.1:8090/v1
	model: string; // e.g. ornith-1.5-9b
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

export interface ProceduralGeneratorInputV1 {
	featureId: string;
	featureLabel: string;
	sourceRefs: readonly string[];
	goal: string;
}

/** Read a llama-server SSE stream and join the content deltas. Stops at `[DONE]`. */
export async function readChatStreamContentV1(body: ReadableStream<Uint8Array>): Promise<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let content = '';
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let newline: number;
		while ((newline = buffer.indexOf('\n')) >= 0) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			if (!line.startsWith('data:')) continue;
			const payload = line.slice(5).trim();
			if (payload === '[DONE]') return content;
			try {
				const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
				if (typeof delta === 'string') content += delta;
			} catch {
				// Ignore a malformed SSE line; the schema check below decides validity.
			}
		}
	}
	return content;
}

function result(
	status: ProceduralCandidateStatusV1,
	rawText: string,
	reasons: string[],
	sequence: ProceduralSequenceV1 | null = null,
): ProceduralCandidateResultV1 {
	return {
		status,
		sequence,
		sequenceChecksum: sequence ? proceduralSequenceChecksumV1(sequence) : null,
		rawText,
		reasons,
		canonicalAuthority: false,
		executionAllowed: false,
	};
}

export async function generateProceduralCandidateV1(
	input: ProceduralGeneratorInputV1,
	options: ProceduralGeneratorOptionsV1,
): Promise<ProceduralCandidateResultV1> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const system = [
		'Return ONLY one JSON object with schema "atlas.procedural-sequence.v1".',
		'Fields: schema, featureId, featureLabel, sequenceId (lowercase, [a-z0-9._:-]), steps.',
		'Each step: stepIndex (integer), action (short), targetRef (copied exactly from the allowed sourceRefs), rationale (short).',
		'Do not invent sourceRefs. Do not include reasoning, thoughts, or any text outside the JSON.',
	].join('\n');
	const user = JSON.stringify({
		featureId: input.featureId,
		featureLabel: input.featureLabel,
		goal: input.goal,
		allowedSourceRefs: input.sourceRefs,
	});

	let rawText = '';
	try {
		const response = await fetchImpl(`${options.endpoint.replace(/\/+$/, '')}/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: options.model,
				stream: true,
				temperature: 0.1,
				max_tokens: 1024,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user },
				],
			}),
			signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
		});
		if (!response.ok || !response.body) {
			return result('LLAMA_SERVER_UNAVAILABLE', '', [`HTTP ${response.status}`]);
		}
		rawText = await readChatStreamContentV1(response.body);
	} catch (err) {
		return result('LLAMA_SERVER_UNAVAILABLE', rawText, [err instanceof Error ? err.message : 'NETWORK_ERROR']);
	}

	// Raw output is kept on every rejection path. Nothing is silently filtered.
	if (containsReasoningMarkerV1(rawText)) {
		return result('REJECTED_REASONING_MARKER', rawText, ['REASONING_OR_HIDDEN_STATE_MARKER']);
	}
	const stripped = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
	let parsed: unknown;
	try {
		parsed = JSON.parse(stripped);
	} catch {
		return result('REJECTED_INVALID_JSON', rawText, ['OUTPUT_NOT_JSON']);
	}
	const checked = ProceduralSequenceV1Schema.safeParse(parsed);
	if (!checked.success) {
		return result(
			'REJECTED_SCHEMA',
			rawText,
			checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
		);
	}
	const allowed = new Set(input.sourceRefs);
	const unbound = checked.data.steps.filter((s) => !allowed.has(s.targetRef)).map((s) => s.targetRef);
	if (unbound.length > 0) {
		return result('REJECTED_UNBOUND_SOURCE_REF', rawText, unbound.map((ref) => `UNBOUND_TARGET_REF: ${ref}`));
	}
	if (checked.data.featureId !== input.featureId || checked.data.featureLabel !== input.featureLabel) {
		return result('REJECTED_SCHEMA', rawText, ['FEATURE_MISMATCH: featureId and featureLabel must match the request']);
	}
	return result('VALID_CANDIDATE_NOT_ADMITTED', rawText, [], checked.data);
}
