/**
 * Copy for the courtroom loading assistant (the "while everything loads" aide, in the style of a visual-novel
 * court game). Deterministic and offline: no model call, so it never waits on, or contends with, the :8090 slot.
 * Every tip describes a control that exists in `courtroom-sim/+page.svelte`; update both together.
 */
export interface CaseBrief {
	charges: number;
	parties: number;
	events: number;
}

export interface AssistantInput {
	progress: number;
	brief?: CaseBrief | null;
	/** Rotates the tip; callers advance it on a timer. */
	tick?: number;
}

export interface AssistantMessage {
	headline: string;
	tip: string;
}

export const COURTROOM_TIPS: readonly string[] = [
	'Press E to open the case brief: charges, parties and the event timeline.',
	'Press L to read the dialogue log. Click an entry to jump back to that line.',
	'Press P for timeline playback. You can step between keyframes or change the speed.',
	'Use Respond to answer in your own words, and Strategy for guidance before you commit.',
	'Object at the right moment. Hearsay, relevance and foundation each have their own button.',
	'Press C to switch the CRT filter off if the picture looks too soft.',
	'This is a fictional simulation. Nothing you do here becomes a record of a real case.',
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function buildAssistantMessage({ progress, brief, tick = 0 }: AssistantInput): AssistantMessage {
	const pct = Number.isFinite(progress) ? Math.min(100, Math.max(0, Math.round(progress))) : 0;
	const tip = COURTROOM_TIPS[((Math.trunc(tick) % COURTROOM_TIPS.length) + COURTROOM_TIPS.length) % COURTROOM_TIPS.length];
	if (pct >= 100) return { headline: 'Everything is in place. Court is in session.', tip };
	if (brief && brief.charges + brief.parties + brief.events > 0) {
		return {
			headline: `Your case file is ready: ${plural(brief.charges, 'charge')}, ${plural(brief.parties, 'party', 'parties')}, ${plural(brief.events, 'timeline event')}. Setting up the courtroom (${pct}%).`,
			tip,
		};
	}
	return { headline: `Setting up the courtroom (${pct}%).`, tip };
}
