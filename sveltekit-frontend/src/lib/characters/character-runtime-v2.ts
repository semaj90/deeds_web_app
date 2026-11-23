/**
 * Parent Atlas Character Creator v2 — Reconciled Three.js Runtime, Scoped Motion Cache,
 * Source-Clock Cue Mapper, and Undoable Material/UV Preview Adapter.
 *
 * Designed as an adapter for existing `createSceneRuntimeThreeV1` and `SceneControllerV1`:
 * - Never creates a second WebGLRenderer, requestAnimationFrame loop, or competing case store.
 * - Template and motion caches are partitioned by scope + authorizationScopeId + caseId + revision + rig + sha256.
 * - Every acquire (including cache hits) revalidates authorization first.
 * - LOD switches preserve actor ID, userData, world transform, active clip, mixer playhead time, and selection.
 * - Source-clock scrubbing drives mixer.setTime(t) deterministically via cueClipSeconds without double-advancing.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { SceneCommand, SceneExecutionContext } from '$lib/scene/scene-controller-v1.js';
import {
	CHARACTER_PART_SOCKETS_V1,
	mountModularPartToSocketV1,
	type CharacterPartSocketIdV1
} from './character-behavior-haircard-v1.js';

export type TextureTier = 'retro' | 'balanced' | 'detailed';
export type AssetBlob = {
	object_key: string;
	sha256: string;
	encoded_bytes: number;
	triangles: number;
};
export type TexturePage = {
	page_id: string;
	taxonomy_id: string;
	object_key: string;
	sha256: string;
	storage_format: 'RGBA8_PNG' | 'R8_INDEXED' | 'KTX2';
	width: number;
	height: number;
	mip_levels: number;
	encoded_bytes: number;
	estimated_gpu_bytes: number;
	scope: 'public-procedural' | 'case-private' | string;
	repeatSafe?: boolean;
};

export interface CharacterCatalog {
	schema_version: 1;
	asset_id: string;
	revision_id: string;
	revision_hash: string;
	name: string;
	source_kind: 'generated-synthetic' | 'authentic-source' | 'derived-from-evidence';
	review_status: string;
	rig_signature?: string;
	lods: Record<TextureTier, AssetBlob>;
	texture_pages: TexturePage[];
	motion_clips: Array<{
		name: string;
		duration_seconds: number;
		event_id: string | null;
		source_clock: unknown;
	}>;
}

export interface CharacterAuthorizationContext {
	scopeKind: 'public-procedural' | 'case-private';
	authorizationScopeId?: string;
	caseId?: string;
	sceneRevision?: number;
}

export interface ResourceSnapshot {
	limitBytes: number;
	residentBytes: number;
	items: number;
	referencedItems: number;
	hits: number;
	misses: number;
	evictions: number;
}

type CacheItem<T> = {
	value: T;
	bytes: number;
	refs: number;
	access: number;
	dispose: (v: T) => void;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/i;

export class ResourceCache<T> {
	private items = new Map<string, CacheItem<T>>();
	private clock = 0;
	private hits = 0;
	private misses = 0;
	private evictions = 0;
	readonly limitBytes: number;

	constructor(limitBytes: number) {
		this.limitBytes = limitBytes;
		if (!Number.isFinite(limitBytes) || limitBytes < 1) {
			throw new Error('limitBytes must be positive');
		}
	}

	has(key: string): boolean {
		return this.items.has(key);
	}

	retain(key: string): T | undefined {
		const item = this.items.get(key);
		if (!item) {
			this.misses++;
			return undefined;
		}
		item.refs++;
		item.access = ++this.clock;
		this.hits++;
		return item.value;
	}

	insert(key: string, value: T, bytes: number, dispose: (v: T) => void): void {
		if (!key || this.items.has(key)) throw new Error('duplicate cache key');
		if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('invalid byte estimate');
		this.items.set(key, { value, bytes, refs: 1, access: ++this.clock, dispose });
		this.trim();
	}

	release(key: string): void {
		const item = this.items.get(key);
		if (!item || item.refs < 1) throw new Error('release without ownership');
		item.refs--;
		item.access = ++this.clock;
		this.trim();
	}

	trim(): void {
		while (this.residentBytes > this.limitBytes) {
			const candidates = [...this.items.entries()].filter(([, v]) => v.refs === 0);
			if (candidates.length === 0) break;
			const [key, item] = candidates.reduce((a, b) => (a[1].access <= b[1].access ? a : b));
			this.items.delete(key);
			item.dispose(item.value);
			this.evictions++;
		}
	}

	evictUnreferenced(): void {
		for (const [key, item] of this.items) {
			if (item.refs !== 0) continue;
			this.items.delete(key);
			item.dispose(item.value);
			this.evictions++;
		}
	}

	/** Evict entries matching a scope predicate (e.g. case-private entries on case/session switch). */
	invalidateWhere(predicate: (key: string) => boolean): number {
		let removed = 0;
		for (const [key, item] of [...this.items.entries()]) {
			if (!predicate(key)) continue;
			this.items.delete(key);
			item.dispose(item.value);
			this.evictions++;
			removed++;
		}
		return removed;
	}

	get residentBytes(): number {
		let bytes = 0;
		for (const item of this.items.values()) bytes += item.bytes;
		return bytes;
	}

	snapshot(): ResourceSnapshot {
		return {
			limitBytes: this.limitBytes,
			residentBytes: this.residentBytes,
			items: this.items.size,
			referencedItems: [...this.items.values()].filter((x) => x.refs > 0).length,
			hits: this.hits,
			misses: this.misses,
			evictions: this.evictions
		};
	}
}

