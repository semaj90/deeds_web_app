import { mortonTileKeyV1, tileForWorldPositionV1 } from '$lib/n64-fsm/scene-primitive-packet-v1.js';

export interface SceneCellResidencyOptionsV1 {
	cellSizeMeters?: number;
	radiusCells?: number;
	maxResidentCells?: number;
	graceMs?: number;
}

export interface SceneCellResidencyUpdatePolicyV1 {
	radiusCells?: number;
	maxResidentCells?: number;
	pinnedPositions?: readonly (readonly [number, number, number])[];
}

export interface SceneCellV1 {
	key: string;
	tileX: number;
	tileZ: number;
	mortonKey: number;
}

/**
 * Bounded, deterministic cell residency planner. It returns keys only: callers
 * load authorized cell manifests/artifacts and own actual Three.js resources.
 */
export function createSceneCellResidencyV1(options: SceneCellResidencyOptionsV1 = {}) {
	const cellSize = options.cellSizeMeters ?? 32;
	const radius = options.radiusCells ?? 2;
	const maxResident = options.maxResidentCells ?? 64;
	const graceMs = options.graceMs ?? 1500;
	if (!Number.isFinite(cellSize) || cellSize <= 0 || !Number.isInteger(radius) || radius < 0 ||
		!Number.isInteger(maxResident) || maxResident < 1 || !Number.isFinite(graceMs) || graceMs < 0) {
		throw new RangeError('SCENE_CELL_RESIDENCY_OPTIONS_INVALID');
	}
	const resident = new Map<string, { cell: SceneCellV1; lastDesiredAt: number }>();

	return {
		update(position: readonly [number, number, number], nowMs: number, policy: SceneCellResidencyUpdatePolicyV1 = {}): { load: SceneCellV1[]; unload: SceneCellV1[]; resident: SceneCellV1[] } {
			if (position.length !== 3 || !position.every(Number.isFinite) || !Number.isFinite(nowMs)) throw new TypeError('SCENE_CELL_POSITION_OR_TIME_INVALID');
			const activeRadius = policy.radiusCells ?? radius;
			const activeMaxResident = policy.maxResidentCells ?? maxResident;
			if (!Number.isInteger(activeRadius) || activeRadius < 0 || activeRadius > 8 ||
				!Number.isInteger(activeMaxResident) || activeMaxResident < 1 || activeMaxResident > 64) {
				throw new RangeError('SCENE_CELL_RESIDENCY_POLICY_INVALID');
			}
			const [centerX, centerZ] = tileForWorldPositionV1(position[0], position[2], cellSize);
			const candidateByKey = new Map<string, SceneCellV1>();
			for (let dz = -activeRadius; dz <= activeRadius; dz++) for (let dx = -activeRadius; dx <= activeRadius; dx++) {
				const tileX = centerX + dx;
				const tileZ = centerZ + dz;
				const cell = { key: `${tileX}:${tileZ}`, tileX, tileZ, mortonKey: mortonTileKeyV1(tileX, tileZ) };
				candidateByKey.set(cell.key, cell);
			}
			const pinnedKeys = new Set((policy.pinnedPositions ?? []).map((pinned) => {
				if (pinned.length !== 3 || !pinned.every(Number.isFinite)) throw new TypeError('SCENE_CELL_PIN_POSITION_INVALID');
				const [tileX, tileZ] = tileForWorldPositionV1(pinned[0], pinned[2], cellSize);
				const cell = { key: `${tileX}:${tileZ}`, tileX, tileZ, mortonKey: mortonTileKeyV1(tileX, tileZ) };
				candidateByKey.set(cell.key, cell);
				return cell.key;
			}));
			const candidates = [...candidateByKey.values()];
			candidates.sort((a, b) => {
				const pinOrder = Number(pinnedKeys.has(b.key)) - Number(pinnedKeys.has(a.key));
				if (pinOrder) return pinOrder;
				const da = Math.abs(a.tileX - centerX) + Math.abs(a.tileZ - centerZ);
				const db = Math.abs(b.tileX - centerX) + Math.abs(b.tileZ - centerZ);
				return da - db || a.mortonKey - b.mortonKey;
			});
			const desired = candidates.slice(0, activeMaxResident);
			const desiredKeys = new Set(desired.map((cell) => cell.key));
			const load: SceneCellV1[] = [];
			for (const cell of desired) {
				const prior = resident.get(cell.key);
				if (!prior) load.push(cell);
				resident.set(cell.key, { cell, lastDesiredAt: nowMs });
			}
			const unload: SceneCellV1[] = [];
			const graceCandidates = [...resident.entries()]
				.filter(([key, value]) => !desiredKeys.has(key) && nowMs - value.lastDesiredAt < graceMs)
				.sort((a, b) => b[1].lastDesiredAt - a[1].lastDesiredAt || a[0].localeCompare(b[0]));
			const retainedKeys = new Set(graceCandidates.slice(0, Math.max(0, activeMaxResident - desired.length)).map(([key]) => key));
			for (const [key, value] of resident) {
				if (!desiredKeys.has(key) && !retainedKeys.has(key)) {
					unload.push(value.cell);
					resident.delete(key);
				}
			}
			return { load, unload, resident: [...resident.values()].map((entry) => entry.cell) };
		},
		clear(): SceneCellV1[] {
			const result = [...resident.values()].map((entry) => entry.cell);
			resident.clear();
			return result;
		}
	};
}

