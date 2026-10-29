/**
 * The "who is in the room" cards: one NES-style profile per seat, built from the floor plan so the card, the grid and the
 * scene cannot disagree about where someone stands. The user plays the prosecution, so that card is marked "you".
 */
import { STATIONS, worldToCell, type SeatRole } from './courtroom-floorplan-v1.js';

export interface CastCard {
	id: SeatRole;
	title: string;
	blurb: string;
	/** Where they stand, in words, from the floor plan. */
	where: string;
	cell: { col: number; row: number };
	you: boolean;
	/** False for seats the scene has no model for yet (shown dashed, not hidden). */
	inScene: boolean;
	/** YoRHa icon name from Icon.svelte. */
	icon: string;
}

const COPY: Record<Exclude<SeatRole, 'user'>, { title: string; blurb: string; icon: string }> = {
	judge: { title: 'Judge', blurb: 'Presides, rules on objections and keeps order.', icon: 'yorha-law-book' },
	prosecutor: { title: 'Prosecution', blurb: 'Presents the case and examines witnesses.', icon: 'yorha-precedent' },
	defense: { title: 'Defense counsel', blurb: 'Challenges the evidence and protects the defendant.', icon: 'yorha-integrity' },
	defendant: { title: 'Defendant', blurb: 'The accused. Seated beside defense counsel.', icon: 'yorha-subject' },
	witness: { title: 'Witness', blurb: 'Gives testimony from the stand under examination.', icon: 'yorha-citation' },
	narrator: { title: 'Narrator', blurb: 'Describes the scene between turns.', icon: 'yorha-glossary' },
};

export function castCards(): CastCard[] {
	const youStation = STATIONS.find((s) => s.role === 'user');
	return STATIONS.filter((s) => s.role !== 'user').map((s) => {
		const copy = COPY[s.role as Exclude<SeatRole, 'user'>];
		const you = s.role === 'prosecutor' && !!youStation && youStation.x === s.x && youStation.z === s.z;
		return {
			id: s.role,
			title: copy.title,
			blurb: copy.blurb,
			where: s.label,
			cell: worldToCell(s.x, s.z),
			you,
			inScene: s.inScene,
			icon: copy.icon,
		};
	});
}

/** Seat a story actor stands at: `jester` is drawn on the defense character; a seat id maps to itself; anything else has no card. */
export function seatForActor(actorId: string): SeatRole | null {
	if (actorId === 'jester') return 'defense';
	return STATIONS.some((s) => s.role === actorId) ? (actorId as SeatRole) : null;
}

export interface CardProposal {
	text: string;
	intent: string;
	evidenceCount: number;
	modelRevision: string;
}

/** Proposal text for one card, or null. Proposals are display-only and never reach the story reducer from here. */
export function proposalForCard(
	proposal: { actorId: string; text: string; intent: string; evidenceIds: readonly string[]; modelRevision: string } | null | undefined,
	cardId: SeatRole
): CardProposal | null {
	if (!proposal || seatForActor(proposal.actorId) !== cardId) return null;
	return { text: proposal.text, intent: proposal.intent, evidenceCount: proposal.evidenceIds.length, modelRevision: proposal.modelRevision };
}
