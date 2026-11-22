import * as THREE from 'three';
import { createPrimitiveAvatar, type PrimitiveAvatar } from '$lib/characters/avatar-primitives-v1.js';
import {
	ThreeCharacterRuntime,
	MotionCacheThree,
	MaterialPreviewThree,
	ResourceCache,
	cueClipSeconds,
	defaultCharacterTemplateCache,
	type CharacterCatalog,
	type CharacterAuthorizationContext,
	type MotionDescriptor,
	type TextureTier,
	type MaterialEditorState
} from '$lib/characters/character-runtime-v2.js';
import { createSceneEnvironmentCellThreeV1, disposeSceneEnvironmentCellThreeV1, type SceneEnvironmentStyleV1 } from '$lib/splat/scene-environment-cell-three-v1.js';
import { createSceneCellResidencyV1, type SceneCellV1 } from '$lib/splat/scene-cell-residency-v1.js';
import { createIllustrativeRoomBlockoutV1, createScenePrimitiveMeshV1 } from '$lib/splat/scene-primitive-three-v1.js';
import { SCENE_PRIMITIVE_KINDS_V1, type ScenePrimitiveKindV1 } from '$lib/splat/scene-primitive-registry-v1.js';
import { evaluateSceneTimelineV1, type SceneEventActionV1, type SceneTimedEventV1, type SceneTimelineTargetV1 } from '$lib/splat/scene-event-visibility-v1.js';
import {
	evaluateDeterministicSceneStateV1,
	type EvaluatedTargetState,
	type SceneBaselineTargetState,
	type TimedSceneAction
} from '$lib/splat/scene-action-evaluator-v1.js';
import { SceneRuntimeRecipeV1Schema, type SceneRuntimeRecipeV1 } from './scene-runtime-recipe-v1.js';
import { createFourBedroomHouseThreeV1 } from './four-bedroom-house-three-v1.js';

export interface SceneRuntimeThreeOptionsV1 {
	resolveAsset?: (asset: SceneRuntimeRecipeV1['assets'][number]) => THREE.Object3D;
	resolveCustomEnvironment?: (recipe: SceneRuntimeRecipeV1) => THREE.Group;
	resolveCharacterAssetUrl?: (
		objectKey: string,
		meta: { catalog: CharacterCatalog; tier: TextureTier; context: CharacterAuthorizationContext }
	) => Promise<string>;
	resolveMotionClipUrl?: (clip: MotionDescriptor) => Promise<string>;
	motionCache?: MotionCacheThree;
	characterTemplateCache?: ResourceCache<{ root: THREE.Group; animations: THREE.AnimationClip[] }>;
	fetcher?: typeof fetch;
}

export interface SceneRuntimeSelectionV1 {
	event: SceneRuntimeRecipeV1['eventLanes'][number]['events'][number];
	clockId: string;
	targets: readonly THREE.Object3D[];
}

export type SceneResidencyModeV1 = 'video-scrub' | 'editing' | 'navigation';

/**
 * Instantiate the validated, server-resolved runtime recipe using the app's
 * existing procedural catalog and Three.js scene. This adapter is a renderer,
 * not an authorization or evidence-admission boundary. Each playback call
 * evaluates exactly one source clock; it never merges or aligns clock lanes.
 */
