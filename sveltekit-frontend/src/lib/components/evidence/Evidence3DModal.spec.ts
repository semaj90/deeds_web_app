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

	it('exposes native, half-resolution, and retro sampling choices in the evidence workspace', async () => {
		const { default: Evidence3DModal } = await import('./Evidence3DModal.svelte');
		render(Evidence3DModal, { props: { imageUrl: null, embedded: true } });

		const sampling = screen.getByRole('group', { name: 'Display sampling' });
		const native = screen.getByRole('button', { name: 'Native' });
		const half = screen.getByRole('button', { name: 'Half' });
		const retro = screen.getByRole('button', { name: 'Retro' });
		expect(sampling).toBeTruthy();
		expect(native.getAttribute('aria-pressed')).toBe('true');

		await fireEvent.click(half);
		expect(half.getAttribute('aria-pressed')).toBe('true');
		expect(native.getAttribute('aria-pressed')).toBe('false');
		await fireEvent.click(retro);
		expect(retro.getAttribute('aria-pressed')).toBe('true');
		expect(half.getAttribute('aria-pressed')).toBe('false');
	});

	it('does not offer the SPZ source route for a case-linked image exhibit', async () => {
		const { default: Evidence3DModal } = await import('./Evidence3DModal.svelte');
		render(Evidence3DModal, { props: { imageUrl: null, embedded: true, caseId: 'case-1', evidenceId: 'image-evidence-1' } });
		expect(screen.queryByRole('button', { name: '3D SPZ' })).toBeNull();
	});

	it('offers the case SPZ viewer only for a verified SPZ source and switches back to image relief', async () => {
		const { default: Evidence3DModal } = await import('./Evidence3DModal.svelte');
		render(Evidence3DModal, { props: { imageUrl: null, embedded: true, caseId: 'case-1', evidenceId: 'evidence-1', spzSourceEligible: true } });

		const spzButton = screen.getByRole('button', { name: '3D SPZ' });
		expect(spzButton.getAttribute('aria-pressed')).toBe('false');
		await fireEvent.click(spzButton);
		expect(screen.getByRole('region', { name: 'Case evidence Gaussian splat viewer' })).toBeTruthy();
		expect(screen.getByText(/source-frame hypothesis anchors keyed to the verified SPZ hash/)).toBeTruthy();
		expect(spzButton.getAttribute('aria-pressed')).toBe('true');

		await fireEvent.click(screen.getByRole('button', { name: 'Image relief' }));
		expect(screen.queryByRole('region', { name: 'Case evidence Gaussian splat viewer' })).toBeNull();
		expect(spzButton.getAttribute('aria-pressed')).toBe('false');
	});
});
