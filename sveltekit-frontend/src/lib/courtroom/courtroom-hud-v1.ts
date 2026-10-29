/**
 * View-model for the courtroom HUD: which action-bar buttons exist in each mode and when each is disabled, plus the
 * timeline's clock and marker maths. Pure, so the rules the page used to spell out in markup are tested once and the
 * bits-ui components stay presentational. Icons are the local YoRHa SVG components (no icon-font dependency); transport buttons use text glyphs.
 */
export type ActionId =
	| 'next_turn' | 'next_phase' | 'respond' | 'strategy'
	| 'objection_hearsay' | 'objection_relevance' | 'objection_foundation' | 'quit' | 'cast'
	| 'return_to_lobby'
	| 'scripted_toggle' | 'scripted_advance' | 'scripted_ask' | 'scripted_ai' | 'scripted_evidence' | 'scripted_exit';

export type ActionTone = 'go' | 'info' | 'respond' | 'strategy' | 'objection' | 'holdit' | 'takethat' | 'quiet' | 'done';

export interface ActionButton {
	id: ActionId;
	label: string;
	/** Keyboard shortcut shown on the button (the page's key handler owns the binding). */
	key?: string;
	/** YoRHa icon name (`<Icon name=…>`), or null when the YoRHa set has no equivalent and `glyph` is shown instead. */
	icon: string | null;
	glyph?: string;
	tone: ActionTone;
	disabled: boolean;
	/** Draw a divider before this button. */
	dividerBefore?: boolean;
	/** The primary button takes the free width. */
	grow?: boolean;
}

export interface ActionBarState {
	mode: 'live' | 'completed' | 'scripted';
	isAdvancing: boolean;
	textAnimating: boolean;
	/** Scripted preview only. */
	storyReady: boolean;
	scriptedPlaying: boolean;
	proposalLoading: boolean;
	evidenceAdmitted: boolean;
}

export function actionBarButtons(s: ActionBarState): ActionButton[] {
	if (s.mode === 'scripted') {
		const off = !s.storyReady;
		return [
			{ id: 'scripted_toggle', label: s.scriptedPlaying ? 'Pause' : 'Play', icon: null, glyph: s.scriptedPlaying ? '❚❚' : '▶', tone: 'info', disabled: off },
			{ id: 'scripted_advance', label: 'Advance 1 sec', key: 'Space', icon: null, glyph: '»', tone: 'go', disabled: off || s.scriptedPlaying, grow: true },
			{ id: 'scripted_ask', label: 'Ask witness', icon: 'yorha-subject', tone: 'respond', disabled: off },
			{ id: 'scripted_ai', label: s.proposalLoading ? 'AI thinking…' : 'AI suggestion', icon: 'yorha-subject', tone: 'info', disabled: off || s.proposalLoading },
			{ id: 'scripted_evidence', label: 'Admit exhibit', icon: 'yorha-evidence', tone: 'strategy', disabled: off || s.evidenceAdmitted },
			{ id: 'cast', label: 'Cast', key: 'I', icon: 'yorha-subject', tone: 'info', disabled: false, dividerBefore: true },
			{ id: 'scripted_exit', label: 'Exit preview', icon: 'yorha-panel-close', tone: 'quiet', disabled: false },
		];
	}
	if (s.mode === 'completed') {
		return [{ id: 'return_to_lobby', label: 'Return to lobby', icon: 'yorha-panel-open', tone: 'done', disabled: false, grow: true }];
	}
	const busy = s.isAdvancing || s.textAnimating;
	return [
		{ id: 'next_turn', label: s.textAnimating ? 'Skip' : s.isAdvancing ? '...' : 'Next', key: 'Space', icon: null, glyph: '»', tone: 'go', disabled: s.isAdvancing, grow: true },
		{ id: 'next_phase', label: 'Phase', key: 'N', icon: 'yorha-timeline', tone: 'info', disabled: busy },
		{ id: 'respond', label: 'Respond', key: 'R', icon: 'yorha-ai-assistant', tone: 'respond', disabled: busy },
		{ id: 'strategy', label: 'Strategy', key: 'S', icon: 'yorha-law-book', tone: 'strategy', disabled: busy },
		{ id: 'objection_hearsay', label: 'Objection!', key: 'O', icon: 'yorha-warning', tone: 'objection', disabled: busy, dividerBefore: true },
		{ id: 'objection_relevance', label: 'Hold it!', key: 'H', icon: 'yorha-integrity', tone: 'holdit', disabled: busy },
		{ id: 'objection_foundation', label: 'Take that!', key: 'T', icon: 'yorha-precedent', tone: 'takethat', disabled: busy },
		{ id: 'cast', label: 'Cast', key: 'I', icon: 'yorha-subject', tone: 'info', disabled: false, dividerBefore: true },
		{ id: 'quit', label: 'Quit', icon: 'yorha-panel-close', tone: 'quiet', disabled: false,  },
	];
}

/** The three objections and the legal basis each sends (unchanged from the page's own handlers). */
export const OBJECTIONS = {
	objection_hearsay: { objectionType: 'hearsay', objectionBasis: 'Rule 802' },
	objection_relevance: { objectionType: 'relevance', objectionBasis: 'Rule 401/403' },
	objection_foundation: { objectionType: 'foundation', objectionBasis: 'Insufficient foundation' },
} as const;

/** m:ss for a millisecond clock; negative, NaN and infinite values read as 0:00. */
export function formatClock(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return '0:00';
	const total = Math.floor(ms / 1000);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Left offset (0..100) of a keyframe marker on the scrubber; clamped, 0 when there is no duration. */
export function markerPercent(timeMs: number, durationMs: number): number {
	if (!Number.isFinite(timeMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 0;
	return Math.min(100, Math.max(0, (timeMs / durationMs) * 100));
}

/** Keep a scrubber value inside the timeline. */
export function clampSeek(valueMs: number, durationMs: number): number {
	if (!Number.isFinite(valueMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 0;
	return Math.min(durationMs, Math.max(0, valueMs));
}

export const PLAYBACK_SPEEDS = [0.5, 1, 2] as const;
