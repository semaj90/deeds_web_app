import { describe, expect, it } from 'vitest';
import {
	ByteBudgetedCellResidencyPlannerV1,
	RESIDENCY_TIER_BUDGETS_V1,
	computeIncrementalCellAllocationV1,
	scoreCellPriorityV1,
	type CellAssetDemandV1
} from './scene-cell-residency-v1.js';

const MIB = 1024 * 1024;

describe('ByteBudgetedCellResidencyPlannerV1 (MEM-02)', () => {
	it('computes B_required charging shared textures only once across cells', () => {
		const demand: CellAssetDemandV1 = {
			cellKey: '0:1',
			geometryBytes: 512 * 1024,
			stagingBytes: 256 * 1024,
			textures: [
				{ textureKey: 'plaster.ivory.v1', gpuBytes: 2 * MIB },
				{ textureKey: 'oak.floor.v1', gpuBytes: 1 * MIB }
			],
			inFrustum: true,
			hasSelectedObject: false,
			hasFocusedEvent: false,
			distanceMeters: 10
		};

		const firstAlloc = computeIncrementalCellAllocationV1(demand, new Set());
		expect(firstAlloc.newTextureBytes).toBe(3 * MIB);
		expect(firstAlloc.totalRequiredBytes).toBe(512 * 1024 + 3 * MIB + 256 * 1024);

		// When plaster.ivory.v1 is already resident from another cell, only oak.floor.v1 is charged
		const secondAlloc = computeIncrementalCellAllocationV1(demand, new Set(['plaster.ivory.v1']));
		expect(secondAlloc.newTextureBytes).toBe(1 * MIB);
		expect(secondAlloc.newTextureKeys).toEqual(['oak.floor.v1']);
	});

	it('enforces tier budgets, per-frame upload caps, and hysteresis priority', () => {
		expect(RESIDENCY_TIER_BUDGETS_V1.retro.maxUploadBytesPerFrame).toBe(1 * MIB);
		expect(RESIDENCY_TIER_BUDGETS_V1.balanced.gpuTextureBytes).toBe(64 * MIB);
		expect(RESIDENCY_TIER_BUDGETS_V1.detailed.cpuCellBytes).toBe(32 * MIB);

		const planner = new ByteBudgetedCellResidencyPlannerV1('retro');
		const cellA: CellAssetDemandV1 = {
			cellKey: '0:0',
			geometryBytes: 512 * 1024,
			stagingBytes: 256 * 1024,
			textures: [{ textureKey: 'plaster.ivory.v1', gpuBytes: 256 * 1024 }],
			inFrustum: true,
			hasSelectedObject: true,
			hasFocusedEvent: false,
			distanceMeters: 5
		};
		const cellB: CellAssetDemandV1 = {
			cellKey: '0:1',
			geometryBytes: 512 * 1024,
			stagingBytes: 256 * 1024,
			textures: [{ textureKey: 'plaster.ivory.v1', gpuBytes: 256 * 1024 }],
			inFrustum: true,
			hasSelectedObject: false,
			hasFocusedEvent: false,
			distanceMeters: 12
		};

		// Retro upload cap is 1 MiB/frame: cellA uses 768 KiB, so cellB (512 KiB new geo) is deferred to next frame
		const frame1 = planner.planFrame([cellA, cellB]);
		expect(frame1.admittedCellKeys).toEqual(['0:0']);
		expect(frame1.deferredByUploadCapKeys).toEqual(['0:1']);

		// Frame 2: cellA is already resident (0 upload cost), so cellB is admitted with shared plaster texture (0 new texture bytes!)
		const frame2 = planner.planFrame([cellA, cellB]);
		expect(frame2.admittedCellKeys).toEqual(['0:0', '0:1']);
		expect(frame2.usedGpuTextureBytes).toBe(256 * 1024);

		// Hysteresis bonus keeps resident cell prioritized over equal-distance newcomer
		const residentScore = scoreCellPriorityV1(cellB, true);
		const freshScore = scoreCellPriorityV1(cellB, false);
		expect(residentScore).toBeGreaterThan(freshScore);
	});
});
