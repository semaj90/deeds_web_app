/**
 * Parent Atlas Subprompt & VRAM Residency Guard Contract (v1)
 *
 * Implements:
 * - SUBPROMPT-CONTRACT-01: Serialized request/response boundary carrying
 *   ContextManifest checksum, ACE packet key, and allowed evidence IDs.
 * - MEM-04 / MEM-05: Single VRAM budget guard failing closed with
 *   `GPU_RESIDENCY_BUDGET_EXCEEDED` before expected OOM when :8090 is resident.
 */

import { z } from 'zod';

const sha256Prefixed = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const SubpromptRequestBoundaryV1Schema = z
	.object({
		schema: z.literal('atlas.subprompt-request.v1'),
		requestId: z.string().min(1),
		contextManifestChecksum: sha256Prefixed,
		acePacketKey: z.string().regex(/^ace:packet:[a-zA-Z0-9:_-]+$/),
		allowedEvidenceIds: z.array(z.string().min(1)).max(256),
		promptSurface: z.enum(['orchestration', 'evidence_acquisition', 'model_proposal']),
		maxOutputTokens: z.number().int().min(1).max(8192)
	})
	.strict();

export type SubpromptRequestBoundaryV1 = z.infer<typeof SubpromptRequestBoundaryV1Schema>;

export const SubpromptResponseBoundaryV1Schema = z
	.object({
		schema: z.literal('atlas.subprompt-response.v1'),
		requestId: z.string().min(1),
		contextManifestChecksum: sha256Prefixed,
		citedEvidenceIds: z.array(z.string().min(1)),
		canonicalAuthority: z.literal(false),
		proposalPayload: z.unknown()
	})
	.strict();

export type SubpromptResponseBoundaryV1 = z.infer<typeof SubpromptResponseBoundaryV1Schema>;

export function validateSubpromptResponseAgainstRequestV1(
	req: SubpromptRequestBoundaryV1,
	res: SubpromptResponseBoundaryV1
): void {
	const parsedReq = SubpromptRequestBoundaryV1Schema.parse(req);
	const parsedRes = SubpromptResponseBoundaryV1Schema.parse(res);

	if (parsedRes.requestId !== parsedReq.requestId) {
		throw new Error('SUBPROMPT_REQUEST_ID_MISMATCH');
	}
	if (parsedRes.contextManifestChecksum !== parsedReq.contextManifestChecksum) {
		throw new Error('SUBPROMPT_MANIFEST_CHECKSUM_MISMATCH');
	}
	const allowed = new Set(parsedReq.allowedEvidenceIds);
	for (const cited of parsedRes.citedEvidenceIds) {
		if (!allowed.has(cited)) {
			throw new Error(`SUBPROMPT_UNALLOWED_EVIDENCE_ID:${cited}`);
		}
	}
}

export interface GpuResidencyLeaseRequestV1 {
	readonly workerId: string;
	readonly requiredMiB: number;
	readonly freeVramMiB: number;
	readonly safetyMarginMiB?: number;
}

export interface GpuResidencyLeaseReceiptV1 {
	readonly admitted: true;
	readonly workerId: string;
	readonly requiredMiB: number;
	readonly remainingVramMiB: number;
}

/**
 * MEM-04 / MEM-05: Fail closed with `GPU_RESIDENCY_BUDGET_EXCEEDED` before
 * launching a CUDA/cuTile/MLP/cuVS job that would OOM the 8 GiB RTX 3060 Ti.
 */
export function admitGpuResidencyLeaseV1(
	req: GpuResidencyLeaseRequestV1
): GpuResidencyLeaseReceiptV1 {
	const margin = req.safetyMarginMiB ?? 256;
	if (!Number.isFinite(req.requiredMiB) || req.requiredMiB <= 0) {
		throw new RangeError('GPU_REQUIRED_MIB_INVALID');
	}
	if (!Number.isFinite(req.freeVramMiB) || req.freeVramMiB < 0) {
		throw new RangeError('GPU_FREE_VRAM_INVALID');
	}
	if (req.requiredMiB + margin > req.freeVramMiB) {
		throw new Error(
			`GPU_RESIDENCY_BUDGET_EXCEEDED: worker '${req.workerId}' requested ${req.requiredMiB} MiB + ${margin} MiB margin > ${req.freeVramMiB} MiB free`
		);
	}
	return {
		admitted: true,
		workerId: req.workerId,
		requiredMiB: req.requiredMiB,
		remainingVramMiB: req.freeVramMiB - req.requiredMiB
	};
}
