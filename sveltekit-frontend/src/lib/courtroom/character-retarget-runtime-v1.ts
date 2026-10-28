/**
 * Per-character runtime that plays motion clips on a skinned humanoid by retargeting rotation tracks read
 * straight from the clip GLB (see glb-clip-sampler-v1.ts), instead of Babylon's by-name animation import,
 * which cannot bind clips whose skeleton names differ from the character's (for example `mixamorig:*` clips on a
 * `J_Bip_*` VRM character). Renderer-independent: `frame()` returns local rotations by bone name; the scene
 * writes them onto the character's transform nodes.
 */
import { aliceBoneForAnyClipNode } from './bone-retarget-v1.js';
import { parseGlb, sampleClip, toRig, type ParsedGlb } from './glb-clip-sampler-v1.js';
import { retargetPose, type Quat, type Rig } from './rest-pose-retarget-v1.js';

type Fetcher = (url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;

interface LoadedClip {
	parsed: ParsedGlb;
	srcRig: Rig;
	map: Record<string, string>;
	duration: number;
}

const HUMANOID_ROOT = 'J_Bip_C_Hips';

export class RetargetRuntime {
	private tgtRig: Rig | null = null;
	private clips = new Map<string, LoadedClip>();
	private active: { key: string; startMs: number; loop: boolean } | null = null;

	constructor(private readonly fetcher: Fetcher = (u) => fetch(u)) {}

	/** Parse the character GLB. Returns false (runtime unusable) when it has no `J_Bip_*` humanoid skeleton. */
	async init(characterUrl: string): Promise<boolean> {
		const res = await this.fetcher(characterUrl);
		if (!res.ok) return false;
		const rig = toRig(parseGlb(new Uint8Array(await res.arrayBuffer())));
		if (!rig.some((b) => b.name === HUMANOID_ROOT)) return false;
		this.tgtRig = rig;
		return true;
	}

	get ready(): boolean {
		return this.tgtRig !== null;
	}

	has(key: string): boolean {
		return this.clips.has(key);
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
		this.clips.set(key, { parsed: Object.assign(parsed, { _anim: animationIndex }), srcRig, map, duration: parsed.animations[animationIndex].duration });
		return { mapped };
	}

	play(key: string, nowMs: number, loop = true): boolean {
		if (!this.clips.has(key)) return false;
		this.active = { key, startMs: nowMs, loop };
		return true;
	}

	stop(): void {
		this.active = null;
	}

	get activeKey(): string | null {
		return this.active?.key ?? null;
	}

	/** Local rotations (by character bone name) for the active clip at `nowMs`, or null when nothing is playing. */
	frame(nowMs: number): Record<string, Quat> | null {
		if (!this.active || !this.tgtRig) return null;
		const clip = this.clips.get(this.active.key)!;
		const anim = (clip.parsed as ParsedGlb & { _anim?: number })._anim ?? 0;
		let t = Math.max(0, (nowMs - this.active.startMs) / 1000);
		if (clip.duration > 0) t = this.active.loop ? t % clip.duration : Math.min(t, clip.duration);
		const srcLocal: Record<string, Quat> = {};
		sampleClip(clip.parsed, anim, t).forEach((q, node) => { srcLocal[clip.parsed.bones[node].name] = q; });
		return retargetPose(clip.srcRig, this.tgtRig, clip.map, srcLocal);
	}
}
