import type {
	AgentVisualFrame,
	AgentVisualInstance,
	AgentVisualState,
	AgentVisualStatus,
} from '$lib/types/agent.js';

const STATE_CODE: Record<AgentVisualStatus, number> = {
	IDLE: 0,
	SEARCHING: 1,
	ANALYZING: 2,
	EDITING: 3,
	TESTING: 4,
	BLOCKED: 5,
	DONE: 6,
};

const CODE_STATE: AgentVisualStatus[] = [
	'IDLE',
	'SEARCHING',
	'ANALYZING',
	'EDITING',
	'TESTING',
	'BLOCKED',
	'DONE',
];

export const AGENT_SPRITE_INSTANCE_STRIDE = 12;

export function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(1, value));
}

export function clampVisualMetric(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(100, value));
}

export function normalizeAgentVisualState(state: AgentVisualState): AgentVisualState {
	return {
		...state,
		progress: clampVisualMetric(state.progress),
		confidence: clamp01(state.confidence),
		evidence: clamp01(state.evidence),
		activity: clamp01(state.activity),
	};
}

export function lerp(left: number, right: number, alpha: number): number {
	return left + (right - left) * clamp01(alpha);
}

export function easeInOutCubic(alpha: number): number {
	const t = clamp01(alpha);
	return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

export function interpolateAgentVisualState(
	previous: AgentVisualState,
	current: AgentVisualState,
	alpha: number,
): AgentVisualInstance {
	const eased = easeInOutCubic(alpha);
	const normalizedPrevious = normalizeAgentVisualState(previous);
	const normalizedCurrent = normalizeAgentVisualState(current);

	return {
		...normalizedCurrent,
		interpolatedX: lerp(normalizedPrevious.x, normalizedCurrent.x, eased),
		interpolatedY: lerp(normalizedPrevious.y, normalizedCurrent.y, eased),
		alpha: eased,
	};
}

export function stateToSpriteCode(state: AgentVisualStatus): number {
	return STATE_CODE[state] ?? 0;
}

export function spriteCodeToState(code: number): AgentVisualStatus {
	return CODE_STATE[code] ?? 'IDLE';
}

export function packAgentVisualInstances(states: AgentVisualInstance[]): Float32Array {
	const packed = new Float32Array(states.length * AGENT_SPRITE_INSTANCE_STRIDE);
	states.forEach((state, index) => {
		const offset = index * AGENT_SPRITE_INSTANCE_STRIDE;
		packed[offset + 0] = state.interpolatedX;
		packed[offset + 1] = state.interpolatedY;
		packed[offset + 2] = state.previousX;
		packed[offset + 3] = state.previousY;
		packed[offset + 4] = state.progress;
		packed[offset + 5] = state.confidence;
		packed[offset + 6] = state.evidence;
		packed[offset + 7] = state.activity;
		packed[offset + 8] = state.clusterX;
		packed[offset + 9] = state.clusterY;
		packed[offset + 10] = state.spriteId;
		packed[offset + 11] = stateToSpriteCode(state.state);
	});
	return packed;
}

export function buildAgentVisualFrame(
	states: Array<{ previous: AgentVisualState; current: AgentVisualState }>,
	alpha: number,
	frameTimeMs: number = Date.now(),
): AgentVisualFrame {
	return {
		frameTimeMs,
		instances: states.map(({ previous, current }) => interpolateAgentVisualState(previous, current, alpha)),
	};
}
