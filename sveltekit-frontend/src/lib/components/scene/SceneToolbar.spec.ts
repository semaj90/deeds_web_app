// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import SceneToolbar from './SceneToolbar.svelte';

describe('SceneToolbar', () => {
	it('exposes a labelled toolbar with grouped actions', () => {
		render(SceneToolbar, { props: { onResetView: () => {}, onTogglePlaceMarker: () => {} } });
		expect(screen.getByRole('toolbar', { name: 'Scene controls' })).toBeTruthy();
		expect(screen.getByRole('group', { name: 'View' })).toBeTruthy();
		expect(screen.getByRole('group', { name: 'Edit' })).toBeTruthy();
	});

	it('calls the reset and placement handlers on click', async () => {
		const onResetView = vi.fn();
		const onTogglePlaceMarker = vi.fn();
		render(SceneToolbar, { props: { onResetView, onTogglePlaceMarker } });
		await fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Place marker' }));
		expect(onResetView).toHaveBeenCalledTimes(1);
		expect(onTogglePlaceMarker).toHaveBeenCalledTimes(1);
	});

	it('reflects marker mode with aria-pressed and a stop label', () => {
		render(SceneToolbar, { props: { markerActive: true, onTogglePlaceMarker: () => {} } });
		const button = screen.getByRole('button', { name: 'Stop placing markers' });
		expect(button.getAttribute('aria-pressed')).toBe('true');
	});

	it('disables everything while busy', () => {
		render(SceneToolbar, { props: { disabled: true, onResetView: () => {}, onTogglePlaceMarker: () => {} } });
		expect((screen.getByRole('button', { name: 'Reset view' }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'Place marker' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('shows the reason and disables placement when it is blocked', () => {
		render(SceneToolbar, {
			props: { placementDisabledReason: 'Open a case exhibit first.', onTogglePlaceMarker: () => {} }
		});
		expect((screen.getByRole('button', { name: 'Place marker' }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByRole('status').textContent).toContain('Open a case exhibit first.');
	});
});
