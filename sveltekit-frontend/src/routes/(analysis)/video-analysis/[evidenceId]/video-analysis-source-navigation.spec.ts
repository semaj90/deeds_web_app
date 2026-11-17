import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VideoAnalysisPage from './+page.svelte';

const payload = {
	evidenceId: 'evidence-1',
	vlmAnalysis: null,
	frameAnalysis: [
		{ timestamp: 1, framePath: '/frame/0', description: 'First frame', objects: [], tags: [], confidence: 0.8, frameIndex: 0 },
		{ timestamp: 2, framePath: '/frame/1', description: 'Second frame', objects: ['person'], tags: [], confidence: 0.9, frameIndex: 1 },
	],
	sceneDetection: [{
		startTime: 1.9,
		endTime: 2.4,
		description: 'A source-linked event proposal',
		reviewState: 'UNREVIEWED_PROPOSAL',
		sourceReferences: [
			{ kind: 'frame_detection', referenceId: 'frame-ref-1', frameIndex: 1, timestampMs: 2000, label: 'person', confidence: 0.91 },
			{ kind: 'transcript_segment', referenceId: 'transcript-ref-1', startMs: 2100, endMs: 2400, text: 'Door closes.', segmentIndex: 3 },
		],
	}],
	videoMetadata: { duration: 5, width: 640, height: 360, fps: 24, codec: 'h264' },
	transcription: { text: 'Door closes.' },
	transcriptSegments: [{ startMs: 2100, endMs: 2400, text: 'Door closes.', language: 'en', confidence: 0.9, model: 'faster-whisper:base:int8' }],
	transcriptSummary: null,
	summaryRevision: null,
	keyFacts: [],
	aceAnalysis: null,
};

describe('video analysis source navigation', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
		HTMLElement.prototype.scrollIntoView = vi.fn();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('opens the cited frame while keeping the event an unreviewed proposal', async () => {
		render(VideoAnalysisPage, { props: { data: { evidenceId: 'evidence-1', title: 'Fixture video' } } });

		await fireEvent.click(await screen.findByRole('button', { name: /Scenes/ }));
		expect(screen.getByText('UNREVIEWED_PROPOSAL · machine-generated proposal')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /Frame 2 · 0:02 · person/ }));

		expect((screen.getByRole('button', { name: /Frames/ }).className)).toContain('active');
		const frameCards = screen.getAllByRole('button', { name: /frame at/i });
		expect(frameCards[1]?.className).toContain('selected');
	});

	it('opens the cited transcript segment and scrolls it into view', async () => {
		render(VideoAnalysisPage, { props: { data: { evidenceId: 'evidence-1', title: 'Fixture video' } } });

		await fireEvent.click(await screen.findByRole('button', { name: /Scenes/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Transcript 0:02–0:02: Door closes/ }));

		await waitFor(() => expect(screen.getByRole('button', { name: /Transcription/ }).className).toContain('active'));
		expect(screen.getByText('Door closes.').closest('li')?.id).toBe('transcript-2100');
		expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
	});
});
