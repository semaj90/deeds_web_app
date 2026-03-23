import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/svelte';

import EvidenceViewModal from '$lib/components/evidence/EvidenceViewModal.svelte';

describe('EvidenceViewModal', () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('renders processing diagnostics from fetched evidence metadata', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				id: 'ev-123',
				title: 'Chain of custody photo',
				fileType: 'image/png',
				fileSize: 4096,
				createdAt: '2026-03-22T10:00:00.000Z',
				status: 'processed',
				metadata: JSON.stringify({
					processingDiagnostics: {
						startedAt: '2026-03-22T10:00:00.000Z',
						completedAt: '2026-03-22T10:00:05.000Z',
						stages: {
							extraction: {
								status: 'success',
								detail: 'OCR text extracted from uploaded image'
							},
							metadata_persist: {
								status: 'warning',
								detail: 'Metadata persisted after OCR fallback'
							}
						},
						warnings: [
							{
								stage: 'embedding',
								detail: 'Primary embedding model timed out; fallback used',
								at: '2026-03-22T10:00:03.000Z'
							}
						]
					}
				})
			})
		});

		vi.stubGlobal('fetch', fetchMock);

		render(EvidenceViewModal, {
			props: {
				evidenceId: 'ev-123',
				open: true
			}
		});

		await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/evidence/ev-123'));
		await screen.findByText('Processing Diagnostics');

		expect(screen.getByText('extraction')).toBeInTheDocument();
		expect(screen.getByText('metadata persist')).toBeInTheDocument();
		expect(screen.getByText('OCR text extracted from uploaded image')).toBeInTheDocument();
		expect(screen.getByText('Metadata persisted after OCR fallback')).toBeInTheDocument();
		expect(screen.getByText('1 warning')).toBeInTheDocument();
		expect(screen.getByText('Primary embedding model timed out; fallback used')).toBeInTheDocument();
	});
});