export class SceneGeneration {
	private epoch = 0;
	private controller = new AbortController();

	begin(): { generation: number; signal: AbortSignal } {
		this.controller.abort();
		this.controller = new AbortController();
		return { generation: ++this.epoch, signal: this.controller.signal };
	}

	isCurrent(generation: number): boolean {
		return generation === this.epoch && !this.controller.signal.aborted;
	}

	cancel(): void {
		this.controller.abort();
		this.epoch++;
	}
}

/**
 * P0 Fix: Never key character templates by SHA-256 alone.
 * Private or evidence-derived character templates require authorizationScopeId, caseId, and revision_hash.
 */
export function characterTemplateCacheKey(
	catalog: Pick<CharacterCatalog, 'source_kind' | 'revision_hash' | 'lods'>,
	tier: TextureTier,
	context: CharacterAuthorizationContext = { scopeKind: 'public-procedural' }
): string {
	const info = catalog.lods[tier];
	if (!info || !SHA256_RE.test(info.sha256)) {
		throw new Error('invalid character LOD sha256');
	}
	if (!SHA256_RE.test(catalog.revision_hash)) {
		throw new Error('invalid character revision_hash');
	}
	const isPrivate =
		context.scopeKind === 'case-private' || catalog.source_kind !== 'generated-synthetic';
	if (isPrivate) {
		if (!context.caseId || !UUID_RE.test(context.caseId)) {
			throw new Error('private character template requires a valid UUID caseId');
		}
		const authScope = (context.authorizationScopeId ?? 'session').trim();
		if (!authScope) {
			throw new Error('private character template requires authorizationScopeId');
		}
		const rev = context.sceneRevision ?? 1;
		return `case-private:${authScope}:${context.caseId.toLowerCase()}:r${rev}:${catalog.revision_hash.toLowerCase()}:${tier}:${info.sha256.toLowerCase()}`;
	}
	return `public-procedural:public:${catalog.revision_hash.toLowerCase()}:${tier}:${info.sha256.toLowerCase()}`;
}

export function pageResidencyKey(
	page: Pick<TexturePage, 'sha256' | 'storage_format' | 'scope'>,
	caseId?: string,
	authorizationScopeId = 'session'
): string {
	if (!SHA256_RE.test(page.sha256)) throw new Error('invalid content hash');
	if (page.scope === 'public-procedural') {
		return `public:${page.storage_format}:${page.sha256.toLowerCase()}`;
	}
	if (page.scope === 'case-private' && UUID_RE.test(caseId ?? '')) {
		return `case:${authorizationScopeId}:${caseId!.toLowerCase()}:${page.storage_format}:${page.sha256.toLowerCase()}`;
	}
	throw new Error('private texture requires an authorized case context');
}

export type MotionScope =
	| { scopeKind: 'public-procedural' }
	| { scopeKind: 'case-private'; caseId: string; authorizationScopeId?: string };

export interface MotionDescriptor {
	clipId: string;
	name: string;
	rigSignature: string;
	sha256: string;
	objectKey: string;
	encodedBytes: number;
	durationSeconds: number;
	taxonomyId: string;
	scope: MotionScope;
	format: 'glb-node-animation' | 'glb-skin-animation';
}

export interface SourceCue {
	eventId: string;
	sourceId: string;
	sourceRevisionHash: string;
	sourceStartMs: number;
	sourceEndMs: number;
	clipStartSeconds: number;
	speed: number;
	loop: boolean;
}

export function motionCacheKey(m: MotionDescriptor): string {
	if (!SHA256_RE.test(m.sha256)) throw new Error('invalid hash');
	if (!SHA256_RE.test(m.rigSignature)) throw new Error('invalid rig signature');
	if (m.scope.scopeKind === 'case-private') {
		if (!m.scope.caseId || !UUID_RE.test(m.scope.caseId)) {
			throw new Error('private clip missing valid UUID caseId');
		}
		const authScope = (m.scope.authorizationScopeId ?? 'session').trim() || 'session';
		return `case-private:${authScope}:${m.scope.caseId.toLowerCase()}:${m.rigSignature.toLowerCase()}:${m.sha256.toLowerCase()}:${m.format}`;
	}
	return `public-procedural:public:${m.rigSignature.toLowerCase()}:${m.sha256.toLowerCase()}:${m.format}`;
}

export function assertCompatibleMotion(m: MotionDescriptor, targetRigSignature: string): void {
	if (m.rigSignature.toLowerCase() !== targetRigSignature.toLowerCase()) {
		throw new Error('rig mismatch: explicit retargeting required');
	}
}

