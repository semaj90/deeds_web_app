import { describe, it, expect } from 'vitest';
import {
	checkGpuVramGuard,
	QLoraFsmSwapManagerV1,
	type QLoraAdapterDescriptorV1,
} from './qlora-fsm-swap-adapter-v1.js';

describe('QLoRA FSM Swap Adapter V1', () => {
	const validDescriptor: QLoraAdapterDescriptorV1 = {
		adapterId: 'adapter-legal-sec-filing-v1',
		baseModelRevision: 'ornith-1.5-9b-q4',
		adapterSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
		rank: 16,
		alpha: 32,
		heldOutEvalScore: 0.88,
		minEvalThreshold: 0.75,
		vramRequiredMb: 1024,
		quantizationType: 'NF4',
		targetModules: ['q_proj', 'v_proj', 'k_proj'],
		createdAt: '2026-10-24T00:00:00.000Z',
	};

	describe('1. GPU VRAM Guard & Hardware Constraints (8 GiB Cap)', () => {
		it('permits adapter when projected VRAM stays within 8192 MB', () => {
			const guard = checkGpuVramGuard(validDescriptor, true, 4096);
			expect(guard.canLoadAdapter).toBe(true);
			expect(guard.allocatedVramMb).toBe(5120);
			expect(guard.totalVramMb).toBe(8192);
		});

		it('blocks adapter when projected allocation exceeds 8192 MB', () => {
			const heavyDescriptor: QLoraAdapterDescriptorV1 = {
				...validDescriptor,
				vramRequiredMb: 4500, // 4096 + 4500 = 8596 MB > 8192 MB
			};
			const guard = checkGpuVramGuard(heavyDescriptor, true, 4096);
			expect(guard.canLoadAdapter).toBe(false);
			expect(guard.reason).toContain('VRAM_BUDGET_EXCEEDED');
		});

		it('blocks adapter when single adapter requirement exceeds 8192 MB', () => {
			const oversized: QLoraAdapterDescriptorV1 = {
				...validDescriptor,
				vramRequiredMb: 9000,
			};
			const guard = checkGpuVramGuard(oversized, true, 0);
			expect(guard.canLoadAdapter).toBe(false);
			expect(guard.reason).toContain('ADAPTER_EXCEEDS_TOTAL_VRAM');
		});
	});

	describe('2. QLoRA FSM State Transitions & Atomic Swapping', () => {
		it('successfully transitions from IDLE to RESIDENT_GPU on valid swap', () => {
			const manager = new QLoraFsmSwapManagerV1(4096);
			expect(manager.getState()).toBe('IDLE');

			const receipt = manager.swapAdapter(validDescriptor);
			expect(receipt.state).toBe('RESIDENT_GPU');
			expect(receipt.activeAdapterId).toBe(validDescriptor.adapterId);
			expect(receipt.previousAdapterId).toBeNull();
			expect(receipt.canonicalAuthority).toBe(false);
			expect(receipt.writesPerformed).toBe(false);
			expect(receipt.trainingAuthorized).toBe(false);
			expect(receipt.canonicalAdmission).toBe('NOT_ADMITTED');

			expect(manager.getActiveAdapter()?.adapterId).toBe(validDescriptor.adapterId);
			expect(manager.getAllocatedVramMb()).toBe(5120);
		});

		it('rejects swap if held-out evaluation score is below threshold', () => {
			const manager = new QLoraFsmSwapManagerV1(4096);
			const lowScoreDescriptor: QLoraAdapterDescriptorV1 = {
				...validDescriptor,
				heldOutEvalScore: 0.65,
				minEvalThreshold: 0.75,
			};

			expect(() => manager.swapAdapter(lowScoreDescriptor)).toThrowError(
				/QLORA_EVAL_SCORE_BELOW_THRESHOLD/,
			);
			expect(manager.getState()).toBe('REJECTED');
		});

		it('swaps active adapter and records previous adapter ID', () => {
			const manager = new QLoraFsmSwapManagerV1(4096);
			manager.swapAdapter(validDescriptor);

			const secondDescriptor: QLoraAdapterDescriptorV1 = {
				...validDescriptor,
				adapterId: 'adapter-patent-claims-v2',
				vramRequiredMb: 1536,
			};

			const receipt = manager.swapAdapter(secondDescriptor);
			expect(receipt.previousAdapterId).toBe('adapter-legal-sec-filing-v1');
			expect(receipt.activeAdapterId).toBe('adapter-patent-claims-v2');
			expect(receipt.vramAllocatedMb).toBe(5632);
			expect(manager.getState()).toBe('RESIDENT_GPU');
		});

		it('evicts active adapter and frees allocated memory', () => {
			const manager = new QLoraFsmSwapManagerV1(4096);
			manager.swapAdapter(validDescriptor);
			expect(manager.getAllocatedVramMb()).toBe(5120);

			manager.evictActiveAdapter();
			expect(manager.getState()).toBe('EVICTED');
			expect(manager.getActiveAdapter()).toBeNull();
			expect(manager.getAllocatedVramMb()).toBe(4096);
		});
	});
});
