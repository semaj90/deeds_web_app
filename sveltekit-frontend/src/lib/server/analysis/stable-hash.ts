import { createHash } from 'node:crypto';

/**
 * Deterministic JSON stringify — object keys sorted, so the same logical
 * value always produces the same string regardless of key insertion order.
 * Canonical owner for this pair; code-evidence-synthesizer.ts,
 * analysis-pass-results.ts (server + schema) each still carry their own
 * private copy — not consolidated here, out of scope for this change, but
 * new code in this lane should import from here instead of adding a fourth.
 */
export function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
	}

	return `{${Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
		.join(',')}}`;
}

export function sha256Hex(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}
