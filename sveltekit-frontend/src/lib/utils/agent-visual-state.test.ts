import { describe, expect, it } from 'vitest';
import {
	AGENT_SPRITE_INSTANCE_STRIDE,
	buildAgentVisualFrame,
	clamp01,
	interpolateAgentVisualState,
	packAgentVisualInstances,
	spriteCodeToState,
	stateToSpriteCode,
} from './agent-visual-state.js';
import type { AgentVisualState } from '$lib/types/agent.js';

function makeState(overrides: Partial<AgentVisualState> = {}): AgentVisualState {
	return {
		agentId: 'agent-1',
		state: 'SEARCHING',
		progress: 42,
		confidence: 0.75,
		evidence: 0.5,
		activity: 0.6,
		clusterX: 12,
		clusterY: 8,
		previousX: 10,
		previousY: 6,
		x: 14,
		y: 12,
		spriteId: 3,
		paletteIndex: 2,
		animationId: 7,
		updatedAtMs: 1_725_000_000_000,
		...overrides,
	};
}

describe('agent visual state helpers', () => {
	it('clamps interpolation inputs to [0, 1]', () => {
		expect(clamp01(-1)).toBe(0);
		expect(clamp01(0.25)).toBe(0.25);
		expect(clamp01(2)).toBe(1);
	});

	it('interpolates positions and preserves normalized metrics', () => {
		const previous = makeState({ x: 0, y: 0, progress: 10 });
		const current = makeState({ x: 100, y: 40, progress: 80, state: 'ANALYZING' });

		const result = interpolateAgentVisualState(previous, current, 0.5);

		expect(result.interpolatedX).toBeGreaterThan(0);
		expect(result.interpolatedX).toBeLessThan(100);
		expect(result.interpolatedY).toBeGreaterThan(0);
		expect(result.interpolatedY).toBeLessThan(40);
		expect(result.progress).toBe(80);
		expect(result.state).toBe('ANALYZING');
	});

	it('packs sprite instances into a fixed stride buffer', () => {
		const frame = buildAgentVisualFrame(
			[
				{
					previous: makeState({ x: 0, y: 0 }),
					current: makeState({ x: 24, y: 48, state: 'DONE', spriteId: 9 }),
				},
			],
			1,
		);

		const packed = packAgentVisualInstances(frame.instances);
		expect(packed).toBeInstanceOf(Float32Array);
		expect(packed.length).toBe(AGENT_SPRITE_INSTANCE_STRIDE);
		expect(packed[0]).toBeCloseTo(24, 5);
		expect(packed[1]).toBeCloseTo(48, 5);
		expect(spriteCodeToState(packed[11])).toBe('DONE');
		expect(stateToSpriteCode('DONE')).toBeGreaterThan(0);
	});
});
