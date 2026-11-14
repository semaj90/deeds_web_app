import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvidenceTranscriptPanel from './EvidenceTranscriptPanel.svelte';

const mockSegments = [
	{
		id: 'seg-1',
		startMs: 1000,
		endMs: 3200,
		text: 'The suspect approached the exterior gate at approximately 14:02.',
		speakerId: 'Detective Miller',
		confidence: 0.95,
		reviewStatus: 'unreviewed_proposal' as const,
	},
	{
		id: 'seg-2',
		startMs: 3500,
		endMs: 6000,
		text: 'A keycard was presented to the RFID reader.',
		speakerId: 'Officer Chen',
		confidence: 0.92,
		reviewStatus: 'approved' as const,
	},
	{
		id: 'seg-3',
		startMs: 6500,
		endMs: 9000,
		text: 'Server room door opened 3 seconds later.',
		speakerId: 'Detective Miller',
		confidence: 0.88,
		reviewStatus: 'unreviewed_proposal' as const,
	},
];

describe('EvidenceTranscriptPanel — YouTube-Style Interactive Video Transcripts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				ok: true,
				videoTitle: 'CCTV Corridor Feed',
				evidenceId: 'ev-video-001',
				sourceRevision: 'sha256:fixture-source-revision',
				analysisRevision: 'video-analysis-v1:fixture-analysis-revision',
				status: 'completed',
				segments: mockSegments,
			}),
		} as Response);
	});

	it('toggles Show transcript / Hide transcript on click and loads cues', async () => {
		render(EvidenceTranscriptPanel, {
			props: {
				evidenceId: 'ev-video-001',
				initialOpen: false,
			},
		});

		const toggleBtn = screen.getByRole('button', { name: /Transcript/i });
		expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');

		// Click to expand
		await fireEvent.click(toggleBtn);
		expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');

		await waitFor(() => {
			expect(screen.getByText(/The suspect approached the exterior gate/i)).toBeTruthy();
			expect(screen.getAllByText(/Detective Miller/i).length).toBeGreaterThan(0);
			expect(screen.getByTestId('transcript-provenance').textContent).toContain('sha256:fixture-source-revision');
		});
	});

	it('highlights active transcript cue matching current video time and seeks video on click', async () => {
		const onSeek = vi.fn();
		render(EvidenceTranscriptPanel, {
			props: {
				evidenceId: 'ev-video-001',
				currentTimeMs: 4000, // Matches seg-2 (3500-6000ms)
				initialOpen: true,
				onSeek,
			},
		});

		await waitFor(() => {
			expect(screen.getByText(/A keycard was presented to the RFID reader/i)).toBeTruthy();
		});

		// Find the segment card
		const seg2Card = document.querySelector('[data-segment-id="seg-2"]');
		expect(seg2Card).toBeTruthy();
		expect(seg2Card?.classList.contains('active')).toBe(true);

		// Click timestamp to seek
		const seekBtn = screen.getByRole('button', { name: /Seek to 0:01/i });
		await fireEvent.click(seekBtn);
		expect(onSeek).toHaveBeenCalledWith(1000);
	});

	it('filters cues by text search and speaker without mutating original list', async () => {
		render(EvidenceTranscriptPanel, {
			props: {
				evidenceId: 'ev-video-001',
				initialOpen: true,
			},
		});

		await waitFor(() => {
			expect(screen.getByText(/The suspect approached the exterior gate/i)).toBeTruthy();
		});

		// Search for "keycard"
		const searchInput = screen.getByLabelText(/Search transcript/i);
		await fireEvent.input(searchInput, { target: { value: 'keycard' } });

		expect(screen.getByText(/A keycard was presented to the RFID reader/i)).toBeTruthy();
		expect(screen.queryByText(/The suspect approached the exterior gate/i)).toBeNull();

		// Filter by speaker
		const speakerSelect = screen.getByLabelText(/Speaker:/i);
		await fireEvent.change(speakerSelect, { target: { value: 'Officer Chen' } });
		expect(screen.getAllByText(/Officer Chen/i).length).toBeGreaterThan(0);
	});

	it('renders truthful silent video state when video has no audio', async () => {
		(globalThis.fetch as any).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				ok: true,
				videoTitle: 'Silent CCTV Feed',
				evidenceId: 'ev-silent-002',
				status: 'no_audio',
				segments: [],
			}),
		});

		render(EvidenceTranscriptPanel, {
			props: {
				evidenceId: 'ev-silent-002',
				initialOpen: true,
			},
		});

		await waitFor(() => {
			expect(screen.getByText(/Silent Video · No Audio/i)).toBeTruthy();
			expect(screen.getByText(/No audio stream detected/i)).toBeTruthy();
		});
	});

	it('shows unreviewed proposal badge and supports segment approval', async () => {
		const onSegmentReviewed = vi.fn();
		render(EvidenceTranscriptPanel, {
			props: {
				evidenceId: 'ev-video-001',
				initialOpen: true,
				onSegmentReviewed,
			},
		});

		await waitFor(() => {
			expect(screen.getAllByText(/Unreviewed/i).length).toBeGreaterThan(0);
		});

		const approveBtns = screen.getAllByRole('button', { name: /Approve/i });
		expect(approveBtns.length).toBeGreaterThan(0);

		// Mock the review POST call
		(globalThis.fetch as any).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ ok: true, segmentId: 'seg-1', reviewStatus: 'approved' }),
		});

		await fireEvent.click(approveBtns[0]);
		await waitFor(() => {
			expect(onSegmentReviewed).toHaveBeenCalledWith('seg-1', 'approved');
		});
	});

	it('triggers export links for VTT, SRT, TXT, and JSON formats', async () => {
		const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

		render(EvidenceTranscriptPanel, {
			props: {
				evidenceId: 'ev-video-001',
				initialOpen: true,
			},
		});

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'VTT' })).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'VTT' }));
		expect(windowOpenSpy).toHaveBeenCalledWith('/api/evidence/ev-video-001/transcript?export=vtt', '_blank');

		await fireEvent.click(screen.getByRole('button', { name: 'SRT' }));
		expect(windowOpenSpy).toHaveBeenCalledWith('/api/evidence/ev-video-001/transcript?export=srt', '_blank');

		windowOpenSpy.mockRestore();
	});
});
