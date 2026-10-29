/**
 * Mood-driven secondary motion for the jester accessories worn by Alice (halo, collar ruffle, angel and demon wings,
 * tail, head pieces). Renderer-independent: it produces a rotation angle per pivot; the scene parents each pivot to
 * its bone (see `jester-part-bone-table-v1.ts`) and applies the angles to the pivot nodes.
 *
 * Physics is a deterministic damped spring per pivot (fixed 1/120 s sub-steps, so the same inputs always give the same
 * motion regardless of frame rate), with a joint limit and a clamped drive so a bad frame cannot blow it up. Tail links
 * are chained: each link's spring is driven by the previous link's velocity, which gives follow-through lag.
 *
 * Aligned with the story: moods are the story engine's `Mood`. The story owns the mood; this only follows it.
 *
 * The part identities (cap horns 25-38, staff 55-56, wings, tail, halo) were render-verified on 2026-10-28; the rest axes
 * below are NOT: they assume the OBJ's own frame after the documented 180-degree Y turn and need a render on Alice.
 */
import type { Mood } from './story/engine.js';

export interface PivotSpec {
	id: string;
	/** `J_Bip_*` bone the pivot is parented to. */
	bone: string;
	/** Parts of `half_angel_half_demon_jester.obj` (0-based `o` order) that hang off the pivot. */
	parts: readonly number[];
	/** Local axis the pivot rotates about. */
	axis: readonly [number, number, number];
	/** Joint limit in radians (symmetric). */
	limit: number;
	/** Spring stiffness (1/s^2) and damping (1/s). */
	stiffness: number;
	damping: number;
	/** Pivot id of the previous link; its velocity drives this link (tail chain). */
	follows?: string;
}

const TAIL_PARTS = [73, 74, 75, 76, 77, 78, 79, 80] as const;
/** The jester cap's two floppy horns: six links and a bell each (part order along the horn). Ribs 39-43 ride link 0 of A. */
const CAP_HORN_A = [25, 26, 27, 28, 29, 30, 31] as const;
const CAP_HORN_B = [32, 33, 34, 35, 36, 37, 38] as const;
const CAP_RIBS = [39, 40, 41, 42, 43] as const;
const hornLinks = (prefix: string, parts: readonly number[], extra: readonly number[] = []): PivotSpec[] =>
	parts.map((part, i) => ({
		id: `${prefix}${i}`,
		bone: 'J_Bip_C_Head',
		parts: i === 0 ? [part, ...extra] : [part],
		axis: [0, 0, 1] as const,
		limit: 0.45,
		stiffness: 85 - i * 5,
		damping: 7,
		follows: i === 0 ? undefined : `${prefix}${i - 1}`,
	}));

export const JESTER_ACCESSORY_PIVOTS: readonly PivotSpec[] = [
	{ id: 'halo', bone: 'J_Bip_C_Head', parts: [44], axis: [1, 0, 0], limit: 0.35, stiffness: 60, damping: 5 },
	{ id: 'staff', bone: 'J_Bip_R_Hand', parts: [55, 56], axis: [1, 0, 0], limit: 0.15, stiffness: 150, damping: 15 },
	{ id: 'collar', bone: 'J_Bip_C_UpperChest', parts: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], axis: [1, 0, 0], limit: 0.2, stiffness: 120, damping: 12 },
	{ id: 'wingAngel', bone: 'J_Bip_C_UpperChest', parts: [45, 46, 47, 48, 49, 50, 51, 52, 53, 54], axis: [0, 1, 0], limit: 1.1, stiffness: 40, damping: 6 },
	{ id: 'wingDemon', bone: 'J_Bip_C_UpperChest', parts: [57, 58, 59, 60, 61, 62, 63, 64], axis: [0, 1, 0], limit: 1.1, stiffness: 40, damping: 6 },
	...hornLinks('capA', CAP_HORN_A, CAP_RIBS),
	...hornLinks('capB', CAP_HORN_B),
	...TAIL_PARTS.map((part, i): PivotSpec => ({
		id: `tail${i}`,
		bone: 'J_Bip_C_Hips',
		parts: [part],
		axis: [1, 0, 0],
		limit: 0.5,
		stiffness: 70 - i * 4,
		damping: 6,
		follows: i === 0 ? undefined : `tail${i - 1}`,
	})),
];