export function cueClipSeconds(
	sourceTimeMs: number,
	cue: SourceCue,
	durationSeconds: number
): number | null {
	if (
		!Number.isFinite(sourceTimeMs) ||
		!Number.isFinite(durationSeconds) ||
		durationSeconds <= 0 ||
		!Number.isSafeInteger(cue.sourceStartMs) ||
		!Number.isSafeInteger(cue.sourceEndMs) ||
		cue.sourceEndMs <= cue.sourceStartMs ||
		cue.sourceStartMs < 0 ||
		!Number.isFinite(cue.speed) ||
		cue.speed <= 0 ||
		!Number.isFinite(cue.clipStartSeconds) ||
		cue.clipStartSeconds < 0
	) {
		throw new Error('invalid source clock or clip');
	}
	// Half-open [sourceStartMs, sourceEndMs) to match isSceneEventActiveV1
	if (sourceTimeMs < cue.sourceStartMs || sourceTimeMs >= cue.sourceEndMs) return null;
	const position = cue.clipStartSeconds + ((sourceTimeMs - cue.sourceStartMs) / 1000) * cue.speed;
	if (cue.loop) return ((position % durationSeconds) + durationSeconds) % durationSeconds;
	return Math.max(0, Math.min(durationSeconds, position));
}

export function selectHotset(
	clips: MotionDescriptor[],
	counts: Readonly<Record<string, number>>,
	rig: string,
	budgetBytes: number
): MotionDescriptor[] {
	if (!Number.isSafeInteger(budgetBytes) || budgetBytes < 0) throw new Error('invalid budget');
	const candidates = clips.filter(
		(c) =>
			c.scope.scopeKind === 'public-procedural' &&
			c.rigSignature.toLowerCase() === rig.toLowerCase() &&
			c.encodedBytes > 0 &&
			Number.isSafeInteger(c.encodedBytes)
	);
	const sorted = [...candidates].sort((a, b) => {
		const aScore = Math.max(0, counts[a.clipId] ?? 0) / a.encodedBytes;
		const bScore = Math.max(0, counts[b.clipId] ?? 0) / b.encodedBytes;
		return bScore - aScore || a.sha256.localeCompare(b.sha256);
	});
	const selected: MotionDescriptor[] = [];
	let used = 0;
	for (const c of sorted) {
		if (used + c.encodedBytes <= budgetBytes) {
			selected.push(c);
			used += c.encodedBytes;
		}
	}
	return selected;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

/**
 * P0 Fix: MotionCacheThree revalidates authorization via resolveAuthorizedUrl on EVERY acquire,
 * including resident cache hits, and supports invalidateCaseScope() when switching cases/sessions.
 */
export class MotionCacheThree {
	private loader = new GLTFLoader();
	readonly cache: ResourceCache<THREE.AnimationClip>;
	private readonly inflight = new Map<string, Promise<THREE.AnimationClip>>();

	constructor(
		private readonly resolveAuthorizedUrl: (clip: MotionDescriptor) => Promise<string>,
		maxDecodedBytes = 512 * 1024,
		private readonly fetcher: typeof fetch = fetch
	) {
		this.cache = new ResourceCache(maxDecodedBytes);
	}

	async acquire(
		clip: MotionDescriptor,
		targetRigSignature: string,
		signal?: AbortSignal
	): Promise<{ key: string; clip: THREE.AnimationClip }> {
		assertCompatibleMotion(clip, targetRigSignature);
		const key = motionCacheKey(clip);
		if (signal?.aborted) throw new Error('motion load cancelled');
		if (
			!Number.isSafeInteger(clip.encodedBytes) ||
			clip.encodedBytes <= 0 ||
			clip.encodedBytes > 4 * 1024 * 1024
		) {
			throw new Error('invalid motion encoded-byte bound');
		}
		// Mandatory per-acquire authorization check BEFORE checking resident cache
		const url = await this.resolveAuthorizedUrl(clip);
		if (signal?.aborted) throw new Error('motion load cancelled');
		const present = this.cache.retain(key);
		if (present) return { key, clip: present };

		let pending = this.inflight.get(key);
		if (!pending) {
			pending = (async () => {
				const response = await this.fetcher(url, {
					signal,
					cache: 'no-store',
					credentials: 'same-origin'
				});
				if (!response.ok) throw new Error(`motion HTTP ${response.status}`);
				const bytes = await response.arrayBuffer();
				if (bytes.byteLength !== clip.encodedBytes) {
					throw new Error('motion content-length mismatch');
				}
				const computed = await sha256Hex(bytes);
				if (computed !== clip.sha256.toLowerCase()) {
					throw new Error('motion SHA-256 mismatch');
				}
				const parsed = await new Promise<{ animations: THREE.AnimationClip[] }>(
					(resolve, reject) =>
						this.loader.parse(bytes, '', (gltf) => resolve(gltf), reject)
				);
				const animation = parsed.animations.find((a) => a.name === clip.name);
				if (
					!animation ||
					parsed.animations.length !== 1 ||
					animation.tracks.length > 128 ||
					animation.duration > 180
				) {
					throw new Error('unsupported motion clip');
				}
				return animation;
			})().finally(() => {
				this.inflight.delete(key);
			});
			this.inflight.set(key, pending);
		}

		const animation = await pending;
		if (signal?.aborted) throw new Error('motion load cancelled');
		const already = this.cache.retain(key);
		if (already) return { key, clip: already };

		const estimatedDecodedBytes = animation.tracks.reduce(
			(sum, track) => sum + track.times.byteLength + track.values.byteLength + 64,
			256
		);
		this.cache.insert(key, animation, estimatedDecodedBytes, () => {});
		return { key, clip: animation };
	}

	release(key: string): void {
		this.cache.release(key);
	}

	invalidateCaseScope(caseId?: string): number {
		if (caseId) {
			const needle = `:${caseId.toLowerCase()}:`;
			return this.cache.invalidateWhere((k) => k.startsWith('case-private:') && k.includes(needle));
		}
		return this.cache.invalidateWhere((k) => k.startsWith('case-private:'));
	}

	trim(): void {
		this.cache.evictUnreferenced();
	}

	stats(): ResourceSnapshot {
		return this.cache.snapshot();
	}
}

type CharacterTemplate = { root: THREE.Group; animations: THREE.AnimationClip[] };
type ActiveCharacterInstance = {
	root: THREE.Group;
	mixer: THREE.AnimationMixer;
	templateKey: string;
	tier: TextureTier;
	rigSignature: string;
};

function destroyCharacterTemplate(t: CharacterTemplate): void {
	const meshes = new Set<THREE.BufferGeometry>();
	const materials = new Set<THREE.Material>();
	const textures = new Set<THREE.Texture>();
	t.root.traverse((o) => {
		if (!(o instanceof THREE.Mesh)) return;
		meshes.add(o.geometry);
		const mats = Array.isArray(o.material) ? o.material : [o.material];
		for (const m of mats) {
			materials.add(m);
			const rec = m as unknown as Record<string, unknown>;
			for (const value of Object.values(rec)) {
				if (value instanceof THREE.Texture) textures.add(value);
			}
		}
	});
	for (const geo of meshes) geo.dispose();
	for (const mat of materials) mat.dispose();
	for (const tex of textures) tex.dispose();
}

export const defaultCharacterTemplateCache = new ResourceCache<CharacterTemplate>(8 * 1024 * 1024);

/**
 * P0 Fix: ThreeCharacterRuntime
 * 1. Attaches to an existing scene or actor anchor Group without replacing the actor's identity.
 * 2. Preserves actor ID, userData, world transform (position, quaternion, scale), active clip name,
 *    playhead time, and selection across LOD transitions (retro <-> balanced <-> detailed).
 * 3. Revalidates authorization on every load() before retaining from cache.
 * 4. Consumes MotionCacheThree for external shared AnimationClips, releasing borrowed clips on teardown.
 * 5. Supports deterministic source-clock seeking via seekClip(name, seconds) with mixer.setTime(seconds).
 */
export class ThreeCharacterRuntime {
	private active?: ActiveCharacterInstance;
	private generation = new SceneGeneration();
	private loader = new GLTFLoader();
	private activeClipName: string | null = null;
	private playheadSeconds = 0;
	private preservedTransform: {
		name: string;
		position: THREE.Vector3;
		quaternion: THREE.Quaternion;
		scale: THREE.Vector3;
		visible: boolean;
		userData: Record<string, unknown>;
	} | null = null;
	private readonly borrowedClips = new Map<string, { key: string; clip: THREE.AnimationClip }>();

	constructor(
		private readonly container: THREE.Object3D,
		private readonly urlForKey: (
			objectKey: string,
			meta: { catalog: CharacterCatalog; tier: TextureTier; context: CharacterAuthorizationContext }
		) => Promise<string>,
		private readonly templates: ResourceCache<CharacterTemplate> = defaultCharacterTemplateCache,
		private readonly motionCache?: MotionCacheThree,
		private readonly fetcher: typeof fetch = fetch
	) {}

	async load(
		catalog: CharacterCatalog,
		tier: TextureTier,
		context: CharacterAuthorizationContext = { scopeKind: 'public-procedural' }
	): Promise<void> {
		const { generation, signal } = this.generation.begin();
		const info = catalog.lods[tier];
		if (!info) throw new Error(`unknown LOD tier: ${tier}`);
		const templateKey = characterTemplateCacheKey(catalog, tier, context);

		// Snapshot current actor state BEFORE awaiting so rapid LOD transitions never lose transform/playhead
		if (this.active) {
			this.preservedTransform = {
				name: this.active.root.name,
				position: this.active.root.position.clone(),
				quaternion: this.active.root.quaternion.clone(),
				scale: this.active.root.scale.clone(),
				visible: this.active.root.visible,
				userData: { ...this.active.root.userData }
			};
		}

		// P0 Fix: Always revalidate authorization via urlForKey BEFORE retaining from template cache
		const url = await this.urlForKey(info.object_key, { catalog, tier, context });
		if (signal.aborted || !this.generation.isCurrent(generation)) return;

		let template = this.templates.retain(templateKey);
		if (!template) {
			const res = await this.fetcher(url, { signal, cache: 'no-store' });
			if (!res.ok) throw new Error(`GLB fetch failed: ${res.status}`);
			const array = await res.arrayBuffer();
			if (signal.aborted || !this.generation.isCurrent(generation)) return;
			if (array.byteLength !== info.encoded_bytes) {
				throw new Error('GLB content-length mismatch');
			}
			if ((await sha256Hex(array)) !== info.sha256.toLowerCase()) {
				throw new Error('GLB hash mismatch');
			}
			if (!this.generation.isCurrent(generation)) return;
			const loaded = await new Promise<{
				scene: THREE.Group;
				animations: THREE.AnimationClip[];
			}>((resolve, reject) =>
				this.loader.parse(array, '', (gltf) => resolve(gltf), reject)
			);
			template = { root: loaded.scene, animations: loaded.animations };
			if (!this.generation.isCurrent(generation)) {
				destroyCharacterTemplate(template);
				return;
			}
			const existing = this.templates.retain(templateKey);
			if (existing) {
				destroyCharacterTemplate(template);
				template = existing;
			} else {
				this.templates.insert(
					templateKey,
					template,
					info.encoded_bytes,
					destroyCharacterTemplate
				);
			}
		}

		if (!this.generation.isCurrent(generation)) {
			this.templates.release(templateKey);
			return;
		}

		const priorState = this.active
			? {
					name: this.active.root.name,
					position: this.active.root.position.clone(),
					quaternion: this.active.root.quaternion.clone(),
					scale: this.active.root.scale.clone(),
					visible: this.active.root.visible,
					userData: { ...this.active.root.userData }
				}
			: this.preservedTransform;
		const desiredClipName = this.activeClipName;
		const desiredPlayhead = this.playheadSeconds;

		this.unloadInstanceOnly();
		const root = cloneSkinned(template.root) as THREE.Group;
		if (priorState) {
			if (priorState.name) root.name = priorState.name;
			root.position.copy(priorState.position);
			root.quaternion.copy(priorState.quaternion);
			root.scale.copy(priorState.scale);
			root.visible = priorState.visible;
			root.userData = { ...root.userData, ...priorState.userData, lodTier: tier };
		} else {
			root.userData = { ...root.userData, lodTier: tier };
		}
		root.updateMatrix();
		root.updateMatrixWorld(true);

		const mixer = new THREE.AnimationMixer(root);
		this.container.add(root);
		this.active = {
			root,
			mixer,
			templateKey,
			tier,
			rigSignature:
				catalog.rig_signature ??
				'0c5cb35fb70f563a2a6136723a1afc99511658235182bef1e7cf227c0d21d6d8'
		};

		const clipToRestore =
			desiredClipName ??
			(template.animations[0]?.name || this.borrowedClips.keys().next().value || null);
		if (clipToRestore) {
			this.play(clipToRestore);
			if (desiredPlayhead > 0) {
				this.seek(desiredPlayhead);
			}
		}
	}

	/** Acquire and register an external shared motion clip through MotionCacheThree. */
	async preloadMotion(descriptor: MotionDescriptor, signal?: AbortSignal): Promise<THREE.AnimationClip> {
		if (!this.motionCache) {
			throw new Error('MotionCacheThree not configured on ThreeCharacterRuntime');
		}
		const rigSig =
			this.active?.rigSignature ??
			'0c5cb35fb70f563a2a6136723a1afc99511658235182bef1e7cf227c0d21d6d8';
		const acquired = await this.motionCache.acquire(descriptor, rigSig, signal);
		const existing = this.borrowedClips.get(descriptor.name);
		if (existing) {
			this.motionCache.release(existing.key);
		}
		this.borrowedClips.set(descriptor.name, acquired);
		return acquired.clip;
	}

	get root(): THREE.Group | undefined {
		return this.active?.root;
	}

	get currentTier(): TextureTier | undefined {
		return this.active?.tier;
	}

	get currentClipName(): string | null {
		return this.activeClipName;
	}

	get currentPlayheadSeconds(): number {
		return this.playheadSeconds;
	}

	private resolveClip(name: string): THREE.AnimationClip | undefined {
		const borrowed = this.borrowedClips.get(name);
		if (borrowed) return borrowed.clip;
		if (!this.active) return undefined;
		const template = this.templates.retain(this.active.templateKey);
		if (!template) return undefined;
		const found = template.animations.find((a) => a.name === name);
		this.templates.release(this.active.templateKey);
		return found;
	}

	clips(): string[] {
		const names = new Set<string>(this.borrowedClips.keys());
		if (this.active) {
			const template = this.templates.retain(this.active.templateKey);
			if (template) {
				for (const clip of template.animations) names.add(clip.name);
				this.templates.release(this.active.templateKey);
			}
		}
		return [...names];
	}

	play(name: string): boolean {
		if (!this.active) {
			this.activeClipName = name;
			return false;
		}
		const clip = this.resolveClip(name);
		if (!clip) return false;
		this.active.mixer.stopAllAction();
		const action = this.active.mixer.clipAction(clip);
		action.reset().play();
		this.activeClipName = name;
		return true;
	}

	/**
	 * Deterministic source-clock seek: switches clip only if needed and sets exact mixer time
	 * via mixer.setTime(seconds). Never double-advances with mixer.update(dt).
	 */
	seekClip(name: string, seconds: number): boolean {
		if (!Number.isFinite(seconds) || seconds < 0) return false;
		if (!this.active) {
			this.activeClipName = name;
			this.playheadSeconds = seconds;
			return false;
		}
		if (this.activeClipName !== name) {
			if (!this.play(name)) return false;
		}
		this.playheadSeconds = seconds;
		this.active.mixer.setTime(seconds);
		this.active.root.updateMatrixWorld(true);
		return true;
	}

	seek(seconds: number): void {
		if (Number.isFinite(seconds) && seconds >= 0) {
			this.playheadSeconds = seconds;
			if (this.active) {
				this.active.mixer.setTime(seconds);
				this.active.root.updateMatrixWorld(true);
			}
		}
	}

	tick(deltaSeconds: number): void {
		if (this.active && Number.isFinite(deltaSeconds) && deltaSeconds >= 0) {
			this.playheadSeconds += deltaSeconds;
			this.active.mixer.update(deltaSeconds);
			this.active.root.updateMatrixWorld(true);
		}
	}

	private unloadInstanceOnly(): void {
		if (!this.active) return;
		this.active.mixer.stopAllAction();
		this.active.mixer.uncacheRoot(this.active.root);
		this.container.remove(this.active.root);
		this.templates.release(this.active.templateKey);
		this.active = undefined;
	}

	unload(): void {
		this.unloadInstanceOnly();
		if (this.motionCache) {
			for (const { key } of this.borrowedClips.values()) {
				this.motionCache.release(key);
			}
		}
		this.borrowedClips.clear();
	}

	dispose(): void {
		this.generation.cancel();
		this.unload();
		this.templates.evictUnreferenced();
	}

	stats(): ResourceSnapshot {
		return this.templates.snapshot();
	}

	/** Inspect GPU SkinnedMesh & Skeleton inventory on the active character root (MEM-06). */
	getSkinnedArmatureInventory(): SkinnedArmatureInventoryV2 {
		if (!this.active) {
			return { skinnedMeshCount: 0, boneCount: 0, boneNames: [], hasSevenBoneRig: false };
		}
		return inspectSkinnedArmatureV2(this.active.root);
	}

	/** Mount a modular part (eyes, hair cards, accessories) onto a named bone socket (MEM-06). */
	mountSocketPart(
		socketName: CharacterPartSocketIdV1,
		partObject: THREE.Object3D,
		options: { localOffset?: readonly [number, number, number] } = {}
	) {
		if (!this.active) {
			throw new Error('NO_ACTIVE_CHARACTER: Load a character rig before mounting socket parts');
		}
		return mountPartToSkinnedArmatureV2(this.active.root, socketName, partObject, options);
	}
}

export interface SkinnedArmatureInventoryV2 {
	readonly skinnedMeshCount: number;
	readonly boneCount: number;
	readonly boneNames: string[];
	readonly hasSevenBoneRig: boolean;
}

export function inspectSkinnedArmatureV2(root: THREE.Object3D): SkinnedArmatureInventoryV2 {
	let skinnedMeshCount = 0;
	const boneNames = new Set<string>();

	root.traverse((node) => {
		if ((node as THREE.SkinnedMesh).isSkinnedMesh) {
			skinnedMeshCount++;
			const skinned = node as THREE.SkinnedMesh;
			for (const bone of skinned.skeleton?.bones ?? []) {
				if (bone.name) boneNames.add(bone.name);
			}
		} else if ((node as THREE.Bone).isBone && node.name) {
			boneNames.add(node.name);
		}
	});

	const names = [...boneNames].sort();
	return {
		skinnedMeshCount,
		boneCount: names.length,
		boneNames: names,
		hasSevenBoneRig: skinnedMeshCount >= 1 && names.length >= 7
	};
}

export function mountPartToSkinnedArmatureV2(
	root: THREE.Object3D,
	socketName: CharacterPartSocketIdV1,
	partObject: THREE.Object3D,
	options: { localOffset?: readonly [number, number, number] } = {}
) {
	const socketSpec = CHARACTER_PART_SOCKETS_V1[socketName];
	if (!socketSpec) {
		throw new Error(`UNKNOWN_CHARACTER_SOCKET: ${String(socketName)}`);
	}
	const targetBone =
		root.getObjectByName(socketSpec.boneName) ??
		root.getObjectByName(socketSpec.boneName.toLowerCase()) ??
		root;
	const offset = options.localOffset ?? socketSpec.localOffset;
	partObject.position.set(offset[0], offset[1], offset[2]);
	targetBone.add(partObject);
	targetBone.updateMatrixWorld(true);

	const receipt = mountModularPartToSocketV1({
		socketId: socketName,
		partId: partObject.name || socketName
	});
	return {
		receipt,
		attachedParentName: targetBone.name || 'root'
	};
}

/** Focus-scoped material and UV shortcut vocabulary (no global window listeners). */
export type ShaderFamily = 'unlit' | 'lambert' | 'standard';
export type UVMode = 'existing' | 'box' | 'spherical';
export interface MaterialEditorState {
	swatchIndex: number;
	shader: ShaderFamily;
	uvMode: UVMode;
	tiling: number;
}
export type CreatorCommand =
	| { type: 'swatch'; index: number }
	| { type: 'shader-next' }
	| { type: 'tile'; multiplier: number }
	| { type: 'uv-next' }
	| { type: 'play-toggle' }
	| { type: 'keyframe'; direction: -1 | 1 }
	| { type: 'keyframe-insert' };
export type KeyDescriptor = {
	code: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
	repeat?: boolean;
	isComposing?: boolean;
};

export const CREATOR_SWATCHES = ['#c58e70', '#47849a', '#383f47', '#e5bf65', '#74a987'] as const;
export const DEFAULT_MATERIAL_EDITOR: MaterialEditorState = {
	swatchIndex: 0,
	shader: 'standard',
	uvMode: 'existing',
	tiling: 1
};

export function parseCreatorShortcut(e: KeyDescriptor): CreatorCommand | null {
	if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.isComposing) return null;
	if (e.code.startsWith('Digit') && !e.shiftKey) {
		const n = Number(e.code.slice(5));
		if (n >= 1 && n <= CREATOR_SWATCHES.length && Number.isInteger(n)) {
			return { type: 'swatch', index: n - 1 };
		}
	}
	if (e.shiftKey) return e.code === 'KeyK' ? { type: 'keyframe-insert' } : null;
	switch (e.code) {
		case 'KeyM':
			return { type: 'shader-next' };
		case 'BracketLeft':
			return { type: 'tile', multiplier: 0.5 };
		case 'BracketRight':
			return { type: 'tile', multiplier: 2 };
		case 'KeyU':
			return { type: 'uv-next' };
		case 'KeyK':
			return { type: 'play-toggle' };
		case 'KeyJ':
			return { type: 'keyframe', direction: -1 };
		case 'KeyL':
			return { type: 'keyframe', direction: 1 };
		default:
			return null;
	}
}

