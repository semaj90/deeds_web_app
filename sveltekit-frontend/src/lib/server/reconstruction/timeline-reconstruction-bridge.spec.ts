// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
	mapTimelineEventsToScenePrompt,
	buildTimelineReconstructionPayload,
	submitReconstructionToSidecar,
	buildComfyUIRenderJob,
	type TimelineEventInput,
} from './timeline-reconstruction-bridge.js';

describe('Timeline Reconstruction Bridge (CSP-102)', () => {
	const sampleEvents: TimelineEventInput[] = [
		{
			id: 'ev-1',
			type: 'evidence_upload',
			title: 'Ledger photograph',
			description: 'Digital image of altered ledger entries',
			actor: 'Officer Martinez',
			method: 'upload',
			reason: 'Preserve physical evidence',
			timestamp: '2026-10-31T09:15:00.000Z',
			metadata: { fileType: 'image/jpeg' },
		},
		{
			id: 'ev-2',
			type: 'note',
			title: 'Forensic audit note',
			description: 'Discrepancy observed in column balance',
			actor: 'Auditor Vance',
			method: 'manual',
			reason: 'Discrepancy reconciliation',
			timestamp: '2026-10-31T14:30:00.000Z',
		},
	];

	it('maps timeline events into a valid ScenePrompt (who, what, why, how)', () => {
		const prompt = mapTimelineEventsToScenePrompt(sampleEvents);

		expect(prompt.who).toContain('Officer Martinez');
		expect(prompt.who).toContain('Auditor Vance');
		expect(prompt.what).toContain('Ledger photograph');
		expect(prompt.what).toContain('Forensic audit note');
		expect(prompt.why).toContain('Preserve physical evidence');
		expect(prompt.how).toContain('upload');
		expect(prompt.how).toContain('manual');
		expect(prompt.time_of_day).toBe('morning');
	});

	it('returns fallback prompt when timeline is empty', () => {
		const prompt = mapTimelineEventsToScenePrompt([]);
		expect(prompt.who).toBe('Unknown participants');
		expect(prompt.what).toBe('Forensic incident timeline');
		expect(prompt.why).toBe('Under investigation');
	});

	it('builds a full ReconstructRequest payload with style and defaults', () => {
		const payload = buildTimelineReconstructionPayload(sampleEvents, {
			mode: 'i2v',
			seed: 42,
		});

		expect(payload.mode).toBe('i2v');
		expect(payload.seed).toBe(42);
		expect(payload.style).toContain('photorealistic crime scene');
		expect(payload.include_depth).toBe(true);
		expect(payload.scene.who).toContain('Officer Martinez');
	});

	it('submits payload to sidecar and parses successful response', async () => {
		const payload = buildTimelineReconstructionPayload(sampleEvents);
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				mode: 't2v',
				video_prompt: 'A cinematic crime scene reconstruction...',
				timings: { prompt_ms: 120 },
			}),
		});

		const result = await submitReconstructionToSidecar(
			payload,
			mockFetch as unknown as typeof fetch,
			'http://localhost:8092'
		);

		expect(result.ok).toBe(true);
		expect(result.status).toBe('completed');
		expect(mockFetch).toHaveBeenCalledWith(
			'http://localhost:8092/reconstruct',
			expect.objectContaining({
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			})
		);
	});

	it('handles sidecar unreachable failure gracefully without throwing', async () => {
		const payload = buildTimelineReconstructionPayload(sampleEvents);
		const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

		const result = await submitReconstructionToSidecar(
			payload,
			mockFetch as unknown as typeof fetch,
			'http://localhost:8092'
		);

		expect(result.ok).toBe(false);
		expect(result.status).toBe('unavailable');
		expect(result.error).toContain('ECONNREFUSED');
	});

	it('builds a comfyui.render queue envelope for RabbitMQ dispatch', () => {
		const prompt = mapTimelineEventsToScenePrompt(sampleEvents);
		const job = buildComfyUIRenderJob('case-123', prompt, { customNode: 1 });

		expect(job.queue).toBe('comfyui.render');
		expect(job.caseId).toBe('case-123');
		expect(job.jobType).toBe('timeline_reconstruction');
		expect(job.payload.scene.who).toContain('Officer Martinez');
		expect(job.payload.workflow).toEqual({ customNode: 1 });
		expect(job.payload.submittedAt).toBeDefined();
	});
});
