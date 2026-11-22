import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

const requestScenePreviewV1 = vi.hoisted(() => vi.fn());

vi.mock('$lib/reconstruction/request-scene-preview-v1.js', () => ({
	requestScenePreviewV1,
	ScenePreviewRequestErrorV1: class extends Error {
		sourceStale = false;
	}
}));

import CaseScenePlanBuilder from './CaseScenePlanBuilder.svelte';

const caseId = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
	cleanup();
	requestScenePreviewV1.mockReset();
});

describe('CaseScenePlanBuilder preview cancel (CASE-SCENE-LIVE-02)', () => {
	it('cancels a pending preview request and discards its late reply', async () => {
		let resolveFirst: (value: unknown) => void = () => {};
		requestScenePreviewV1.mockImplementationOnce(
			() => new Promise((resolve) => { resolveFirst = resolve; })
		);

		const view = render(CaseScenePlanBuilder, {
			caseId,
			caseSceneIntake: null,
			evidenceItems: [],
		});

		await fireEvent.click(await view.findByRole('button', { name: 'Prepare scene proposal' }));
		await fireEvent.click(await view.findByRole('button', { name: 'Cancel preview preparation' }));

		await waitFor(() => expect(view.getByText('Preview preparation canceled.')).toBeTruthy());
		expect(requestScenePreviewV1).toHaveBeenCalledTimes(1);
		expect(requestScenePreviewV1.mock.calls[0][0].signal.aborted).toBe(true);

		// Late reply after cancellation must not surface as a validated proposal.
		resolveFirst({});
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(view.queryByText(/Proposal validated/)).toBeNull();
	});

	it('supersedes a canceled request: the old late reply cannot affect the new one', async () => {
		let resolveFirst: (value: unknown) => void = () => {};
		requestScenePreviewV1
			.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
			.mockImplementationOnce(() => new Promise(() => {}));

		const view = render(CaseScenePlanBuilder, { caseId, caseSceneIntake: null, evidenceItems: [] });

		await fireEvent.click(await view.findByRole('button', { name: 'Prepare scene proposal' }));
		await fireEvent.click(await view.findByRole('button', { name: 'Cancel preview preparation' }));
		await waitFor(() => expect(view.getByText('Preview preparation canceled.')).toBeTruthy());

		await fireEvent.click(await view.findByRole('button', { name: 'Prepare scene proposal' }));
		await waitFor(() => expect(requestScenePreviewV1).toHaveBeenCalledTimes(2));

		const first = requestScenePreviewV1.mock.calls[0][0].signal as AbortSignal;
		const second = requestScenePreviewV1.mock.calls[1][0].signal as AbortSignal;
		expect(first.aborted).toBe(true);
		expect(second.aborted).toBe(false);

		resolveFirst({});
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(view.queryByText(/Proposal validated/)).toBeNull();
		expect(view.getByRole('button', { name: 'Cancel preview preparation' })).toBeTruthy();
	});

	it('shows progress while the preview request is pending', async () => {
		requestScenePreviewV1.mockImplementationOnce(() => new Promise(() => {}));

		const view = render(CaseScenePlanBuilder, { caseId, caseSceneIntake: null, evidenceItems: [] });

		await fireEvent.click(await view.findByRole('button', { name: 'Prepare scene proposal' }));
		expect(await view.findByText('Checking selected evidence…')).toBeTruthy();
	});

	it('shows an actionable error and allows a retry that succeeds', async () => {
		requestScenePreviewV1
			.mockImplementationOnce(() => Promise.reject(new Error('Scene preview service unavailable')))
			.mockImplementationOnce(() => new Promise(() => {}));

		const view = render(CaseScenePlanBuilder, { caseId, caseSceneIntake: null, evidenceItems: [] });

		await fireEvent.click(await view.findByRole('button', { name: 'Prepare scene proposal' }));
		expect((await view.findByRole('alert')).textContent).toContain('Scene preview service unavailable');

		const retry = await view.findByRole('button', { name: 'Prepare scene proposal' });
		expect((retry as HTMLButtonElement).disabled).toBe(false);
		await fireEvent.click(retry);
		await waitFor(() => expect(requestScenePreviewV1).toHaveBeenCalledTimes(2));
	});
});