export function nextMaterial(state: MaterialEditorState, cmd: CreatorCommand): MaterialEditorState {
	if (cmd.type === 'swatch') {
		if (cmd.index < 0 || cmd.index >= CREATOR_SWATCHES.length) throw new Error('bad swatch');
		return { ...state, swatchIndex: cmd.index };
	}
	if (cmd.type === 'shader-next') {
		const shaders: ShaderFamily[] = ['unlit', 'lambert', 'standard'];
		return { ...state, shader: shaders[(shaders.indexOf(state.shader) + 1) % shaders.length]! };
	}
	if (cmd.type === 'tile') {
		return { ...state, tiling: Math.min(8, Math.max(0.25, state.tiling * cmd.multiplier)) };
	}
	if (cmd.type === 'uv-next') {
		const modes: UVMode[] = ['existing', 'box', 'spherical'];
		return { ...state, uvMode: modes[(modes.indexOf(state.uvMode) + 1) % modes.length]! };
	}
	return state;
}

export function isEditorShortcutTarget(tagName: string, editable = false): boolean {
	return !editable && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tagName.toUpperCase());
}

type SavedMeshResources = { geometry: THREE.BufferGeometry; material: THREE.Material };

/**
 * P1 Fix: MaterialPreviewThree integrates with existing scene resource ownership
 * and SceneControllerV1 CommandHistory undo/redo.
 * Never mutates shared texture wrapping/repeat state.
 */
