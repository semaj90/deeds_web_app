// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { castCards } from './courtroom-cast-v1.js';
import { STATIONS, worldToCell } from './courtroom-floorplan-v1.js';

describe('cast cards', () => {
	const cards = castCards();

	it('has one card per seat except the user, in the floor plan\'s order', () => {
		expect(cards.map((c) => c.id)).toEqual(STATIONS.filter((s) => s.role !== 'user').map((s) => s.role));
		expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
	});

	it('marks exactly one card as the user: the prosecution seat the user shares', () => {
		expect(cards.filter((c) => c.you).map((c) => c.id)).toEqual(['prosecutor']);
	});

	it('takes the grid cell from the floor plan and flags seats the scene cannot show yet', () => {
		const judge = cards.find((c) => c.id === 'judge')!;
		expect(judge.cell).toEqual(worldToCell(0, -6.5));
		expect(cards.find((c) => c.id === 'defendant')!.inScene).toBe(false);
		expect(cards.find((c) => c.id === 'witness')!.inScene).toBe(true);
	});

	it('uses only YoRHa icons that Icon.svelte can render', () => {
		const icon = readFileSync(join(process.cwd(), 'src/lib/components/ui/Icon.svelte'), 'utf8');
		for (const c of cards) expect(icon.includes(`'${c.icon}':`), c.icon).toBe(true);
	});
});

import { proposalForCard, seatForActor } from './courtroom-cast-v1';

describe('cast proposals', () => {
	const p = { actorId: 'jester', text: 'I object.', intent: 'answer', evidenceIds: ['e1', 'e2'], modelRevision: 'm1' };
	it('maps story actors to seats', () => {
		expect(seatForActor('jester')).toBe('defense');
		expect(seatForActor('judge')).toBe('judge');
		expect(seatForActor('ghost')).toBeNull();
	});
	it('shows a proposal only on its own card', () => {
		expect(proposalForCard(p, 'defense')).toEqual({ text: 'I object.', intent: 'answer', evidenceCount: 2, modelRevision: 'm1' });
		expect(proposalForCard(p, 'judge')).toBeNull();
		expect(proposalForCard(null, 'defense')).toBeNull();
	});
});
