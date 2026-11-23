import { describe, expect, it } from 'vitest';
import {
	admitGpuResidencyLeaseV1,
	validateSubpromptResponseAgainstRequestV1,
	type SubpromptRequestBoundaryV1
} from './subprompt-vram-contract-v1.js';

describe('Subprompt Contract & GPU Residency Budget Guard (SUBPROMPT-CONTRACT-01 / MEM-05)', () => {
	it('enforces ContextManifest checksum and allowedEvidenceIds on subprompt responses', () => {
		const req: SubpromptRequestBoundaryV1 = {
			schema: 'atlas.subprompt-request.v1',
			requestId: 'req-1',
			contextManifestChecksum: `sha256:${'a'.repeat(64)}`,
			acePacketKey: 'ace:packet:run-1',
			allowedEvidenceIds: ['ev-1', 'ev-2'],
			promptSurface: 'model_proposal',
			maxOutputTokens: 1024
		};

		expect(() =>
			validateSubpromptResponseAgainstRequestV1(req, {
				schema: 'atlas.subprompt-response.v1',
				requestId: 'req-1',
				contextManifestChecksum: `sha256:${'a'.repeat(64)}`,
				citedEvidenceIds: ['ev-1'],
				canonicalAuthority: false,
				proposalPayload: { ok: true }
			})
		).not.toThrow();

		// Rejects out-of-scope evidence citation
		expect(() =>
			validateSubpromptResponseAgainstRequestV1(req, {
				schema: 'atlas.subprompt-response.v1',
				requestId: 'req-1',
				contextManifestChecksum: `sha256:${'a'.repeat(64)}`,
				citedEvidenceIds: ['ev-999'],
				canonicalAuthority: false,
				proposalPayload: {}
			})
		).toThrow(/SUBPROMPT_UNALLOWED_EVIDENCE_ID:ev-999/);
	});

	it('fails closed with GPU_RESIDENCY_BUDGET_EXCEEDED when :8090 leaves insufficient VRAM', () => {
		// Current RTX 3060 Ti headroom: 1348 MiB free while :8090 is loaded
		expect(() =>
			admitGpuResidencyLeaseV1({
				workerId: 'cutile-reranker',
				requiredMiB: 1500,
				freeVramMiB: 1348
			})
		).toThrow(/GPU_RESIDENCY_BUDGET_EXCEEDED/);

		const admitted = admitGpuResidencyLeaseV1({
			workerId: 'mlp-small-batch',
			requiredMiB: 512,
			freeVramMiB: 1348
		});
		expect(admitted.admitted).toBe(true);
		expect(admitted.remainingVramMiB).toBe(836);
	});
});
