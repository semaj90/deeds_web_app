import { describe, expect, it } from 'vitest';
import { generateProceduralCandidateV1 } from './procedural-candidate-generator-v1.js';
import {
	containsReasoningMarkerV1,
	proceduralSequenceChecksumV1,
	ProceduralSequenceV1Schema,
} from './procedural-sequence-contract-v1.js';

const SOURCE_REFS = ['src/lib/server/ace/self-prompt.ts', 'src/lib/server/ai/gemma4-tool-controller.ts'];
const INPUT = {
	featureId: 'feature.tool-calling',
	featureLabel: 'Tool calling',
	sourceRefs: SOURCE_REFS,
	goal: 'validate tool-call arguments before dispatch',
};

const VALID_SEQUENCE = {
	schema: 'atlas.procedural-sequence.v1' as const,
	featureId: 'feature.tool-calling',
	featureLabel: 'Tool calling',
	sequenceId: 'seq.tool-calling.validate-args',
	steps: [
		{ stepIndex: 0, action: 'read dispatch', targetRef: 'src/lib/server/ai/gemma4-tool-controller.ts', rationale: 'arguments are unchecked' },
		{ stepIndex: 1, action: 'compare schema', targetRef: 'src/lib/server/ace/self-prompt.ts', rationale: 'reuse the eval schema pattern' },
	],
};

/** Build an SSE body the way llama-server streams it: `data: {...}` lines ending in [DONE]. */
function sse(content: string): string {
	const chunks = content.match(/.{1,40}/gs) ?? [''];
	return chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
}

function fakeFetch(content: string, status = 200) {
	return (async () => {
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode(sse(content)));
				controller.close();
			},
		});
		return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } });
	}) as typeof fetch;
}

const OPTS = { endpoint: 'http://127.0.0.1:8090/v1', model: 'ornith-1.5-9b' };