// ============================================================================
// MEM-02: Byte-Budgeted Cell & Asset Residency Planner
// ============================================================================

export type ResidencyTierV1 = 'retro' | 'balanced' | 'detailed';

export interface ResidencyTierBudgetV1 {
	readonly cpuCellBytes: number;
	readonly stagingCeilingBytes: number;
	readonly gpuTextureBytes: number;
	readonly maxUploadBytesPerFrame: number;
}

const MIB = 1024 * 1024;

export const RESIDENCY_TIER_BUDGETS_V1: Readonly<Record<ResidencyTierV1, ResidencyTierBudgetV1>> =
	Object.freeze({
		retro: Object.freeze({
			cpuCellBytes: 8 * MIB,
			stagingCeilingBytes: 16 * MIB,
			gpuTextureBytes: 32 * MIB,
			maxUploadBytesPerFrame: 1 * MIB
		}),
		balanced: Object.freeze({
			cpuCellBytes: 16 * MIB,
			stagingCeilingBytes: 32 * MIB,
			gpuTextureBytes: 64 * MIB,
			maxUploadBytesPerFrame: 2 * MIB
		}),
		detailed: Object.freeze({
			cpuCellBytes: 32 * MIB,
			stagingCeilingBytes: 64 * MIB,
			gpuTextureBytes: 128 * MIB,
			maxUploadBytesPerFrame: 4 * MIB
		})
	});

export interface CellTextureRequirementV1 {
	readonly textureKey: string;
	readonly gpuBytes: number;
}

export interface CellAssetDemandV1 {
	readonly cellKey: string;
	readonly geometryBytes: number;
	readonly stagingBytes: number;
	readonly textures: readonly CellTextureRequirementV1[];
	readonly inFrustum: boolean;
	readonly hasSelectedObject: boolean;
	readonly hasFocusedEvent: boolean;
	readonly distanceMeters: number;
}

export interface IncrementalAllocationResultV1 {
	readonly cellKey: string;
	readonly geometryBytes: number;
	readonly newTextureBytes: number;
	readonly stagingBytes: number;
	readonly totalRequiredBytes: number;
	readonly newTextureKeys: string[];
}

/**
 * Computes B_required = B_geometry + B_new_textures + B_staging,
 * charging only textures not already resident in GPU VRAM.
 */
export function computeIncrementalCellAllocationV1(
	demand: CellAssetDemandV1,
	residentTextureKeys: ReadonlySet<string>
): IncrementalAllocationResultV1 {
	let newTextureBytes = 0;
	const newTextureKeys: string[] = [];
	const seenInCell = new Set<string>();

	for (const tex of demand.textures) {
		if (seenInCell.has(tex.textureKey)) continue;
		seenInCell.add(tex.textureKey);
		if (!residentTextureKeys.has(tex.textureKey)) {
			newTextureBytes += tex.gpuBytes;
			newTextureKeys.push(tex.textureKey);
		}
	}

	const totalRequiredBytes = demand.geometryBytes + newTextureBytes + demand.stagingBytes;
	return {
		cellKey: demand.cellKey,
		geometryBytes: demand.geometryBytes,
		newTextureBytes,
		stagingBytes: demand.stagingBytes,
		totalRequiredBytes,
		newTextureKeys
	};
}

