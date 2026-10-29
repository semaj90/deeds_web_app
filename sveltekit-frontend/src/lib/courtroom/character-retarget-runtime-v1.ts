/**
 * Per-character runtime that plays motion clips on a skinned humanoid by retargeting rotation tracks read
 * straight from the clip GLB (see glb-clip-sampler-v1.ts), instead of Babylon's by-name animation import,
 * which cannot bind clips whose skeleton names differ from the character's (for example `mixamorig:*` clips on a
 * `J_Bip_*` VRM character). Renderer-independent: `frame()` returns local rotations by bone name; the scene
 * writes them onto the character's transform nodes.
 */
import { aliceBoneForAnyClipNode } from './bone-retarget-v1.js';
import { parseGlb, sampleClip, toRig, type ParsedGlb } from './glb-clip-sampler-v1.js';
import { makeIdlePose, type IdlePose } from './idle-pose-v1.js';
import { EMOTION_POSE_KEYS, EMOTION_POSE_SECONDS, emotionOverlay } from './emotion-pose-v1.js';
import { retargetPose, type Quat, type Rig } from './rest-pose-retarget-v1.js';

type Fetcher = (url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;

interface LoadedClip {
	parsed: ParsedGlb;
	srcRig: Rig;
	map: Record<string, string>;
	duration: number;
	animIndex: number;
}

const HUMANOID_ROOT = 'J_Bip_C_Hips';

export class RetargetRuntime {
	private tgtRig: Rig | null = null;
	private clips = new Map<string, LoadedClip>();
	/** Procedural clips (no GLB), e.g. the breathing idle; keyed like `clips`. */
	private procedural = new Map<string, IdlePose>();
	private active: { key: string; startMs: number; loop: boolean } | null = null;

	constructor(private readonly fetcher: Fetcher = (u) => fetch(u)) {}

	/** Parse the character GLB. Returns false (runtime unusable) when it has no `J_Bip_*` humanoid skeleton. */
	async init(characterUrl: string): Promise<boolean> {
		const res = await this.fetcher(characterUrl);
		if (!res.ok) return false;
		const parsed = parseGlb(new Uint8Array(await res.arrayBuffer()));
		const rig = toRig(parsed);
		if (!rig.some((b) => b.name === HUMANOID_ROOT)) return false;
		this.tgtRig = rig;
		// No idle clip ships with the project: stand with lowered arms and breathe instead of holding the bind T-pose.
		const idle = makeIdlePose(rig, parsed.bones);
		if (idle) {
			this.procedural.set('idle', idle);
			// Emotions are the same idle plus a short overlay: no clip files (see courtroom-move-set-v1).
			for (const key of EMOTION_POSE_KEYS) {
				const pose = makeIdlePose(rig, parsed.bones, { overlay: emotionOverlay(key), durationSeconds: EMOTION_POSE_SECONDS[key] });
				if (pose) this.procedural.set(key, pose);
			}
		}
		return true;
	}

	get ready(): boolean {
		return this.tgtRig !== null;
	}

	has(key: string): boolean {
		return this.clips.has(key) || this.procedural.has(key);
	}

	/** Load a clip under `key`; throws when almost nothing maps (a clip from an unknown skeleton family). */
	async addClip(key: string, url: string, animationIndex = 0): Promise<{ mapped: number }> {
		if (!this.tgtRig) throw new Error('RetargetRuntime not initialised');
		const res = await this.fetcher(url);
		if (!res.ok) throw new Error(`clip fetch failed: ${url}`);
		const parsed = parseGlb(new Uint8Array(await res.arrayBuffer()));
		if (!parsed.animations[animationIndex]) throw new Error(`clip has no animation ${animationIndex}`);
		const srcRig = toRig(parsed);
		const targets = new Set(this.tgtRig.map((b) => b.name));
		const map: Record<string, string> = {};
		for (const bone of srcRig) {
			const t = aliceBoneForAnyClipNode(bone.name);
			if (t && targets.has(t)) map[bone.name] = t;
		}
		const mapped = Object.keys(map).length;
		if (mapped < 10) throw new Error(`clip ${key}: only ${mapped} bones map to the character skeleton`);
		this.clips.set(key, { parsed, srcRig, map, duration: parsed.animations[animationIndex].duration, animIndex: animationIndex });
		return { mapped };
	}

	play(key: string, nowMs: number, loop = true): boolean {
		if (!this.has(key)) return false;
		this.active = { key, startMs: nowMs, loop };
		return true;
	}

	stop(): void {
		this.active = null;
	}

	/** Clip length in seconds, or null when the clip is not loaded. */
	durationOf(key: string): number | null {
		return this.clips.get(key)?.duration ?? this.procedural.get(key)?.durationSeconds ?? null;
	}

	/** True once a non-looping active clip has played to its end (the pose then holds on the last frame). */
	isFinished(nowMs: number): boolean {
		if (!this.active) return false;
		const proc = this.clips.has(this.active.key) ? null : this.procedural.get(this.active.key);
		if (proc) return proc.durationSeconds !== null && (nowMs - this.active.startMs) / 1000 >= proc.durationSeconds;
		if (this.active.loop) return false;
		const clip = this.clips.get(this.active.key);
		return !!clip && clip.duration > 0 && (nowMs - this.active.startMs) / 1000 >= clip.duration;
	}

	get activeKey(): string | null {
		return this.active?.key ?? null;
	}

	/** Local rotations (by character bone name) for the active clip at `nowMs`, or null when nothing is playing. */
	frame(nowMs: number): Record<string, Quat> | null {
		if (!this.active || !this.tgtRig) return null;
		const proc = this.procedural.get(this.active.key);
		if (proc && !this.clips.has(this.active.key)) return proc.at(Math.max(0, (nowMs - this.active.startMs) / 1000));
		const clip = this.clips.get(this.active.key)!;
		const anim = clip.animIndex;
		let t = Math.max(0, (nowMs - this.active.startMs) / 1000);
		if (clip.duration > 0) t = this.active.loop ? t % clip.duration : Math.min(t, clip.duration);
		const srcLocal: Record<string, Quat> = {};
		sampleClip(clip.parsed, anim, t).forEach((q, node) => { srcLocal[clip.parsed.bones[node].name] = q; });
		return retargetPose(clip.srcRig, this.tgtRig, clip.map, srcLocal);
	}
}
