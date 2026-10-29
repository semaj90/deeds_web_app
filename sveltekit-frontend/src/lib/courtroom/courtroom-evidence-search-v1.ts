import { z } from 'zod';

/** Shape of the `results` entries returned by POST /api/evidence/search (`SearchResult` in that route). */
const hit = z.object({
	evidenceId: z.string(),
	chunkIndex: z.number(),
	content: z.string(),
	score: z.number(),
	metadata: z.record(z.string(), z.unknown()).optional()
});
const response = z.object({ results: z.array(hit), timing: z.object({ totalMs: z.number() }).partial().optional() });

export interface EvidenceRow {
	/** `evidenceId:chunkIndex`; stable, display-only, and NOT an admission to the courtroom. */
	key: string;
	evidenceId: string;
	snippet: string;
	score: number;
	source: string | null;
}

export type EvidenceSearchView =
	| { kind: 'rows'; rows: EvidenceRow[]; totalMs: number | null }
	| { kind: 'empty'; totalMs: number | null }
	| { kind: 'malformed' };

/** Turn a raw search response into display rows. Search results are informational: they never admit evidence. */
export function viewEvidenceSearch(data: unknown, maxSnippet = 240): EvidenceSearchView {
	const parsed = response.safeParse(data);
	if (!parsed.success) return { kind: 'malformed' };
	const totalMs = parsed.data.timing?.totalMs ?? null;
	if (parsed.data.results.length === 0) return { kind: 'empty', totalMs };
	const rows = parsed.data.results.map((h): EvidenceRow => {
		const m = h.metadata ?? {};
		const source = ['file_path', 'source_ref', 'title', 'heading'].map((k) => m[k]).find((v) => typeof v === 'string') as string | undefined;
		const text = h.content.replace(/\s+/g, ' ').trim();
		return {
			key: `${h.evidenceId}:${h.chunkIndex}`,
			evidenceId: h.evidenceId,
			snippet: text.length > maxSnippet ? `${text.slice(0, maxSnippet - 1)}…` : text,
			score: Math.round(h.score * 1000) / 1000,
			source: source ?? null
		};
	});
	return { kind: 'rows', rows, totalMs };
}

/** Plain-language text for a failed call, so the panel never shows a stack or a raw status. */
export function describeApiFailure(r: { reason: string; status?: number }): string {
	switch (r.reason) {
		case 'REFUSED':
			return 'This call is not allowed from the courtroom.';
		case 'BAD_REQUEST':
			return 'The search text is not valid (1 to 5000 characters).';
		case 'HTTP':
			return r.status === 401 || r.status === 403 ? 'You are not signed in or not allowed to search this case.' : `The server answered with an error (${r.status}).`;
		case 'NETWORK':
			return 'Could not reach the server.';
		default:
			return 'The server answer was not in the expected shape.';
	}
}
