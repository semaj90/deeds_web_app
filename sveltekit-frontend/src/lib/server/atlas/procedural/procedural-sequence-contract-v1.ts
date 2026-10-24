import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Procedural sequence contract (end-to-end plan steps 3 and 5 prerequisites).
 * Pure: no database, no network. A valid object here is a PROPOSAL. It is not admitted,
 * not canonical, and never executable. `canonicalAuthority` and `executionAllowed` are fixed false.
 */
export const PROCEDURAL_SEQUENCE_SCHEMA_V1 = 'atlas.procedural-sequence.v1' as const;

export const ProceduralStepV1Schema = z.object({
	stepIndex: z.number().int().min(0).max(999),
	action: z.string().min(1).max(200),
	targetRef: z.string().min(1).max(512),
	rationale: z.string().max(1000),
}).strict();

export const ProceduralSequenceV1Schema = z.object({
	schema: z.literal(PROCEDURAL_SEQUENCE_SCHEMA_V1),
	featureId: z.string().min(1).max(256),
	featureLabel: z.string().min(1).max(512),
	sequenceId: z.string().regex(/^[a-z0-9._:-]{3,128}$/),
	steps: z.array(ProceduralStepV1Schema).min(1).max(50),
}).strict().superRefine((seq, ctx) => {
	const indexes = seq.steps.map((s) => s.stepIndex);
	if (new Set(indexes).size !== indexes.length) {
		ctx.addIssue({ code: 'custom', message: 'DUPLICATE_STEP_INDEX', path: ['steps'] });
	}
});

export type ProceduralSequenceV1 = z.infer<typeof ProceduralSequenceV1Schema>;

/** Markers that must never reach storage or a prompt: reasoning blocks and hidden-state keys. */
const REASONING_MARKERS = /<think>|<\/think>|<\|channel>|<channel\|>|chainOfThought|hiddenThoughts|kv_cache|cudaPointer/i;

export function containsReasoningMarkerV1(text: string): boolean {
	return REASONING_MARKERS.test(text);
}

/** Canonical JSON (sorted keys) so the same sequence always gets the same checksum. */
function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonicalize((value as Record<string, unknown>)[k])]));
	}
	return value;
}

/** Matches the draft table's `sequence_checksum` CHECK: `sha256:` plus 64 lowercase hex. */
export function proceduralSequenceChecksumV1(sequence: ProceduralSequenceV1): string {
	return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(sequence)), 'utf8').digest('hex')}`;
}
