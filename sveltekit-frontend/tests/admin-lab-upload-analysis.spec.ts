import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.setTimeout(180_000);

const PNG_1X1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HwAFAAL/8y7e4QAAAABJRU5ErkJggg==',
	'base64'
);

test('admin lab upload, view, and analyze', async ({ page }) => {
	await page.goto('/admin/ai-dashboard/lab', { waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('heading', { name: 'AI Lab Console' })).toBeVisible();

	await page.getByRole('button', { name: /VLM Image Analysis/i }).click();
	await expect(page.getByText('Drop image for VLM analysis')).toBeVisible();

	const fileInput = page.locator('input[type="file"]');
	await fileInput.setInputFiles({
		name: 'admin-lab-upload.png',
		mimeType: 'image/png',
		buffer: PNG_1X1,
	});

	await expect(page.getByText('admin-lab-upload.png')).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('img.preview-img')).toBeVisible({ timeout: 30_000 });

	await page.getByRole('button', { name: /^Analyze$/ }).click();

	await expect(page.locator('.evidence-id')).toBeVisible({ timeout: 120_000 });
	await expect(page.locator('.evidence-id')).toContainText('Evidence:');

	await expect(page.locator('.vlm-text')).toBeVisible({ timeout: 120_000 });
	await expect(page.locator('.result-section').filter({ hasText: 'VLM Analysis' })).toBeVisible({
		timeout: 120_000,
	});

	const body = await page.textContent('body');
	expect(body).not.toContain('Upload Failed');
	expect(body).not.toContain('Analysis failed');
});

test('admin lab upload API diagnostic', async ({ request }) => {
	const minioHealth = await request.get('/api/health?service=minio');
	console.log('minio health status:', minioHealth.status());
	console.log('minio health body:', (await minioHealth.text()).slice(0, 500));

	const servicesHealth = await request.get('/api/health/services');
	console.log('services health status:', servicesHealth.status());
	console.log('services health body:', (await servicesHealth.text()).slice(0, 500));

	const casesRes = await request.get('/api/cases?limit=1');
	console.log('cases status:', casesRes.status());
	const casesBody = await casesRes.json().catch(() => ({}));
	const firstCaseId = casesBody?.data?.cases?.[0]?.id ?? casesBody?.cases?.[0]?.id ?? null;
	console.log('first case id:', firstCaseId);

	const res = await request.post('/api/evidence/upload', {
		multipart: {
			file: {
				name: 'admin-lab-upload.png',
				mimeType: 'image/png',
				buffer: PNG_1X1,
			},
			title: 'Admin Lab Upload Diagnostic',
		},
	});

	const body = await res.text().catch(() => '');
	console.log('admin-lab upload status:', res.status());
	console.log('admin-lab upload body:', body.slice(0, 500));

	if (firstCaseId) {
		const explicitCaseUpload = await request.post('/api/evidence/upload', {
			multipart: {
				file: {
					name: 'admin-lab-upload-case.png',
					mimeType: 'image/png',
					buffer: PNG_1X1,
				},
				caseId: firstCaseId,
				title: 'Admin Lab Upload With Case',
			},
		});
		const explicitBody = await explicitCaseUpload.text().catch(() => '');
		console.log('explicit case upload status:', explicitCaseUpload.status());
		console.log('explicit case upload body:', explicitBody.slice(0, 500));
	}

	expect(res.status()).toBeLessThan(500);
});
