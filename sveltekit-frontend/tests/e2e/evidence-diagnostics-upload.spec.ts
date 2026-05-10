import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

// Port 5434 = deeds-postgres-prod-proxy → legal-ai-postgres container.
// Port 5432 on the host is squatted by a native Windows Postgres with a different schema.
// Always route through 5434 unless DATABASE_URL explicitly overrides.
const DB_URL =
	process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';
// evidence.uploaded_by is integer (FK to users.id), distinct from evidence.user_id (uuid).
// The seeded dev/bypass user has integer id=1; UUID DEV_USER_ID is for the user_id column only.
const DEV_USER_INT_ID = 1;
const pool = new pg.Pool({ connectionString: DB_URL });
const cleanupEvidenceIds = new Set<string>();

async function loadSeededCaseId(): Promise<string> {
	const result = await pool.query<{ id: string }>(
		"SELECT id FROM cases WHERE title LIKE '[PW-TEST]%' ORDER BY created_at ASC LIMIT 1"
	);

	const caseId = result.rows[0]?.id;
	expect(caseId).toBeTruthy();
	return caseId;
}

async function stubCompletedOnboarding(page: Page): Promise<void> {
	await page.route('**/api/onboarding', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				hasCompletedOnboarding: true,
				onboardingStep: 9,
			}),
		});
	});
}

async function insertEvidenceWithDiagnostics(
	caseId: string,
	title: string,
	fileName: string
): Promise<string> {
	const evidenceNumber = `PW-DIAG-${Date.now().toString(36).toUpperCase()}`;
	const metadata = {
		processingDiagnostics: {
			startedAt: '2026-03-22T10:00:00.000Z',
			completedAt: '2026-03-22T10:00:05.000Z',
			stages: {
				extraction: {
					status: 'success',
					detail: 'OCR text extracted from uploaded exhibit',
				},
				metadata_persist: {
					status: 'warning',
					detail: 'Metadata persisted after OCR fallback',
				},
			},
			warnings: [
				{
					stage: 'embedding',
					detail: 'Primary embedding model timed out; fallback used',
					at: '2026-03-22T10:00:03.000Z',
				},
			],
		},
	};

	const result = await pool.query<{ id: string }>(
		`INSERT INTO evidence (
			case_id,
			evidence_number,
			user_id,
			uploaded_by,
			title,
			summary,
			description,
			evidence_type,
			file_url,
			file_name,
			file_type,
			file_size,
			hash,
			uploaded_at,
			mime_type,
			type,
			status,
			metadata,
			created_at,
			updated_at,
			collected_at
		) VALUES (
			$1,
			$2,
			$3,
			$4,
			$5,
			$6,
			$6,
			$7,
			$8,
			$9,
			$10,
			$11,
			$12,
			NOW(),
			$13,
			$14,
			$15,
			$16::jsonb,
			NOW(),
			NOW(),
			NOW()
		) RETURNING id`,
		[
			caseId,
			evidenceNumber,
			DEV_USER_ID,
			DEV_USER_INT_ID,
			title,
			'Playwright diagnostics upload verification row',
			'documentary',
			`minio://playwright-diagnostics/${fileName}`,
			fileName,
			'text/plain',
			256,
			`sha256:${evidenceNumber.toLowerCase()}`,
			'text/plain',
			'document',
			'processed',
			JSON.stringify(metadata),
		]
	);

	const evidenceId = result.rows[0]?.id;
	expect(evidenceId).toBeTruthy();
	cleanupEvidenceIds.add(evidenceId);
	return evidenceId;
}

test.describe('Evidence diagnostics upload flow', () => {
	test.afterEach(async () => {
		for (const evidenceId of cleanupEvidenceIds) {
			await pool.query('DELETE FROM evidence WHERE id = $1', [evidenceId]).catch(() => {});
		}
		cleanupEvidenceIds.clear();
	});

	test.afterAll(async () => {
		await pool.end();
	});

	test('uploads evidence from the live UI and shows diagnostics in the detail modal', async ({
		page,
	}) => {
		await stubCompletedOnboarding(page);

		const caseId = await loadSeededCaseId();
		const uploadedTitle = `[PW-DIAG] upload-${Date.now()}`;
		const fileName = 'diagnostics-note.txt';

		await page.route('**/api/evidence/upload', async (route) => {
			const evidenceId = await insertEvidenceWithDiagnostics(caseId, uploadedTitle, fileName);

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					success: true,
					data: { id: evidenceId },
				}),
			});
		});

		await page.goto(`/evidence?caseId=${caseId}`);
		await page.waitForLoadState('networkidle');

		await page.getByRole('button', { name: /Bulk Upload/i }).click();
		await page.getByRole('button', { name: /^Upload Evidence$/i }).click();

		await page.locator('#file-input').setInputFiles({
			name: fileName,
			mimeType: 'text/plain',
			buffer: Buffer.from('Playwright evidence diagnostics verification payload'),
		});

		await page.locator('input[id^="title-"]').first().fill(uploadedTitle);

		const uploadResponse = page.waitForResponse(
			(response) =>
				response.url().includes('/api/evidence/upload') && response.request().method() === 'POST'
		);

		await page.getByRole('button', { name: /Upload 1 Files/i }).click();
		await uploadResponse;

		const evidenceCard = page.locator('[role="button"]').filter({ hasText: uploadedTitle }).first();
		await expect(evidenceCard).toBeVisible({ timeout: 15000 });
		await evidenceCard.click();

		await expect(page.getByRole('dialog', { name: /Evidence Detail/i })).toBeVisible();
		await expect(page.getByText('Processing Diagnostics')).toBeVisible();
		await expect(page.getByText(/^metadata persist$/i)).toBeVisible();
		await expect(page.getByText('Primary embedding model timed out; fallback used')).toBeVisible();
	});

	test('shows a failed upload state when the evidence upload API returns an error', async ({
		page,
	}) => {
		await stubCompletedOnboarding(page);

		const caseId = await loadSeededCaseId();
		const failedTitle = `[PW-DIAG] failed-${Date.now()}`;
		const fileName = 'diagnostics-error.txt';

		await page.route('**/api/evidence/upload', async (route) => {
			await route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({
					success: false,
					error: 'Pipeline unavailable',
				}),
			});
		});

		await page.goto(`/evidence?caseId=${caseId}`);
		await page.waitForLoadState('networkidle');

		await page.getByRole('button', { name: /Bulk Upload/i }).click();
		await page.getByRole('button', { name: /^Upload Evidence$/i }).click();

		await page.locator('#file-input').setInputFiles({
			name: fileName,
			mimeType: 'text/plain',
			buffer: Buffer.from('Playwright evidence upload failure verification payload'),
		});

		await page.locator('input[id^="title-"]').first().fill(failedTitle);

		const uploadResponse = page.waitForResponse(
			(response) =>
				response.url().includes('/api/evidence/upload') && response.request().method() === 'POST'
		);

		await page.getByRole('button', { name: /Upload 1 Files/i }).click();
		await uploadResponse;

		await expect(page.getByText(/Upload Results/i)).toBeVisible();
		await expect(page.getByText(/Failed uploads \(1\)/i)).toBeVisible();
		await expect(page.getByText(`${failedTitle}: Pipeline unavailable`)).toBeVisible();
	});
});