describe('procedural sequence contract', () => {
	it('accepts a valid sequence and produces a sha256 checksum in the table format', () => {
		const parsed = ProceduralSequenceV1Schema.parse(VALID_SEQUENCE);
		const checksum = proceduralSequenceChecksumV1(parsed);
		expect(checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(proceduralSequenceChecksumV1(parsed)).toBe(checksum);
	});

	it('rejects unknown keys, duplicate step indexes, and empty steps', () => {
		expect(ProceduralSequenceV1Schema.safeParse({ ...VALID_SEQUENCE, extra: true }).success).toBe(false);
		expect(
			ProceduralSequenceV1Schema.safeParse({
				...VALID_SEQUENCE,
				steps: [VALID_SEQUENCE.steps[0], { ...VALID_SEQUENCE.steps[1], stepIndex: 0 }],
			}).success,
		).toBe(false);
		expect(ProceduralSequenceV1Schema.safeParse({ ...VALID_SEQUENCE, steps: [] }).success).toBe(false);
	});

	it('detects reasoning and hidden-state markers', () => {
		expect(containsReasoningMarkerV1('{"a":1}')).toBe(false);
		expect(containsReasoningMarkerV1('<think>plan</think>{}')).toBe(true);
		expect(containsReasoningMarkerV1('{"chainOfThought":"x"}')).toBe(true);
		expect(containsReasoningMarkerV1('{"kv_cache":[]}')).toBe(true);
	});
});

describe('generateProceduralCandidateV1 (streamed, transport injected)', () => {
	it('returns a valid candidate that is never admitted or executable', async () => {
		const result = await generateProceduralCandidateV1(INPUT, { ...OPTS, fetchImpl: fakeFetch(JSON.stringify(VALID_SEQUENCE)) });
		expect(result.status).toBe('VALID_CANDIDATE_NOT_ADMITTED');
		expect(result.sequence?.sequenceId).toBe('seq.tool-calling.validate-args');
		expect(result.sequenceChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(result.canonicalAuthority).toBe(false);
		expect(result.executionAllowed).toBe(false);
	});

	it('strips a markdown code fence before parsing', async () => {
		const fenced = '```json\n' + JSON.stringify(VALID_SEQUENCE) + '\n```';
		const result = await generateProceduralCandidateV1(INPUT, { ...OPTS, fetchImpl: fakeFetch(fenced) });
		expect(result.status).toBe('VALID_CANDIDATE_NOT_ADMITTED');
	});

	it('rejects reasoning in the stream and keeps the raw text', async () => {
		const raw = '<think>let me reason</think>' + JSON.stringify(VALID_SEQUENCE);
		const result = await generateProceduralCandidateV1(INPUT, { ...OPTS, fetchImpl: fakeFetch(raw) });
		expect(result.status).toBe('REJECTED_REASONING_MARKER');
		expect(result.rawText).toBe(raw);
		expect(result.sequence).toBeNull();
	});

	it('rejects non-JSON output', async () => {
		const result = await generateProceduralCandidateV1(INPUT, { ...OPTS, fetchImpl: fakeFetch('here is your sequence') });
		expect(result.status).toBe('REJECTED_INVALID_JSON');
	});

	it('rejects schema violations', async () => {
		const bad = { ...VALID_SEQUENCE, sequenceId: 'Bad ID!' };
		const result = await generateProceduralCandidateV1(INPUT, { ...OPTS, fetchImpl: fakeFetch(JSON.stringify(bad)) });
		expect(result.status).toBe('REJECTED_SCHEMA');
		expect(result.reasons.some((r) => r.startsWith('sequenceId'))).toBe(true);
	});

	it('rejects a target ref the model invented', async () => {
		const invented = {
			...VALID_SEQUENCE,
			steps: [{ ...VALID_SEQUENCE.steps[0], targetRef: 'src/invented/file.ts' }],
		};
		const result = await generateProceduralCandidateV1(INPUT, { ...OPTS, fetchImpl: fakeFetch(JSON.stringify(invented)) });
		expect(result.status).toBe('REJECTED_UNBOUND_SOURCE_REF');
		expect(result.reasons).toEqual(['UNBOUND_TARGET_REF: src/invented/file.ts']);
	});

	it('rejects a feature label that does not match the request', async () => {
		const other = { ...VALID_SEQUENCE, featureLabel: 'Something else' };
		const result = await generateProceduralCandidateV1(INPUT, { ...OPTS, fetchImpl: fakeFetch(JSON.stringify(other)) });
		expect(result.status).toBe('REJECTED_SCHEMA');
		expect(result.reasons[0]).toMatch(/FEATURE_MISMATCH/);
	});

	it('reports llama-server unavailable on HTTP errors', async () => {
		const result = await generateProceduralCandidateV1(INPUT, { ...OPTS, fetchImpl: fakeFetch('', 500) });
		expect(result.status).toBe('LLAMA_SERVER_UNAVAILABLE');
		expect(result.canonicalAuthority).toBe(false);
	});

	it('reports llama-server unavailable on network failure', async () => {
		const failing = (async () => {
			throw new Error('ECONNREFUSED');
		}) as unknown as typeof fetch;
		const result = await generateProceduralCandidateV1(INPUT, { ...OPTS, fetchImpl: failing });
		expect(result.status).toBe('LLAMA_SERVER_UNAVAILABLE');
		expect(result.reasons).toEqual(['ECONNREFUSED']);
	});

	it('sends stream: true to the chat endpoint', async () => {
		let sentBody: Record<string, unknown> | null = null;
		const spy = (async (_url: unknown, init?: RequestInit) => {
			sentBody = JSON.parse(String(init?.body));
			return fakeFetch(JSON.stringify(VALID_SEQUENCE))(_url as string, init);
		}) as typeof fetch;
		await generateProceduralCandidateV1(INPUT, { ...OPTS, fetchImpl: spy });
		expect(sentBody).not.toBeNull();
		expect((sentBody as unknown as Record<string, unknown>).stream).toBe(true);
	});
});
