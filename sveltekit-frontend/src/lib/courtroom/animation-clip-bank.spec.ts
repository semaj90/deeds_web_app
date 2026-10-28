// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { AnimationClipBank } from './animation-clip-bank.js';

function makeBank(max: number, pinned: string[] = []) {
	const load = vi.fn(async (n: string) => ({ n }));
	const dispose = vi.fn();
	return { bank: new AnimationClipBank({ maxResident: max, pinned, load, dispose }), load, dispose };
}

describe('AnimationClipBank', () => {
	it('keeps at most maxResident clips and evicts the least recently used', async () => {
		const { bank, dispose } = makeBank(3);
		for (const n of ['a', 'b', 'c']) await bank.get(n);
		await bank.get('a'); // refresh a, so b is oldest
		await bank.get('d');
		expect(bank.residentNames.sort()).toEqual(['a', 'c', 'd']);
		expect(dispose).toHaveBeenCalledWith('b', { n: 'b' });
	});

	it('never evicts pinned clips', async () => {
		const { bank } = makeBank(3, ['idle', 'speaking']);
		await bank.get('idle');
		await bank.get('speaking');
		for (const n of ['x', 'y', 'z']) await bank.get(n);
		expect(bank.residentNames).toContain('idle');
		expect(bank.residentNames).toContain('speaking');
		expect(bank.residentNames).toHaveLength(3);
	});

	it('never evicts a clip that is in use, and evicts it after release', async () => {
		const { bank, dispose } = makeBank(2);
		const a = await bank.acquire('a');
		await bank.get('b');
		await bank.get('c'); // a is oldest but in use, so b goes
		expect(bank.residentNames.sort()).toEqual(['a', 'c']);
		await bank.get('d'); // over capacity again; a still in use, c goes
		expect(bank.residentNames.sort()).toEqual(['a', 'd']);
		a.release();
		a.release(); // idempotent
		await bank.get('e');
		expect(bank.residentNames).not.toContain('a');
		expect(dispose).toHaveBeenCalledWith('a', { n: 'a' });
	});

	it('shares one in-flight load for concurrent requests', async () => {
		const { bank, load } = makeBank(2);
		await Promise.all([bank.get('a'), bank.get('a'), bank.get('a')]);
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('rejects impossible configurations', () => {
		expect(() => new AnimationClipBank({ maxResident: 0, load: async () => 1 })).toThrow(RangeError);
		expect(() => new AnimationClipBank({ maxResident: 1, pinned: ['a', 'b'], load: async () => 1 })).toThrow(RangeError);
	});

	it('prefetch swallows load failures', async () => {
		const bank = new AnimationClipBank({ maxResident: 1, load: async () => { throw new Error('404'); } });
		expect(() => bank.prefetch('missing')).not.toThrow();
		await new Promise((r) => setTimeout(r, 0));
	});

	it('dispose releases every resident clip', async () => {
		const { bank, dispose } = makeBank(3);
		await bank.get('a'); await bank.get('b');
		bank.dispose();
		expect(dispose).toHaveBeenCalledTimes(2);
		expect(bank.residentNames).toEqual([]);
	});
});
