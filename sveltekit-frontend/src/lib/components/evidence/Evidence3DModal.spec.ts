import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./DepthReliefViewer.svelte', () => ({ default: vi.fn() }));

describe('Evidence3DModal annotation toolbar', () => {
	afterEach(() => cleanup());

	it('keeps marker mode and pin animation independently controllable above the canvas', async () => {
		const { default: Evidence3DModal } = await import('./Evidence3DModal.svelte');
		render(Evidence3DModal, { props: { imageUrl: null, embedded: true } });

		const toolbar = screen.getByRole('toolbar', { name: 'Image annotation tools' });
		const markerButton = screen.getByRole('button', { name: 'Place marker' });
		const motionButton = screen.getByRole('button', { name: 'Animate marker pins' });
		expect(toolbar.nextElementSibling?.classList.contains('e3d-stage')).toBe(true);
		expect(markerButton.getAttribute('aria-pressed')).toBe('false');
		expect(motionButton.getAttribute('aria-pressed')).toBe('true');

		await fireEvent.click(markerButton);
		await fireEvent.click(motionButton);
		expect(markerButton.getAttribute('aria-pressed')).toBe('true');
		expect(motionButton.getAttribute('aria-pressed')).toBe('false');
	});
});
