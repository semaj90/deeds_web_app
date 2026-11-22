import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

// Global setup seeds PW-TEST cases through the authorized /api/cases path and writes their IDs here.
const idsFile = path.resolve('test-results/.playwright-test-case-ids.json');

test.use({ serviceWorkers: 'block', viewport: { width: 1360, height: 900 } });

// FIXME: the seeded case reaches the builder, but Prepare stays at "Workflow: needs input" (no request starts), so the cancel path is not exercised.
// Needs a seeded case with the brief the demo fixture supplies (actors, events, evidence). Unskip once that exists.
test.fixme('a pending plan preview request can be canceled on the authorized case route (CASE-SCENE-LIVE-02)', async ({ page }) => {
	const ids = JSON.parse(readFileSync(idsFile, 'utf8')).ids as string[];
	expect(ids.length).toBeGreaterThan(0);
	const caseId = ids[0];

	// Hold scene-reconstruction requests open so the cancel path runs while the request is in flight.
	await page.route('**/api/cases/*/scene-reconstruction/**', async () => {
		await new Promise(() => {});
	});

	await page.goto(`/cases/${caseId}/crime-scene`);
	const prepare = page.getByRole('button', { name: 'Prepare scene proposal' });
	await expect(prepare).toBeVisible({ timeout: 20_000 });
	await prepare.click();

	const cancel = page.getByRole('button', { name: 'Cancel preview preparation' });
	await expect(cancel).toBeVisible();
	await cancel.click();

	await expect(page.getByText('Preview preparation canceled.')).toBeVisible();
	await expect(page.getByText(/Proposal validated/)).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Prepare scene proposal' })).toBeEnabled();
});
