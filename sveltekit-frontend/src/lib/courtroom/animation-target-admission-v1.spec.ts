import { describe, expect, it } from 'vitest';
import { admitAnimationGroupTargets } from './animation-target-admission-v1.js';

describe('admitAnimationGroupTargets', () => {
	it('accepts targets owned through the character root', () => {
		const root = {};
		const child = { parent: root };
		expect(admitAnimationGroupTargets({ targetedAnimations: [{ target: child }] }, { root })).toEqual({
			ok: true,
			targetCount: 1,
		});
	});

	it('accepts linked transform nodes in the character skeleton', () => {
		const root = {};
		const linkedNode = {};
		expect(
			admitAnimationGroupTargets(
				{ targetedAnimations: [{ target: linkedNode }] },
				{ root, skeleton: { bones: [{ getTransformNode: () => linkedNode }] } }
			)
		).toEqual({ ok: true, targetCount: 1 });
	});

	it('rejects clips containing null targets', () => {
		expect(admitAnimationGroupTargets({ targetedAnimations: [{ target: null }] }, { root: {} })).toEqual({
			ok: false,
			reason: 'NULL_TARGET',
		});
	});

	it('rejects targets from another imported rig', () => {
		expect(
			admitAnimationGroupTargets({ targetedAnimations: [{ target: { parent: {} } }] }, { root: {} })
		).toEqual({ ok: false, reason: 'TARGET_NOT_OWNED_BY_CHARACTER' });
	});

	it('rejects groups with no animation targets', () => {
		expect(admitAnimationGroupTargets({ targetedAnimations: [] }, { root: {} })).toEqual({
			ok: false,
			reason: 'NO_TARGETS',
		});
	});
});
