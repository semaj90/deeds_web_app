import { createHash } from 'node:crypto';
import { z } from 'zod';

export const QLORA_FSM_SCHEMA_V1 = 'atlas.qlora-fsm-swap.v1' as const;

export const QLoraFsmStateSchema = z.enum([
	'IDLE',
	'VALIDATING',
	'RESIDENT_GPU',
	'SWAPPING',
	'EVICTED',
	'REJECTED',
]);

export type QLoraFsmState = z.infer<typeof QLoraFsmStateSchema>;

export const QLoraAdapterDescriptorV1Schema = z
	.object({
		adapterId: z.string().min(1),
		baseModelRevision: z.string().min(1),
		adapterSha256: z.string().regex(/^[a-f0-9]{64}$/),
		rank: z.number().int().positive().max(64),
		alpha: z.number().positive(),
		heldOutEvalScore: z.number().finite().nonnegative(),
		minEvalThreshold: z.number().finite().default(0.75),
		vramRequiredMb: z.number().int().positive().max(8192), // Strict 8 GiB hardware cap
		quantizationType: z.enum(['NF4', 'INT8', 'BITNET_B158']),
		targetModules: z.array(z.string().min(1)),
		createdAt: z.string().datetime(),
	})
	.strict();

export type QLoraAdapterDescriptorV1 = z.infer<typeof QLoraAdapterDescriptorV1Schema>;

export interface GpuVramGuardStatus {
	totalVramMb: number; // 8192 for RTX 3060 Ti
	allocatedVramMb: number;
	ornithActiveOn8090: boolean;
	wslRapidsAvailable: boolean;
	canLoadAdapter: boolean;
	reason?: string;
}

export const QLoraSwapReceiptV1Schema = z
	.object({
		schema: z.literal(QLORA_FSM_SCHEMA_V1),
		receiptId: z.string().min(1),
		previousAdapterId: z.string().nullable(),
		activeAdapterId: z.string(),
		state: QLoraFsmStateSchema,
		vramAllocatedMb: z.number().nonnegative(),
		timestamp: z.string().datetime(),
		canonicalAuthority: z.literal(false),
		writesPerformed: z.literal(false),
		trainingAuthorized: z.literal(false),
		canonicalAdmission: z.literal('NOT_ADMITTED'),
	})
	.strict();

export type QLoraSwapReceiptV1 = z.infer<typeof QLoraSwapReceiptV1Schema>;

/**
 * Validates hardware VRAM residency constraints for RTX 3060 Ti (8 GiB)
 * in accordance with workstation operating instructions:
 * Cannot host Ornith on :8090 and massive GPU kernel batches simultaneously without graceful release.
 */
export function checkGpuVramGuard(
	descriptor: QLoraAdapterDescriptorV1,
	currentOrnithActive: boolean = true,
	currentAllocatedMb: number = 4096, // Typical baseline for Ornith 9B Q4
): GpuVramGuardStatus {
	const totalVramMb = 8192; // RTX 3060 Ti 8 GiB
	const projectedAllocation = currentAllocatedMb + descriptor.vramRequiredMb;

	if (descriptor.vramRequiredMb > totalVramMb) {
		return {
			totalVramMb,
			allocatedVramMb: currentAllocatedMb,
			ornithActiveOn8090: currentOrnithActive,
			wslRapidsAvailable: true,
			canLoadAdapter: false,
			reason: `ADAPTER_EXCEEDS_TOTAL_VRAM: requires ${descriptor.vramRequiredMb} MB, total is ${totalVramMb} MB`,
		};
	}

	if (projectedAllocation > totalVramMb) {
		return {
			totalVramMb,
			allocatedVramMb: currentAllocatedMb,
			ornithActiveOn8090: currentOrnithActive,
			wslRapidsAvailable: true,
			canLoadAdapter: false,
			reason: `VRAM_BUDGET_EXCEEDED: projected ${projectedAllocation} MB exceeds 8192 MB. Gracefully release :8090 first.`,
		};
	}

	return {
		totalVramMb,
		allocatedVramMb: projectedAllocation,
		ornithActiveOn8090: currentOrnithActive,
		wslRapidsAvailable: true,
		canLoadAdapter: true,
	};
}

/**
 * Finite State Machine manager for QLoRA dynamic adapter swaps and inference routing.
 */
export class QLoraFsmSwapManagerV1 {
	private state: QLoraFsmState = 'IDLE';
	private activeAdapter: QLoraAdapterDescriptorV1 | null = null;
	private allocatedVramMb: number = 0;

	constructor(private readonly baseAllocatedVramMb: number = 4096) {
		this.allocatedVramMb = baseAllocatedVramMb;
	}

	getState(): QLoraFsmState {
		return this.state;
	}

	getActiveAdapter(): QLoraAdapterDescriptorV1 | null {
		return this.activeAdapter;
	}

	getAllocatedVramMb(): number {
		return this.allocatedVramMb;
	}

	/**
	 * Executes an atomic adapter swap with strict validation and VRAM admission guard.
	 */
	swapAdapter(
		candidate: QLoraAdapterDescriptorV1,
		options: {
			ornithActiveOn8090?: boolean;
			now?: Date;
		} = {},
	): QLoraSwapReceiptV1 {
		const now = options.now ?? new Date();
		this.state = 'VALIDATING';

		// 1. Schema and held-out evaluation score validation
		const validated = QLoraAdapterDescriptorV1Schema.safeParse(candidate);
		if (!validated.success) {
			this.state = 'REJECTED';
			throw new Error(`QLORA_DESCRIPTOR_VALIDATION_ERROR: ${validated.error.message}`);
		}

		if (candidate.heldOutEvalScore < candidate.minEvalThreshold) {
			this.state = 'REJECTED';
			throw new Error(
				`QLORA_EVAL_SCORE_BELOW_THRESHOLD: ${candidate.heldOutEvalScore} < ${candidate.minEvalThreshold}`,
			);
		}

		// 2. VRAM Guard check (8 GiB limit)
		const vramCheck = checkGpuVramGuard(
			candidate,
			options.ornithActiveOn8090 ?? true,
			this.baseAllocatedVramMb,
		);

		if (!vramCheck.canLoadAdapter) {
			this.state = 'REJECTED';
			throw new Error(`QLORA_SWAP_BLOCKED: ${vramCheck.reason}`);
		}

		// 3. Perform atomic state transition
		this.state = 'SWAPPING';
		const previousAdapterId = this.activeAdapter ? this.activeAdapter.adapterId : null;

		this.activeAdapter = validated.data;
		this.allocatedVramMb = this.baseAllocatedVramMb + candidate.vramRequiredMb;
		this.state = 'RESIDENT_GPU';

		const receiptId = createHash('sha256')
			.update(`${candidate.adapterId}:${candidate.adapterSha256}:${now.getTime()}`)
			.digest('hex');

		return QLoraSwapReceiptV1Schema.parse({
			schema: QLORA_FSM_SCHEMA_V1,
			receiptId,
			previousAdapterId,
			activeAdapterId: candidate.adapterId,
			state: this.state,
			vramAllocatedMb: this.allocatedVramMb,
			timestamp: now.toISOString(),
			canonicalAuthority: false,
			writesPerformed: false,
			trainingAuthorized: false,
			canonicalAdmission: 'NOT_ADMITTED',
		});
	}

	/**
	 * Evicts the active adapter back to IDLE state and frees VRAM.
	 */
	evictActiveAdapter(): void {
		this.activeAdapter = null;
		this.allocatedVramMb = this.baseAllocatedVramMb;
		this.state = 'EVICTED';
	}
}
