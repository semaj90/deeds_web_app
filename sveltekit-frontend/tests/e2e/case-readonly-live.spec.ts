import { test, expect } from '@playwright/test';

const requestedCaseId = process.env.PW_CASE_ID ?? '814f6fc8-3321-4bab-a4a0-2d8196cf9153';
const runtimeErrors: string[] = [];
const failedRequests: string[] = [];

test.beforeEach(async ({ page }) => {
	runtimeErrors.length = 0;
	failedRequests.length = 0;
	page.on('pageerror', (error) => runtimeErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') runtimeErrors.push(message.text());
	});
	page.on('response', (response) => {
		if (response.status() >= 500) failedRequests.push(`${response.status()} ${response.url()}`);
	});
});

async function findVisibleCaseId(page: import('@playwright/test').Page): Promise<string | null> {
	const listing = await page.goto('/cases', { waitUntil: 'commit', timeout: 30_000 });
	console.log(`case listing navigation: ${listing?.status()} ${page.url()}`);
	console.log(`case listing title=${await page.title()} body=${(await page.locator('body').innerText().catch(() => '')).slice(0, 360)}`);
	const caseLinks = await page.locator('a[href^="/cases/"]').evaluateAll((anchors) =>
		anchors.map((anchor) => (anchor as HTMLAnchorElement).getAttribute('href') ?? '')
	);
	console.log(`case listing links: ${JSON.stringify(caseLinks.slice(0, 12))}`);
	const uuid = /\/cases\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/board)?(?:[?#]|$)/i;
	const visible = caseLinks.map((href) => href.match(uuid)?.[1]).find(Boolean);
	return visible ?? null;
}

test('case evidence board opens a local image preview without submitting an upload', async ({ page }) => {
	const caseId = (await findVisibleCaseId(page)) ?? requestedCaseId;
	console.log(`board case id: ${caseId}`);
	const response = await page.goto(`/cases/${caseId}/board`, { waitUntil: 'commit', timeout: 30_000 });
	console.log(`board navigation: ${response?.status()} ${page.url()}`);
	try {
		await expect(page.getByRole('heading', { name: /evidence board/i }).first()).toBeVisible({ timeout: 12_000 });
	} catch (error) {
		console.log(`board title=${await page.title()} body=${(await page.locator('body').innerText().catch(() => '')).slice(0, 500)}`);
		console.log(`browser errors: ${JSON.stringify(runtimeErrors)}`);
		console.log(`server failures: ${JSON.stringify(failedRequests)}`);
		throw error;
	}

	const detective = page.getByRole('button', { name: /^detective$/i });
	await expect(detective).toBeVisible();
	await detective.click();
	const gallery = page.getByTestId('evidence-carousel-gallery');
	await expect(gallery).toBeVisible();

	// A 1x1 PNG exercises the actual browser file-input and modal preview paths.
	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS8sAAAAASUVORK5CYII=',
		'base64',
	);
	await gallery.getByLabel('Upload evidence files').setInputFiles({
		name: 'playwright-local-preview.png',
		mimeType: 'image/png',
		buffer: png,
	});
	const expand = page.getByRole('button', { name: /^expand local-001$/i });
	await expect(expand).toBeVisible();
	await expand.click();

	const viewer = page.getByTestId('expanded-evidence-viewer');
	await expect(viewer).toBeVisible();
	await expect(viewer.getByText(/local preview/i).first()).toBeVisible();
	const previewImage = viewer.locator('img').first();
	await expect(previewImage).toBeVisible();
	const imageState = await previewImage.evaluate((img: HTMLImageElement) => ({
		src: img.currentSrc,
		complete: img.complete,
		naturalWidth: img.naturalWidth,
	}));
	console.log(`local preview image: ${JSON.stringify(imageState)}`);
	expect(imageState.src).toMatch(/^blob:/);
	expect(imageState.naturalWidth).toBeGreaterThan(0);
	await expect(page.getByTestId('expanded-evidence-viewer')).toContainText('playwright-local-preview.png');
	console.log(`browser errors: ${JSON.stringify(runtimeErrors)}`);
	console.log(`server failures: ${JSON.stringify(failedRequests)}`);
});

test('case chat SSR does not fail while loading case-scoped citations', async ({ page }) => {
	const caseId = (await findVisibleCaseId(page)) ?? requestedCaseId;
	const response = await page.goto(`/cases/${caseId}/chat`, { waitUntil: 'domcontentloaded' });
	const status = response?.status() ?? 0;
	const body = await page.locator('body').innerText().catch(() => '');
	console.log(`chat navigation: ${status} ${page.url()} body=${body.slice(0, 240)}`);
	console.log(`browser errors: ${JSON.stringify(runtimeErrors)}`);
	console.log(`server failures: ${JSON.stringify(failedRequests)}`);
	// Keep route/authorization failures distinguishable from the reported SQL 500.
	expect(status, `case chat returned ${status}; inspect captured response and server log`).toBe(200);
	if (status === 200) {
		await expect(page.locator('body')).not.toContainText(/Failed query: select .* from "citations"/i);
	}
});
