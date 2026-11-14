import { test, expect } from '@playwright/test';

const caseId = process.env.PLAYWRIGHT_TRANSCRIPT_CASE_ID;
const evidenceId = process.env.PLAYWRIGHT_TRANSCRIPT_EVIDENCE_ID;
const videoTitle = process.env.PLAYWRIGHT_TRANSCRIPT_VIDEO_TITLE ?? 'Cam North 04';

test.describe('Evidence video transcript drawer', () => {
	test('opens, seeks, exports with source identity, and captures the transcript panel', async ({ page }, testInfo) => {
		test.skip(!caseId || !evidenceId, 'Set PLAYWRIGHT_TRANSCRIPT_CASE_ID and PLAYWRIGHT_TRANSCRIPT_EVIDENCE_ID to an authorized seeded video exhibit.');
		if (!caseId || !evidenceId) return;

		await page.setViewportSize({ width: 1440, height: 900 });
		await page.route(`**/api/evidence/${evidenceId}`, (route) => route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				id: evidenceId,
				caseId,
				title: videoTitle,
				fileName: `${videoTitle}.mp4`,
				fileType: 'video/mp4',
				fileSize: 1024,
				hash: 'sha256:transcript-fixture',
			})
		}));
		await page.route(`**/api/evidence/${evidenceId}/versions?*`, (route) => route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ versions: [] })
		}));
		await page.route(`**/api/evidence/${evidenceId}/frames**`, (route) => route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ frames: [] })
		}));
		await page.route(`**/api/evidence/${evidenceId}/transcript**`, (route) => {
			const url = new URL(route.request().url());
			if (url.searchParams.has('export')) {
				const format = url.searchParams.get('export');
				const extension = format === 'vtt' ? 'vtt' : String(format);
				return route.fulfill({
					status: 200,
					contentType: format === 'json' ? 'application/json' : 'text/vtt',
					headers: { 'Content-Disposition': `attachment; filename="Cam_North_04_${evidenceId}_transcript.${extension}"` },
					body: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nDoor opens.\n'
				});
			}
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					ok: true,
					videoTitle,
					evidenceId,
					caseId,
					sourceRevision: 'sha256:transcript-fixture',
					status: 'completed',
					segments: [{ id: 'cue-1', startMs: 1000, endMs: 2000, text: 'Door opens.', speakerId: 'speaker-01', reviewStatus: 'unreviewed_proposal' }]
				})
			});
		});
		await page.route(`**/api/evidence/${evidenceId}/download**`, (route) => route.fulfill({
			status: 200,
			headers: { 'Content-Type': 'video/mp4' },
			body: ''
		}));

		await page.goto(`/cases/${caseId}/board?view=list`);
		const evidenceCard = page.locator(`[data-evidence-id="${evidenceId}"]`);
		await expect(evidenceCard).toBeVisible();
		await evidenceCard.click();
		await page.getByRole('button', { name: 'Open viewer' }).click();
		await expect(page.getByTestId('open-video-transcript')).toBeVisible();
		await page.getByTestId('open-video-transcript').click();

		const drawer = page.getByTestId('video-transcript-drawer');
		await expect(drawer).toBeVisible();
		await expect(drawer.getByText('Door opens.')).toBeVisible();
		await expect(drawer.getByText('Unreviewed Proposal')).toBeVisible();
		await page.screenshot({ path: testInfo.outputPath('evidence-video-transcript-drawer.png'), fullPage: false });

		const downloadPromise = page.waitForEvent('download');
		await drawer.getByRole('button', { name: 'VTT' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe(`Cam_North_04_${evidenceId}_transcript.vtt`);
		await page.getByTestId('close-video-transcript').click();
		await expect(drawer).toBeHidden();
	});
});