export class MaterialPreviewThree {
	private readonly originals = new Map<THREE.Mesh, SavedMeshResources>();
	private readonly previews = new Map<THREE.Mesh, SavedMeshResources>();
	private readonly states = new Map<THREE.Mesh, MaterialEditorState>();

	getState(mesh: THREE.Mesh): MaterialEditorState {
		return { ...(this.states.get(mesh) ?? DEFAULT_MATERIAL_EDITOR) };
	}

	apply(
		mesh: THREE.Mesh,
		state: MaterialEditorState,
		opts: { isAtlasPage?: boolean } = {}
	): void {
		const original = this.originals.get(mesh) ?? this.saveOriginal(mesh);
		if ((state.tiling !== 1 || state.uvMode !== 'existing') && opts.isAtlasPage) {
			throw new Error(
				'Atlas subrect projection/tiling requires a page-aware shader; preview denied'
			);
		}
		if (!Number.isFinite(state.tiling) || state.tiling < 0.25 || state.tiling > 8) {
			throw new Error('invalid tile scale');
		}
		if (state.swatchIndex < 0 || state.swatchIndex >= CREATOR_SWATCHES.length) {
			throw new Error('invalid swatch');
		}
		const base = original.material as THREE.MeshStandardMaterial;
		const page = base.map ?? null;
		if (
			state.tiling !== 1 &&
			page &&
			(page.wrapS !== THREE.RepeatWrapping || page.wrapT !== THREE.RepeatWrapping)
		) {
			throw new Error(
				'Texture owner must provide standalone repeat-safe page; shared map wrapping cannot be mutated'
			);
		}
		const args = {
			color: new THREE.Color(CREATOR_SWATCHES[state.swatchIndex]),
			map: page,
			transparent: base.transparent,
			opacity: base.opacity,
			side: base.side,
			alphaTest: base.alphaTest
		};
		const material =
			state.shader === 'unlit'
				? new THREE.MeshBasicMaterial(args)
				: state.shader === 'lambert'
					? new THREE.MeshLambertMaterial(args)
					: new THREE.MeshStandardMaterial({ ...args, metalness: 0, roughness: 0.9 });
		let geometry = original.geometry;
		if (state.tiling !== 1 || state.uvMode !== 'existing') {
			geometry = original.geometry.clone();
			const position = geometry.getAttribute('position');
			const normals = geometry.getAttribute('normal');
			if (!position) {
				material.dispose();
				geometry.dispose();
				throw new Error('mesh has no positions');
			}
			let uv = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
			if (!uv && state.uvMode === 'existing') {
				material.dispose();
				geometry.dispose();
				throw new Error('mesh has no authored UVs');
			}
			if (!uv) {
				uv = new THREE.BufferAttribute(new Float32Array(position.count * 2), 2);
				geometry.setAttribute('uv', uv);
			}
			geometry.computeBoundingBox();
			const bb = geometry.boundingBox!;
			const center = bb.getCenter(new THREE.Vector3());
			const extent = bb.getSize(new THREE.Vector3());
			for (let i = 0; i < position.count; i++) {
				let u = uv.getX(i),
					v = uv.getY(i);
				const x = position.getX(i),
					y = position.getY(i),
					z = position.getZ(i);
				if (state.uvMode === 'spherical') {
					const dx = x - center.x,
						dy = y - center.y,
						dz = z - center.z;
					const radius = Math.hypot(dx, dy, dz) || 1;
					u = 0.5 + Math.atan2(dz, dx) / (2 * Math.PI);
					v = Math.acos(Math.max(-1, Math.min(1, dy / radius))) / Math.PI;
				} else if (state.uvMode === 'box') {
					if (!normals) {
						material.dispose();
						geometry.dispose();
						throw new Error('box projection requires normals');
					}
					const nx = Math.abs(normals.getX(i)),
						ny = Math.abs(normals.getY(i)),
						nz = Math.abs(normals.getZ(i));
					if (nx >= ny && nx >= nz) {
						u = (z - bb.min.z) / (extent.z || 1);
						v = (y - bb.min.y) / (extent.y || 1);
					} else if (ny >= nx && ny >= nz) {
						u = (x - bb.min.x) / (extent.x || 1);
						v = (z - bb.min.z) / (extent.z || 1);
					} else {
						u = (x - bb.min.x) / (extent.x || 1);
						v = (y - bb.min.y) / (extent.y || 1);
					}
				}
				uv.setXY(i, u * state.tiling, v * state.tiling);
			}
			uv.needsUpdate = true;
		}
		const existing = this.previews.get(mesh);
		mesh.material = material;
		mesh.geometry = geometry;
		if (existing) this.disposePreview(existing, original);
		this.previews.set(mesh, { geometry, material });
		this.states.set(mesh, { ...state });
	}