/** Target angle (radians) per pivot id for one mood; pivots not listed rest at 0. Tail targets spread across links. */
export const MOOD_TARGETS: Record<Mood, Readonly<Record<string, number>>> = {
	neutral: {},
	confident: { halo: -0.1, capA0: 0.12, capB0: -0.12, wingAngel: 0.5, wingDemon: 0.5, tail0: -0.25 },
	nervous: { halo: 0.15, capA0: -0.25, capB0: 0.25, wingAngel: -0.7, wingDemon: -0.7, collar: 0.1, tail0: 0.3 },
	angry: { halo: 0.2, capA0: -0.15, capB0: 0.15, wingAngel: -0.3, wingDemon: 0.95, tail0: -0.4, tail1: -0.2 },
	relieved: { halo: -0.2, capA0: 0.08, capB0: -0.08, wingAngel: 0.9, wingDemon: -0.2, tail0: 0.1 },
};

const SUBSTEP = 1 / 120;
const MAX_FRAME = 0.1; // seconds; longer frames are clamped, never integrated in one go
const MAX_DRIVE = 20; // rad/s fed from the previous link or the body
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface State {
	angle: number;
	velocity: number;
}

export class JesterAccessoryRig {
	private mood: Mood = 'neutral';
	private readonly state = new Map<string, State>();
	private carry = 0;

	constructor(private readonly specs: readonly PivotSpec[] = JESTER_ACCESSORY_PIVOTS) {
		for (const s of specs) this.state.set(s.id, { angle: 0, velocity: 0 });
	}

	setMood(mood: Mood): void {
		this.mood = mood in MOOD_TARGETS ? mood : 'neutral';
	}

	/**
	 * Advance by `dtSeconds`. `bodyAngularVelocity` (rad/s, e.g. the head turning) kicks the springs so accessories lag
	 * behind the body; it is clamped, and non-finite input is ignored.
	 */
	step(dtSeconds: number, bodyAngularVelocity = 0): void {
		if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
		const drive = Number.isFinite(bodyAngularVelocity) ? clamp(bodyAngularVelocity, -MAX_DRIVE, MAX_DRIVE) : 0;
		this.carry += Math.min(dtSeconds, MAX_FRAME);
		const targets = MOOD_TARGETS[this.mood];
		while (this.carry >= SUBSTEP) {
			this.carry -= SUBSTEP;
			for (const s of this.specs) {
				const st = this.state.get(s.id)!;
				const target = clamp(targets[s.id] ?? 0, -s.limit, s.limit);
				const lead = s.follows ? (this.state.get(s.follows)?.velocity ?? 0) : drive;
				const accel = -s.stiffness * (st.angle - target) - s.damping * st.velocity + s.stiffness * 0.15 * clamp(lead, -MAX_DRIVE, MAX_DRIVE) * (s.follows ? 1 : -1);
				st.velocity += accel * SUBSTEP;
				st.angle += st.velocity * SUBSTEP;
				if (st.angle > s.limit || st.angle < -s.limit) {
					st.angle = clamp(st.angle, -s.limit, s.limit);
					st.velocity = 0; // hit the joint stop
				}
			}
		}
	}

	angle(id: string): number {
		return this.state.get(id)?.angle ?? 0;
	}

	/** Snapshot of every pivot's angle (radians). */
	angles(): Record<string, number> {
		const out: Record<string, number> = {};
		for (const [id, st] of this.state) out[id] = st.angle;
		return out;
	}

	reset(): void {
		for (const st of this.state.values()) { st.angle = 0; st.velocity = 0; }
		this.carry = 0;
	}
}

/** Every part belongs to exactly one pivot, and every pivot's `follows` exists. Throws on a malformed table. */
export function validateAccessoryPivots(specs: readonly PivotSpec[] = JESTER_ACCESSORY_PIVOTS): void {
	const ids = new Set<string>();
	const seen = new Set<number>();
	for (const s of specs) {
		if (ids.has(s.id)) throw new Error(`duplicate pivot ${s.id}`);
		ids.add(s.id);
		for (const p of s.parts) {
			if (seen.has(p)) throw new Error(`part ${p} in two pivots`);
			seen.add(p);
		}
	}
	for (const s of specs) if (s.follows && !ids.has(s.follows)) throw new Error(`pivot ${s.id} follows unknown ${s.follows}`);
}