export function createSceneRuntimeThreeV1(input: unknown, options: SceneRuntimeThreeOptionsV1 = {}) {
	const recipe = SceneRuntimeRecipeV1Schema.parse(input);
	const root = new THREE.Group();
	root.name = `scene-runtime:${recipe.sceneId}:r${recipe.sceneRevision}`;
	root.userData = { caseId: recipe.caseId, sceneId: recipe.sceneId, planHash: recipe.planHash,
		coordinateStatus: recipe.environment.coordinateStatus, illustrative: recipe.environment.coordinateStatus === 'illustrative_uncalibrated' };

	const targetNodes = new Map<string, THREE.Object3D>();
	const pulseLights = new Map<string, THREE.PointLight>();
	const baseRotations = new Map<string, THREE.Quaternion>();
	const actors = new Map<string, PrimitiveAvatar>();
	const characterRuntimes = new Map<string, ThreeCharacterRuntime>();
	const materialPreview = new MaterialPreviewThree();
	const defaultMotionCache =
		options.motionCache ??
		new MotionCacheThree(
			options.resolveMotionClipUrl ??
				(async (clip) => {
					if (clip.scope.scopeKind === 'public-procedural') {
						return `/parent-atlas/objects/${clip.objectKey}`;
					}
					const cid = clip.scope.caseId ?? recipe.caseId;
					const sid = recipe.sceneId;
					if (!cid || !sid) {
						throw new Error('Case-private motion clips require an explicit caseId and sceneId');
					}
					return `/api/cases/${cid}/scenes/${sid}/characters/shared/assets/${clip.objectKey}?expectedSha256=${clip.sha256}`;
				}),
			512 * 1024,
			options.fetcher ?? fetch
		);
	const characterTemplates = options.characterTemplateCache ?? defaultCharacterTemplateCache;
	const resolveCharUrl =
		options.resolveCharacterAssetUrl ??
		(async (objectKey, meta) => {
			if (
				meta.context.scopeKind === 'public-procedural' &&
				meta.catalog.source_kind === 'generated-synthetic'
			) {
				return `/parent-atlas/objects/${objectKey}`;
			}
			const cid = meta.context.caseId ?? recipe.caseId;
			const sid = recipe.sceneId;
			const charId = meta.catalog.asset_id || 'shared';
			if (!cid || !sid) {
				throw new Error('Case-private character templates require an explicit caseId and sceneId');
			}
			return `/api/cases/${cid}/scenes/${sid}/characters/${encodeURIComponent(charId)}/assets/${objectKey}`;
		});
	const externalAssetNodes = new Set<THREE.Object3D>();
	const baseTargets: SceneTimelineTargetV1[] = [];
	const eventById = new Map<string, { lane: SceneRuntimeRecipeV1['eventLanes'][number]; event: SceneRuntimeRecipeV1['eventLanes'][number]['events'][number] }>();
	let environmentInstanceCount = 0;
	const streamableEnvironment = recipe.environment.kind === 'urban' || recipe.environment.kind === 'beach';
	const environmentStyle = streamableEnvironment ? recipe.environment.kind as SceneEnvironmentStyleV1 : null;
	const maxResidentCells = recipe.quality.profile === 'retro' ? 9 : recipe.quality.profile === 'balanced' ? 16 : 25;
	const cellResidency = streamableEnvironment ? createSceneCellResidencyV1({
		cellSizeMeters: recipe.environment.cellSizeMeters, radiusCells: 1, maxResidentCells, graceMs: recipe.streaming.unloadGraceMs
	}) : null;
	const environmentCells = new Map<string, { cell: SceneCellV1; group: THREE.Group; instanceCount: number }>();
	const environmentResourceNodes = new Set<THREE.Object3D>();
	let environmentLoadQueue: SceneCellV1[] = [];
	let residencyMode: SceneResidencyModeV1 = 'navigation';
	let activeResidentLimit = maxResidentCells;
	let lastFocusTile = '';
	let lastResidencyUpdateMs = -Infinity;

	if (recipe.environment.kind === 'urban' || recipe.environment.kind === 'beach') {
		const cell = createSceneEnvironmentCellThreeV1(recipe.environment.kind as SceneEnvironmentStyleV1, 0, 0,
			recipe.environment.cellSizeMeters, { includeDemoBonfire: false });
		root.add(cell.group);
		environmentInstanceCount = cell.instanceCount;
		environmentCells.set('0:0', { cell: { key: '0:0', tileX: 0, tileZ: 0, mortonKey: 0 }, group: cell.group, instanceCount: cell.instanceCount });
		cell.group.traverse((node) => environmentResourceNodes.add(node));
		const initial = cellResidency!.update([0, 0, 0], 0, { radiusCells: 2, maxResidentCells });
		environmentLoadQueue = initial.load.filter((candidate) => candidate.key !== '0:0');
	} else if (recipe.environment.kind === 'four-bedroom-house') {
		root.add(createFourBedroomHouseThreeV1());
	} else if (recipe.environment.kind === 'indoor') {
		root.add(createIllustrativeRoomBlockoutV1());
	} else if (options.resolveCustomEnvironment) {
		root.add(options.resolveCustomEnvironment(recipe));
	} else {
		throw new Error('SCENE_CUSTOM_RECIPE_RESOLVER_REQUIRED');
	}

	for (const actor of recipe.actors) {
		const avatar = createPrimitiveAvatar({ style: 'neutral' });
		avatar.root.name = actor.actorId;
		avatar.root.userData = { actorId: actor.actorId, appearance: actor.appearance, evidenceIds: [...actor.evidenceIds],
			generated: true, illustrative: true, identityEstablished: false };
		root.add(avatar.root);
		actors.set(actor.actorId, avatar);
		const key = `actor:${actor.actorId}`;
		targetNodes.set(key, avatar.root);
		baseTargets.push({ kind: 'actor', targetId: actor.actorId, visible: true, positionMeters: [0, 0, 0] });
	}

	for (const primitive of recipe.primitiveRegistry) {
		const kind = SCENE_PRIMITIVE_KINDS_V1.find((candidate) => candidate === primitive.registryId) as ScenePrimitiveKindV1 | undefined;
		if (!kind) throw new Error(`SCENE_PRIMITIVE_REGISTRY_ENTRY_UNSUPPORTED:${primitive.registryId}`);
		const mesh = createScenePrimitiveMeshV1(kind, { detail: recipe.quality.profile === 'high' ? 'detailed' : recipe.quality.profile === 'balanced' ? 'balanced' : 'retro', name: primitive.objectId });
		mesh.userData = { ...mesh.userData, objectId: primitive.objectId, registryId: primitive.registryId, planHash: recipe.planHash };
		root.add(mesh);
		targetNodes.set(`primitive:${primitive.objectId}`, mesh);
		baseTargets.push({ kind: 'primitive', targetId: primitive.objectId, visible: true, positionMeters: [0, 0, 0] });
	}

	for (const asset of recipe.assets) {
		if (!options.resolveAsset) throw new Error('SCENE_ASSET_RESOLVER_REQUIRED');
		const node = options.resolveAsset(asset);
		if (!(node instanceof THREE.Object3D)) throw new TypeError('SCENE_ASSET_RESOLVER_INVALID_NODE');
		node.userData = { ...node.userData, assetId: asset.assetId, assetRevision: asset.assetRevision, sha256: asset.sha256 };
		root.add(node);
		node.traverse((child) => externalAssetNodes.add(child));
		targetNodes.set(`asset:${asset.assetId}`, node);
		baseTargets.push({ kind: 'asset', targetId: asset.assetId, visible: true, positionMeters: [0, 0, 0] });
	}

	for (const placement of recipe.placements) {
		const node = targetNodes.get(`${placement.targetKind}:${placement.targetId}`);
		if (!node) throw new Error(`SCENE_PLACEMENT_TARGET_UNRESOLVED:${placement.placementId}`);
		const position: [number, number, number] = [placement.positionMeters[0]!, placement.positionMeters[1]!, placement.positionMeters[2]!];
		const rotation: [number, number, number, number] = [placement.rotationQuaternion[0]!, placement.rotationQuaternion[1]!, placement.rotationQuaternion[2]!, placement.rotationQuaternion[3]!];
		const scale: [number, number, number] = [placement.scale[0]!, placement.scale[1]!, placement.scale[2]!];
		node.position.set(position[0], position[1], position[2]);
		node.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
		node.scale.set(scale[0], scale[1], scale[2]);
		node.updateMatrix();
		node.userData = { ...node.userData, placementId: placement.placementId };
		const state = baseTargets.find((target) => target.kind === placement.targetKind && target.targetId === placement.targetId);
		if (state) state.positionMeters = position;
	}

	const eventsByClock = new Map<string, SceneTimedEventV1[]>();
	for (const lane of recipe.eventLanes) {
		const laneEvents = eventsByClock.get(lane.clockId) ?? [];
		for (const event of lane.events) {
			const runtimeEvent: SceneTimedEventV1 = {
				eventId: event.eventId, clockId: lane.clockId, startMs: event.startMs, endMs: event.endMs,
				status: event.status === 'accepted' ? 'accepted' : event.status === 'disputed' || event.reviewStatus === 'disputed' ? 'disputed' : event.status === 'unknown' ? 'unresolved' : 'provisional',
				targetRefs: event.targetRefs, action: event.action as SceneEventActionV1 | undefined
			};
			laneEvents.push(runtimeEvent);
			eventById.set(event.eventId, { lane, event });
		}
		eventsByClock.set(lane.clockId, laneEvents);
	}
	for (const lane of recipe.eventLanes) for (const event of lane.events) {
		if (event.action?.type === 'rotate_prop_during_interval') {
			for (const target of event.targetRefs) {
				const key = `${target.kind}:${target.targetId}`;
				const node = targetNodes.get(key);
				if (node && !baseRotations.has(key)) baseRotations.set(key, node.quaternion.clone());
			}
		}
		if (event.action?.type !== 'pulse_light_during_interval') continue;
		for (const target of event.targetRefs) {
			const key = `${event.eventId}:${target.kind}:${target.targetId}`;
			if (pulseLights.has(key)) continue;
			const targetNode = targetNodes.get(`${target.kind}:${target.targetId}`);
			if (!targetNode) continue;
			const light = new THREE.PointLight(new THREE.Color(event.action.colorHex), 0, 6, 2);
			light.name = `event-pulse:${event.eventId}`;
			light.position.y = 1;
			light.visible = false;
			light.userData = { eventId: event.eventId, targetId: target.targetId, illustrative: true };
			targetNode.add(light);
			pulseLights.set(key, light);
		}
	}
	for (const lane of recipe.eventLanes) for (const event of lane.events) {
		if (event.action?.type !== 'visible_during_interval' || !event.action.visible) continue;
		for (const target of event.targetRefs) {
			const state = baseTargets.find((candidate) => candidate.kind === target.kind && candidate.targetId === target.targetId);
			if (state) {
				state.visible = false;
				const node = targetNodes.get(`${target.kind}:${target.targetId}`);
				if (node) node.visible = false;
			}
		}
	}

	let activeClockId: string | null = null;
	let activeTimeMs: number | null = null;
	const yawAxis = new THREE.Vector3(0, 1, 0);
	const yaw = new THREE.Quaternion();
	function setSourceTime(clockId: string, sourceTimeMs: number): void {
		const events = eventsByClock.get(clockId);
		if (!events) throw new Error('SCENE_CLOCK_LANE_NOT_FOUND');
		for (const light of pulseLights.values()) { light.visible = false; light.intensity = 0; }
		const states = evaluateSceneTimelineV1(baseTargets, events, clockId, sourceTimeMs);
		for (const event of events) {
			const action = event.action;
			if (action?.type !== 'pulse_light_during_interval' || sourceTimeMs < event.startMs || sourceTimeMs >= event.endMs) continue;
			const phase = ((sourceTimeMs - event.startMs) % action.periodMs) / action.periodMs;
			const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
			for (const target of event.targetRefs ?? []) {
				const light = pulseLights.get(`${event.eventId}:${target.kind}:${target.targetId}`);
				if (!light) continue;
				light.visible = true;
				light.intensity = action.minIntensity + (action.maxIntensity - action.minIntensity) * pulse;
			}
		}
		for (const state of states) {
			const key = `${state.kind}:${state.targetId}`;
			const node = targetNodes.get(key);
			if (!node) continue;
			node.visible = state.visible;
			node.position.fromArray(state.positionMeters);
			const baseRotation = baseRotations.get(key);
			if (baseRotation) {
				node.quaternion.copy(baseRotation).multiply(yaw.setFromAxisAngle(yawAxis, THREE.MathUtils.degToRad(state.yawDegrees ?? 0)));
			}
			node.updateMatrix();
			node.userData = { ...node.userData, activeEventIds: state.activeEventIds, conflictEventIds: state.conflictEventIds, activeClockId: clockId, sourceTimeMs };
			const avatar = state.kind === 'actor' ? actors.get(state.targetId) : undefined;
			if (avatar) {
				const movement = events.filter((event) => event.action?.type === 'move_during_interval' &&
					event.targetRefs?.some((target) => target.kind === 'actor' && target.targetId === state.targetId) &&
					state.activeEventIds.includes(event.eventId) && !state.conflictEventIds.includes(event.eventId))
					.sort((a, b) => a.eventId.localeCompare(b.eventId))[0];
				const phase = movement ? 2 * Math.PI * ((sourceTimeMs - movement.startMs) / (movement.endMs - movement.startMs)) : 0;
				avatar.setWalk(phase, movement ? 0.35 : 0);
				const charRuntime = characterRuntimes.get(state.targetId);
				if (charRuntime?.root) {
					if (movement) {
						const walkClip = charRuntime.clips().includes('Walk') ? 'Walk' : charRuntime.clips()[0] ?? 'Walk';
						const clipSeconds = cueClipSeconds(
							sourceTimeMs,
							{
								eventId: movement.eventId,
								sourceId: clockId,
								sourceRevisionHash: recipe.planHash,
								sourceStartMs: movement.startMs,
								sourceEndMs: movement.endMs,
								clipStartSeconds: 0,
								speed: 1,
								loop: true
							},
							1.0
						);
						if (clipSeconds !== null) {
							charRuntime.seekClip(walkClip, clipSeconds);
						}
					} else if (charRuntime.clips().includes('Idle')) {
						charRuntime.seekClip('Idle', 0);
					}
					node.userData = {
						...node.userData,
						characterTier: charRuntime.currentTier,
						characterClip: charRuntime.currentClipName,
						characterPlayheadSeconds: charRuntime.currentPlayheadSeconds
					};
				}
			}
		}
		activeClockId = clockId;
		activeTimeMs = sourceTimeMs;
	}

	function selectEvent(eventId: string): SceneRuntimeSelectionV1 | null {
		const selected = eventById.get(eventId);
		if (!selected) return null;
		const nodes = selected.event.targetRefs.map((target) => targetNodes.get(`${target.kind}:${target.targetId}`)).filter((node): node is THREE.Object3D => Boolean(node));
		return { event: selected.event, clockId: selected.lane.clockId, targets: nodes };
	}

	function getEventFocusPosition(eventId: string): [number, number, number] | null {
		const selected = selectEvent(eventId);
		const target = selected?.targets[0];
		if (!target) return null;
		target.updateWorldMatrix(true, false);
		const position = target.getWorldPosition(new THREE.Vector3());
		return [position.x, position.y, position.z];
	}

	function getObjectFocusPosition(objectId: string): [number, number, number] | null {
		let found: THREE.Object3D | null = null;
		root.traverse((node) => {
			if (!found && node.userData.houseObject?.id === objectId) found = node;
		});
		if (!found) return null;
		(found as THREE.Object3D).updateWorldMatrix(true, false);
		const position = (found as THREE.Object3D).getWorldPosition(new THREE.Vector3());
		return [position.x, position.y, position.z];
	}

	function updateEnvironmentFocus(position: readonly [number, number, number], mode: SceneResidencyModeV1, nowMs = performance.now()): void {
		if (!cellResidency || !environmentStyle) return;
		if (position.length !== 3 || !position.every(Number.isFinite)) throw new TypeError('SCENE_ENVIRONMENT_FOCUS_INVALID');
		const tileX = Math.floor(position[0] / recipe.environment.cellSizeMeters);
		const tileZ = Math.floor(position[2] / recipe.environment.cellSizeMeters);
		const nextFocusKey = `${tileX}:${tileZ}:${mode}`;
		if (nextFocusKey === lastFocusTile && nowMs - lastResidencyUpdateMs < 500) return;
		lastFocusTile = nextFocusKey;
		lastResidencyUpdateMs = nowMs;
		residencyMode = mode;
		const modeLimit = mode === 'navigation' ? maxResidentCells : Math.min(9, maxResidentCells);
		activeResidentLimit = modeLimit;
		const plan = cellResidency.update(position, nowMs, {
			radiusCells: mode === 'navigation' ? 2 : 1,
			maxResidentCells: modeLimit,
			...(mode === 'editing' ? { pinnedPositions: [position] } : {})
		});
		for (const cell of plan.unload) {
			const loaded = environmentCells.get(cell.key);
			if (!loaded) continue;
			loaded.group.removeFromParent();
			disposeSceneEnvironmentCellThreeV1(loaded.group);
			loaded.group.traverse((node) => environmentResourceNodes.delete(node));
			environmentCells.delete(cell.key);
			environmentInstanceCount -= loaded.instanceCount;
		}
		const desired = new Set(plan.resident.map((cell) => cell.key));
		environmentLoadQueue = environmentLoadQueue.filter((cell) => desired.has(cell.key) && !environmentCells.has(cell.key));
		const queued = new Set(environmentLoadQueue.map((cell) => cell.key));
		const maxQueue = Math.min(modeLimit, 32);
		const candidates = plan.load.filter((cell) => !environmentCells.has(cell.key) && !queued.has(cell.key))
			.sort((a, b) => (Math.abs(a.tileX - tileX) + Math.abs(a.tileZ - tileZ)) - (Math.abs(b.tileX - tileX) + Math.abs(b.tileZ - tileZ)) || a.mortonKey - b.mortonKey);
		environmentLoadQueue = [...environmentLoadQueue, ...candidates].slice(0, maxQueue);
	}

	function drainEnvironmentCellQueue(maxCells = 1): void {
		if (!environmentStyle || !Number.isInteger(maxCells) || maxCells < 0 || maxCells > 4) return;
		for (let count = 0; count < maxCells && environmentLoadQueue.length; count++) {
			const cell = environmentLoadQueue.shift()!;
			if (environmentCells.has(cell.key)) continue;
			const built = createSceneEnvironmentCellThreeV1(environmentStyle, cell.tileX, cell.tileZ,
				recipe.environment.cellSizeMeters, { includeDemoBonfire: false });
			root.add(built.group);
			built.group.traverse((node) => environmentResourceNodes.add(node));
			environmentCells.set(cell.key, { cell, group: built.group, instanceCount: built.instanceCount });
			environmentInstanceCount += built.instanceCount;
		}
	}

	function getResidencyMetrics() {
		return {
			loadedCells: environmentCells.size,
			queuedCells: environmentLoadQueue.length,
			residentLimit: cellResidency ? activeResidentLimit : 0,
			mode: residencyMode
		};
	}

	/**
	 * Load or swap the GLB LOD (retro/balanced/detailed) for a scene actor while keeping
	 * the procedural avatar as synchronous fallback and preserving actor ID, world transform,
	 * active clip, playhead time, selection, and event bindings.
	 */
	async function loadCharacterActor(
		actorId: string,
		catalog: CharacterCatalog,
		tier: TextureTier = 'retro',
		context: CharacterAuthorizationContext = { scopeKind: 'public-procedural' },
		motionDescriptors: readonly MotionDescriptor[] = []
	): Promise<ThreeCharacterRuntime> {
		const avatar = actors.get(actorId);
		const actorNode = targetNodes.get(`actor:${actorId}`);
		if (!avatar || !actorNode) {
			throw new Error(`SCENE_ACTOR_NOT_REGISTERED:${actorId}`);
		}
		let charRuntime = characterRuntimes.get(actorId);
		if (!charRuntime) {
			charRuntime = new ThreeCharacterRuntime(
				avatar.root,
				resolveCharUrl,
				characterTemplates,
				defaultMotionCache,
				options.fetcher ?? fetch
			);
			characterRuntimes.set(actorId, charRuntime);
		}
		await charRuntime.load(catalog, tier, context);
		for (const descriptor of motionDescriptors) {
			await charRuntime.preloadMotion(descriptor);
		}
		if (charRuntime.root) {
			// Hide only the procedural fallback children while the GLB LOD child is active
			for (const child of avatar.root.children) {
				if (child !== charRuntime.root) child.visible = false;
			}
			charRuntime.root.userData = {
				...charRuntime.root.userData,
				actorId,
				lodTier: tier,
				generated: true,
				illustrative: true,
				identityEstablished: false
			};
			actorNode.userData = {
				...actorNode.userData,
				characterTier: tier,
				characterClip: charRuntime.currentClipName,
				characterPlayheadSeconds: charRuntime.currentPlayheadSeconds
			};
			if (activeClockId !== null && activeTimeMs !== null) {
				setSourceTime(activeClockId, activeTimeMs);
			}
		}
		return charRuntime;
	}

	function findObjectMesh(objectId: string): THREE.Mesh | null {
		let targetRoot: THREE.Object3D | null =
			targetNodes.get(`actor:${objectId}`) ??
			targetNodes.get(`primitive:${objectId}`) ??
			targetNodes.get(`asset:${objectId}`) ??
			null;
		if (!targetRoot) {
			root.traverse((node) => {
				if (!targetRoot && node.userData.houseObject?.id === objectId) {
					targetRoot = node;
				}
			});
		}
		if (!targetRoot) return null;
		// If an actor has a loaded GLB character runtime, target its primary visible mesh first
		const charRuntime = characterRuntimes.get(objectId);
		const searchRoot = charRuntime?.root ?? targetRoot;
		if (searchRoot instanceof THREE.Mesh) return searchRoot;
		let foundMesh: THREE.Mesh | null = null;
		searchRoot.traverse((child) => {
			if (!foundMesh && child instanceof THREE.Mesh && child.visible) {
				foundMesh = child;
			}
		});
		if (!foundMesh) {
			searchRoot.traverse((child) => {
				if (!foundMesh && child instanceof THREE.Mesh) {
					foundMesh = child;
				}
			});
		}
		return foundMesh;
	}

	function applyObjectMaterialPreview(
		objectId: string,
		state: MaterialEditorState,
		opts: { isAtlasPage?: boolean } = {}
	): THREE.Mesh | null {
		const mesh = findObjectMesh(objectId);
		if (!mesh) return null;
		materialPreview.apply(mesh, state, opts);
		return mesh;
	}

	function resetObjectMaterialPreview(objectId?: string): void {
		if (!objectId) {
			materialPreview.dispose();
			return;
		}
		const mesh = findObjectMesh(objectId);
		if (mesh) materialPreview.reset(mesh);
	}

	function dispose(): void {
		for (const light of pulseLights.values()) light.removeFromParent();
		pulseLights.clear();
		materialPreview.dispose();
		for (const charRuntime of characterRuntimes.values()) {
			charRuntime.unload();
		}
		characterRuntimes.clear();
		defaultMotionCache.trim();
		characterTemplates.evictUnreferenced();
		root.removeFromParent();
		environmentLoadQueue = [];
		cellResidency?.clear();
		for (const { group } of environmentCells.values()) disposeSceneEnvironmentCellThreeV1(group);
		environmentCells.clear();
		environmentResourceNodes.clear();
		const geometries = new Set<THREE.BufferGeometry>();
		const materials = new Set<THREE.Material>();
		root.traverse((node) => {
			if (externalAssetNodes.has(node) || environmentResourceNodes.has(node) || !(node instanceof THREE.Mesh)) return;
			geometries.add(node.geometry);
			for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
		});
		for (const geometry of geometries) geometry.dispose();
		for (const material of materials) material.dispose();
	}

	return {
		root,
		recipe,
		targetNodes,
		actors,
		characterRuntimes,
		materialPreview,
		motionCache: defaultMotionCache,
		get environmentInstanceCount() {
			return environmentInstanceCount;
		},
		setSourceTime,
		selectEvent,
		getEventFocusPosition,
		getObjectFocusPosition,
		updateEnvironmentFocus,
		drainEnvironmentCellQueue,
		getResidencyMetrics,
		loadCharacterActor,
		findObjectMesh,
		applyObjectMaterialPreview,
		resetObjectMaterialPreview,
		applyTimedSceneActionsAtSourceTime(
			baseline: readonly SceneBaselineTargetState[],
			actions: readonly TimedSceneAction[],
			sourceId: string,
			sourceTimeMs: number,
			evalOptions: { includeSimulation?: boolean } = {}
		): EvaluatedTargetState[] {
			const evaluated = evaluateDeterministicSceneStateV1(
				baseline,
				actions,
				sourceId,
				sourceTimeMs,
				evalOptions
			);
			for (const state of evaluated) {
				const node =
					targetNodes.get(`actor:${state.targetId}`) ??
					targetNodes.get(`primitive:${state.targetId}`) ??
					targetNodes.get(`asset:${state.targetId}`) ??
					root.getObjectByName(state.targetId);
				if (!node) continue;
				node.visible = state.visible;
				node.position.fromArray(state.position);
				if (state.capability === 'door') {
					node.rotation.y = state.hingeRad;
				}
				if (state.capability === 'light' && (node as THREE.Light).isLight) {
					(node as THREE.Light).intensity = state.lightIntensity;
				}
				if (state.activeClip) {
					const charRuntime = characterRuntimes.get(state.targetId);
					if (charRuntime?.root && charRuntime.clips().includes(state.activeClip.clipId)) {
						charRuntime.seekClip(state.activeClip.clipId, state.activeClip.localTimeSeconds);
					}
				}
				node.userData = {
					...node.userData,
					materialStateId: state.materialStateId,
					appliedActionIds: state.appliedActionIds,
					conflictActionIds: state.conflictActionIds,
					originsPresent: state.originsPresent
				};
				node.updateMatrix();
			}
			activeClockId = sourceId;
			activeTimeMs = sourceTimeMs;
			return evaluated;
		},
		get activeSourceTime() {
			return activeClockId && activeTimeMs !== null
				? { clockId: activeClockId, sourceTimeMs: activeTimeMs }
				: null;
		},
		dispose
	};
}