	reset(mesh: THREE.Mesh): void {
		const original = this.originals.get(mesh);
		const preview = this.previews.get(mesh);
		if (!original) return;
		mesh.material = original.material;
		mesh.geometry = original.geometry;
		if (preview) this.disposePreview(preview, original);
		this.previews.delete(mesh);
		this.originals.delete(mesh);
		this.states.delete(mesh);
	}

	dispose(): void {
		for (const mesh of [...this.originals.keys()]) this.reset(mesh);
	}

	private saveOriginal(mesh: THREE.Mesh): SavedMeshResources {
		if (Array.isArray(mesh.material)) {
			throw new Error('multi-material preview requires mesh-slot selection');
		}
		const saved = { geometry: mesh.geometry, material: mesh.material };
		this.originals.set(mesh, saved);
		return saved;
	}

	private disposePreview(preview: SavedMeshResources, original: SavedMeshResources): void {
		preview.material.dispose(); // never dispose the shared texture
		if (preview.geometry !== original.geometry) preview.geometry.dispose();
	}
}

/**
 * SceneCommand implementation that connects MaterialPreviewThree edits directly
 * into the existing SceneControllerV1 CommandHistory undo/redo stack.
 */
export class ApplyMaterialPreviewCommand implements SceneCommand {
	readonly id: string;
	readonly type = 'material_preview_edit';
	readonly timestampMs: number;

	constructor(
		readonly objectId: string,
		readonly mesh: THREE.Mesh,
		readonly preview: MaterialPreviewThree,
		readonly previousState: MaterialEditorState,
		readonly nextState: MaterialEditorState,
		readonly opts: { isAtlasPage?: boolean } = {},
		private readonly onStateChange?: (state: MaterialEditorState) => void
	) {
		this.id = `cmd-mat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		this.timestampMs = Date.now();
	}

	execute(_context: SceneExecutionContext): void {
		this.preview.apply(this.mesh, this.nextState, this.opts);
		this.onStateChange?.({ ...this.nextState });
	}

	undo(_context: SceneExecutionContext): void {
		this.preview.apply(this.mesh, this.previousState, this.opts);
		this.onStateChange?.({ ...this.previousState });
	}

	toSerializable(): Record<string, unknown> {
		return {
			id: this.id,
			type: this.type,
			timestampMs: this.timestampMs,
			objectId: this.objectId,
			previousState: this.previousState,
			nextState: this.nextState
		};
	}
}
