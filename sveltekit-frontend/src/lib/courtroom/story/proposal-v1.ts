import { validateStory, type ActorSpec, type Story } from './engine';
import { validateGrounding } from './grounding-v1';

/** What the author of a story is allowed to cite: one authorized case and one frozen evidence snapshot. */
export interface EvidenceSnapshot {
	/** Digest of the frozen chunk set; a proposal built from another digest is stale. */
	digest: string;
	caseScope: string;
	/** chunk id -> the source revision the passage was read at. */
	chunks: ReadonlyMap<string, { revision: string; text: string }>;
}

export type GroundingStatus = 'PROPOSED' | 'VERIFIED' | 'REJECTED';

/** Reuses the existing `Story`; this wrapper only adds provenance and review state. A proposal never self-promotes. */
export interface GroundedStoryProposal {
	proposalId: string;
	sourceSnapshotDigest: string;
	caseScope: string;
	storyVersion: string;
	story: Story;
	groundingStatus: GroundingStatus;
}

export type SupportVerdict = 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN';
/** Decides whether a passage supports a line. Embedding similarity alone must not answer SUPPORTED. */
export type SupportChecker = (line: string, passage: string) => SupportVerdict;

const firstSentence = (text: string, max = 240): string => {
	const clean = text.replace(/\s+/g, ' ').trim();
	const m = clean.match(/^.*?[.!?](\s|$)/);
	const s = (m ? m[0] : clean).trim();
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
const slug = (id: string) => id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';

export interface BuildInput {
	proposalId: string;
	storyId: string;
	title: string;
	actors: ActorSpec[];
	/** The actor who speaks the lines. */
	speakerActorId: string;
	snapshot: EvidenceSnapshot;
	/** Chunk ids to build from, in the order they should be spoken. */
	chunkIds: string[];
	startTick?: number;
	gapTicks?: number;
}

/**
 * Deterministic template fallback: one dialogue cue per chunk, the line being that chunk's first sentence, each cue
 * citing its chunk. Nothing is invented; a chunk the snapshot does not hold is skipped and reported by the validator
 * later, not papered over. Same input gives the same proposal.
 */
export function buildGroundedProposal(input: BuildInput): GroundedStoryProposal {
	const start = input.startTick ?? 60;
	const gap = input.gapTicks ?? 90;
	const cues: Story['cues'] = [{ id: 'phase-testimony', tick: start - 30, actorId: input.speakerActorId, kind: 'phase', value: 'testimony' }];
	input.chunkIds.forEach((chunkId, index) => {
		const chunk = input.snapshot.chunks.get(chunkId);
		if (!chunk) return;
		cues.push({
			id: `say-${String(index).padStart(3, '0')}-${slug(chunkId)}`,
			tick: start + index * gap,
			actorId: input.speakerActorId,
			kind: 'dialogue',
			value: firstSentence(chunk.text),
			requiredEvidence: chunkId
		});
	});
	cues.sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id));
	return {
		proposalId: input.proposalId,
		sourceSnapshotDigest: input.snapshot.digest,
		caseScope: input.snapshot.caseScope,
		storyVersion: '1',
		story: { version: 1, id: input.storyId, title: input.title, actors: input.actors, cues },
		groundingStatus: 'PROPOSED'
	};
}

export interface GroundingGates {
	structural: { ok: boolean; reasons: string[] };
	semantic: { ok: boolean; unsupported: string[]; unknown: string[] };
}

/**
 * Two separate gates. Structural: the story validates, the proposal was built from THIS snapshot and case, and every
 * dialogue cue cites a chunk the snapshot holds. Semantic: the cited passage supports the line, judged by `check`.
 * Without a checker every line is UNKNOWN, so the status stays PROPOSED: unverified is never reported as verified.
 */
export function evaluateGrounding(proposal: GroundedStoryProposal, snapshot: EvidenceSnapshot, check?: SupportChecker): { status: GroundingStatus; gates: GroundingGates } {
	const reasons: string[] = [];
	if (!validateStory(proposal.story)) reasons.push('STORY_INVALID');
	if (proposal.sourceSnapshotDigest !== snapshot.digest) reasons.push('SNAPSHOT_DIGEST_MISMATCH');
	if (proposal.caseScope !== snapshot.caseScope) reasons.push('CASE_SCOPE_MISMATCH');
	const g = validateGrounding(proposal.story, snapshot.chunks.keys());
	if (g.missing.length) reasons.push(`UNCITED:${g.missing.join(',')}`);
	if (g.unknownChunk.length) reasons.push(`UNKNOWN_CHUNK:${g.unknownChunk.join(',')}`);
	const structural = { ok: reasons.length === 0, reasons };

	const unsupported: string[] = [];
	const unknown: string[] = [];
	if (structural.ok) {
		for (const cue of proposal.story.cues) {
			if (cue.kind !== 'dialogue') continue;
			const passage = snapshot.chunks.get(cue.requiredEvidence!)!.text;
			const verdict = check ? check(cue.value, passage) : 'UNKNOWN';
			if (verdict === 'UNSUPPORTED') unsupported.push(cue.id);
			else if (verdict !== 'SUPPORTED') unknown.push(cue.id);
		}
	}
	const semantic = { ok: structural.ok && unsupported.length === 0 && unknown.length === 0, unsupported, unknown };
	const status: GroundingStatus = !structural.ok || unsupported.length ? 'REJECTED' : semantic.ok ? 'VERIFIED' : 'PROPOSED';
	return { status, gates: { structural, semantic } };
}
