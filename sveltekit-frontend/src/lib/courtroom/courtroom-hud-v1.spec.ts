// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { actionBarButtons, clampSeek, formatClock, markerPercent, OBJECTIONS, type ActionBarState } from './courtroom-hud-v1.js';

const base: ActionBarState = { mode: 'live', isAdvancing: false, textAnimating: false, storyReady: true, scriptedPlaying: false, proposalLoading: false, evidenceAdmitted: false };
const ids = (s: Partial<ActionBarState>) => actionBarButtons({ ...base, ...s }).map((b) => b.id);
const by = (s: Partial<ActionBarState>, id: string) => actionBarButtons({ ...base, ...s }).find((b) => b.id === id)!;

describe('action bar by mode', () => {
	it('live: eight buttons with the page\'s shortcuts, objections after a divider, quit always enabled', () => {
		const b = actionBarButtons(base);
		expect(b.map((x) => x.id)).toEqual(['next_turn', 'next_phase', 'respond', 'strategy', 'objection_hearsay', 'objection_relevance', 'objection_foundation', 'cast', 'quit']);
		expect(b.map((x) => x.key)).toEqual(['Space', 'N', 'R', 'S', 'O', 'H', 'T', 'I', undefined]);
		expect(b.filter((x) => x.dividerBefore).map((x) => x.id)).toEqual(['objection_hearsay', 'cast']);
		expect(b.every((x) => !x.disabled)).toBe(true);
	});

	it('live: advancing disables everything but quit and the cast list, and Next reads "..."; text animating turns Next into Skip and keeps it enabled', () => {
		const advancing = actionBarButtons({ ...base, isAdvancing: true });
		expect(advancing.filter((x) => x.disabled).map((x) => x.id)).toEqual(ids({}).filter((i) => i !== 'quit' && i !== 'cast'));
		expect(by({ isAdvancing: true }, 'next_turn').label).toBe('...');
		const typing = actionBarButtons({ ...base, textAnimating: true });
		expect(by({ textAnimating: true }, 'next_turn')).toMatchObject({ label: 'Skip', disabled: false });
		expect(typing.filter((x) => x.disabled).map((x) => x.id)).not.toContain('next_turn');
		expect(typing.find((x) => x.id === 'respond')!.disabled).toBe(true);
	});

	it('completed: only a way back to the lobby', () => {
		expect(actionBarButtons({ ...base, mode: 'completed' })).toEqual([expect.objectContaining({ id: 'return_to_lobby', disabled: false, grow: true })]);
	});

	it('scripted: disabled until the story runtime exists, no advance while playing, no second exhibit', () => {
		const s = (p: Partial<ActionBarState>) => actionBarButtons({ ...base, mode: 'scripted', ...p });
		expect(s({ storyReady: false }).filter((b) => b.disabled).map((b) => b.id)).toEqual(['scripted_toggle', 'scripted_advance', 'scripted_ask', 'scripted_ai', 'scripted_evidence']);
		expect(s({ proposalLoading: true }).find((b) => b.id === 'scripted_ai')).toMatchObject({ disabled: true, label: 'AI thinking…' });
		expect(s({ scriptedPlaying: true }).find((b) => b.id === 'scripted_toggle')).toMatchObject({ label: 'Pause', glyph: '❚❚' });
		expect(s({ scriptedPlaying: true }).find((b) => b.id === 'scripted_advance')!.disabled).toBe(true);
		expect(s({ evidenceAdmitted: true }).find((b) => b.id === 'scripted_evidence')!.disabled).toBe(true);
		expect(s({}).find((b) => b.id === 'scripted_exit')!.disabled).toBe(false);
	});

	it('only uses YoRHa icons that Icon.svelte can render, and gives every button an icon or a glyph', () => {
		const icon = readFileSync(join(process.cwd(), 'src/lib/components/ui/Icon.svelte'), 'utf8');
		const all = [
			...actionBarButtons(base), ...actionBarButtons({ ...base, mode: 'completed' }),
			...actionBarButtons({ ...base, mode: 'scripted' }), ...actionBarButtons({ ...base, mode: 'scripted', scriptedPlaying: true }),
		];
		for (const b of all) {
			if (b.icon) expect(icon.includes(`'${b.icon}':`), `${b.id} icon ${b.icon}`).toBe(true);
			else expect(b.glyph, `${b.id} has neither`).toBeTruthy();
		}
	});

	it('maps each objection to the legal basis the page used before', () => {
		expect(OBJECTIONS.objection_hearsay).toEqual({ objectionType: 'hearsay', objectionBasis: 'Rule 802' });
		expect(OBJECTIONS.objection_relevance).toEqual({ objectionType: 'relevance', objectionBasis: 'Rule 401/403' });
		expect(OBJECTIONS.objection_foundation).toEqual({ objectionType: 'foundation', objectionBasis: 'Insufficient foundation' });
	});
});

describe('timeline maths', () => {
	it('formats clocks and survives bad input', () => {
		expect(formatClock(0)).toBe('0:00');
		expect(formatClock(65_999)).toBe('1:05');
		expect(formatClock(3_600_000)).toBe('60:00');
		for (const bad of [-5, NaN, Infinity]) expect(formatClock(bad)).toBe('0:00');
	});

	it('places and clamps markers and seeks', () => {
		expect(markerPercent(500, 2000)).toBe(25);
		expect(markerPercent(9999, 2000)).toBe(100);
		expect(markerPercent(-1, 2000)).toBe(0);
		expect(markerPercent(500, 0)).toBe(0);
		expect(clampSeek(5000, 2000)).toBe(2000);
		expect(clampSeek(-3, 2000)).toBe(0);
		expect(clampSeek(NaN, 2000)).toBe(0);
		expect(clampSeek(10, 0)).toBe(0);
	});
});
