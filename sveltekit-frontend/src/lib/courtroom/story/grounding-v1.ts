import type { Story } from './engine';

export interface GroundingReport {
	ok: boolean;
	/** Dialogue cue ids with no `requiredEvidence`. */
	missing: string[];
	/** Dialogue cue ids whose `requiredEvidence` is not an existing chunk id. */
	unknownChunk: string[];
}

/**
 * A story built from uploaded documents may only say what a chunk supports: every `dialogue` cue must name an existing
 * chunk id as `requiredEvidence`. Pure and read-only; `chunkIds` are the ids of the chunks the upload actually produced.
 * Hand-written stories are not subject to this check.
 */
export function validateGrounding(story: Story, chunkIds: Iterable<string>): GroundingReport {
	const known = new Set(chunkIds);
	const missing: string[] = [];
	const unknownChunk: string[] = [];
	for (const cue of story.cues) {
		if (cue.kind !== 'dialogue') continue;
		if (!cue.requiredEvidence) missing.push(cue.id);
		else if (!known.has(cue.requiredEvidence)) unknownChunk.push(cue.id);
	}
	return { ok: missing.length === 0 && unknownChunk.length === 0, missing, unknownChunk };
}