/**
 * Combines frustum visibility, selected object, event focus, and distance
 * with a hysteresis bonus for already-resident cells to prevent thrashing.
 */
export function scoreCellPriorityV1(
	demand: CellAssetDemandV1,
	isCurrentlyResident: boolean,
	hysteresisBonus = 25
): number {
	let score = 0;
	if (demand.hasSelectedObject) score += 1000;
	if (demand.hasFocusedEvent) score += 500;
	if (demand.inFrustum) score += 200;
	if (isCurrentlyResident) score += hysteresisBonus;
	score -= Math.min(150, demand.distanceMeters * 0.5);
	return score;
}

export interface ByteBudgetedPlanResultV1 {
	readonly tier: ResidencyTierV1;
	readonly admittedCellKeys: string[];
	readonly deferredByUploadCapKeys: string[];
	readonly evictedCellKeys: string[];
	readonly usedCpuBytes: number;
	readonly usedGpuTextureBytes: number;
	readonly usedStagingBytes: number;
	readonly frameUploadBytes: number;
}

export class ByteBudgetedCellResidencyPlannerV1 {
	private readonly residentCells = new Map<string, CellAssetDemandV1>();

	constructor(private readonly tier: ResidencyTierV1 = 'balanced') {}

	planFrame(demands: readonly CellAssetDemandV1[]): ByteBudgetedPlanResultV1 {
		const budget = RESIDENCY_TIER_BUDGETS_V1[this.tier];
		const scored = [...demands].sort((a, b) => {
			const sa = scoreCellPriorityV1(a, this.residentCells.has(a.cellKey));
			const sb = scoreCellPriorityV1(b, this.residentCells.has(b.cellKey));
			return sb - sa || a.cellKey.localeCompare(b.cellKey);
		});

		const activeTextureCounts = new Map<string, number>();
		const residentTextureKeys = new Set<string>();
		let usedCpuBytes = 0;
		let usedGpuTextureBytes = 0;
		let usedStagingBytes = 0;
		let frameUploadBytes = 0;

		const admittedCellKeys: string[] = [];
		const deferredByUploadCapKeys: string[] = [];
		const nextResident = new Map<string, CellAssetDemandV1>();

		for (const demand of scored) {
			const alloc = computeIncrementalCellAllocationV1(demand, residentTextureKeys);
			const isNewCell = !this.residentCells.has(demand.cellKey);
			const uploadCost = isNewCell ? alloc.geometryBytes + alloc.newTextureBytes : 0;

			if (isNewCell && frameUploadBytes + uploadCost > budget.maxUploadBytesPerFrame) {
				deferredByUploadCapKeys.push(demand.cellKey);
				continue;
			}
			if (
				usedCpuBytes + alloc.geometryBytes > budget.cpuCellBytes ||
				usedGpuTextureBytes + alloc.newTextureBytes > budget.gpuTextureBytes ||
				usedStagingBytes + alloc.stagingBytes > budget.stagingCeilingBytes
			) {
				continue;
			}

			usedCpuBytes += alloc.geometryBytes;
			usedGpuTextureBytes += alloc.newTextureBytes;
			usedStagingBytes += alloc.stagingBytes;
			frameUploadBytes += uploadCost;

			for (const tex of demand.textures) {
				residentTextureKeys.add(tex.textureKey);
				activeTextureCounts.set(tex.textureKey, (activeTextureCounts.get(tex.textureKey) ?? 0) + 1);
			}

			admittedCellKeys.push(demand.cellKey);
			nextResident.set(demand.cellKey, demand);
		}

		const evictedCellKeys: string[] = [];
		for (const oldKey of this.residentCells.keys()) {
			if (!nextResident.has(oldKey)) {
				evictedCellKeys.push(oldKey);
			}
		}

		this.residentCells.clear();
		for (const [k, v] of nextResident) {
			this.residentCells.set(k, v);
		}

		return {
			tier: this.tier,
			admittedCellKeys,
			deferredByUploadCapKeys,
			evictedCellKeys,
			usedCpuBytes,
			usedGpuTextureBytes,
			usedStagingBytes,
			frameUploadBytes
		};
	}
}
