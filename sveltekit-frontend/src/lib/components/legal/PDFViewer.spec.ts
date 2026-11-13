import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';

vi.mock('pdfjs-dist', () => {
	throw new Error('PDF.js unavailable in fallback test');
});

describe('PDFViewer native fallback', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('keeps direct open and download actions available when PDF.js fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { default: PDFViewer } = await import('./PDFViewer.svelte');
		render(PDFViewer, { props: { documentId: '11111111-1111-4111-8111-111111111111' } });

		const openLink = await screen.findByRole('link', { name: 'Try opening directly ↗' });
		const downloadLink = await screen.findByTestId('pdf-error-download');
		await waitFor(() => expect(downloadLink).toBeVisible());

		expect(openLink).toHaveAttribute('href', '/api/library/documents/11111111-1111-4111-8111-111111111111/pdf');
		expect(downloadLink).toHaveAttribute('href', '/api/library/documents/11111111-1111-4111-8111-111111111111/pdf?download=1');
		expect(downloadLink).toHaveAttribute('download');
	});
});
