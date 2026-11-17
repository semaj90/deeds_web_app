import { expect, test, type Page } from '@playwright/test';

const caseId = process.env.PW_EVIDENCE_CASE_ID;
const imageEvidenceId = process.env.PW_EVIDENCE_IMAGE_ID;
const videoEvidenceId = process.env.PW_EVIDENCE_VIDEO_ID;
const imageSourceRevision = process.env.PW_EVIDENCE_IMAGE_REVISION;
const videoSourceRevision = process.env.PW_EVIDENCE_VIDEO_REVISION;
const videoFindingSeconds = Number(process.env.PW_EVIDENCE_VIDEO_FINDING_SECONDS);
const authenticatedEvidenceFixtureReady = Boolean(
	process.env.PW_EVIDENCE_STORAGE_STATE &&
	caseId &&
	imageEvidenceId &&
	videoEvidenceId &&
	imageSourceRevision &&
	videoSourceRevision &&
	Number.isFinite(videoFindingSeconds) &&
	videoFindingSeconds >= 0,
);

async function openCaseEvidenceViewer(page: Page, evidenceId: string): Promise<void> {
	const response = await page.goto(`/cases/${encodeURIComponent(caseId!)}/board?evidenceId=${encodeURIComponent(evidenceId)}`);
	expect(response?.status(), 'the authenticated case board must load').toBe(200);

	const card = page.locator(`[data-evidence-id="${evidenceId}"]`);
	await expect(card, 'the exhibit must belong to this case').toBeVisible();
	await card.click();
	await page.getByRole('button', { name: 'Open viewer' }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('Review image and video analysis findings in their source context', () => {
	test.skip(
		!authenticatedEvidenceFixtureReady,
		'Set PW_EVIDENCE_STORAGE_STATE and the case, image/video evidence IDs, source revisions, and video finding time for an authorized read-only fixture.',
	);

	test('an image finding opens the admitted image revision and highlights its original region', async ({ page }) => {
		await openCaseEvidenceViewer(page, imageEvidenceId!);

		const sourceImage = page.locator('img.preview-img');
		await expect(sourceImage).toBeVisible();
		await expect.poll(() => sourceImage.getAttribute('src')).toContain(`/api/evidence/${imageEvidenceId}/download`);
		await expect(sourceImage.getAttribute('src')).resolves.toContain(`caseId=${caseId}`);
		await expect(page.getByTestId('evidence-source-revision')).toHaveText(imageSourceRevision!);

		const sidebar = page.getByTestId('evidence-analysis-sidebar');
		await expect(sidebar, 'persistent findings must load for the selected source revision').toBeVisible();
		const finding = sidebar.getByTestId('evidence-analysis-finding').first();
		await expect(finding).toBeVisible();
		await expect(finding).toHaveAttribute('data-source-revision', imageSourceRevision!);
		await expect(finding.getByTestId('finding-model-revision')).not.toBeEmpty();
		await expect(finding.getByTestId('finding-preprocessing-revision')).not.toBeEmpty();

		await finding.click();
		const sourceRegion = page.getByTestId('finding-source-region');
		await expect(sourceRegion).toBeVisible();
		await expect(sourceRegion).toHaveAttribute('data-coordinate-space', 'source-image');
	});

	test('a video finding seeks to its source time and retains source revision provenance', async ({ page }) => {
		await openCaseEvidenceViewer(page, videoEvidenceId!);

		const player = page.locator('video.video-player');
		await expect(player).toBeVisible();
		await expect(page.getByTestId('evidence-source-revision')).toHaveText(videoSourceRevision!);
		const sidebar = page.getByTestId('evidence-analysis-sidebar');
		await expect(sidebar, 'timestamped findings must be available beside the source video').toBeVisible();
		const finding = sidebar.getByTestId('evidence-analysis-finding').filter({ has: page.getByTestId('finding-source-timestamp') }).first();
		await expect(finding).toBeVisible();
		await expect(finding).toHaveAttribute('data-source-revision', videoSourceRevision!);

		const timestamp = finding.getByTestId('finding-source-timestamp');
		await expect(timestamp).toBeVisible();
		await expect(finding).toHaveAttribute('data-source-time-seconds', String(videoFindingSeconds));
		await finding.click();
		await expect.poll(() => player.evaluate((video: HTMLVideoElement) => video.currentTime), { timeout: 5_000 })
			.toBeGreaterThanOrEqual(videoFindingSeconds - 0.1);
		await expect.poll(() => player.evaluate((video: HTMLVideoElement) => video.currentTime), { timeout: 5_000 })
			.toBeLessThanOrEqual(videoFindingSeconds + 0.1);
		await expect(finding).toHaveAttribute('aria-current', 'true');
		await expect(finding.getByTestId('finding-review-state')).toContainText(/unreviewed|proposal/i);
	});
});
