import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { registerTestUser, seedCasesForUser, cleanupSeededCases } from './utils/seed-cases';

const attachmentPath = fileURLToPath(new URL('../../todo326.txt', import.meta.url));
const expectedFirstLine = 'to do _3_17_26';

test.describe('Floating Chat Attachment Flow', () => {
	test('uploads an attachment on a case route and answers from the uploaded source', async ({ page }) => {
		test.slow();

		await registerTestUser(page.request);
		const seeded = await seedCasesForUser({
			request: page.request,
			cases: [
				{
					title: 'Floating Chat Attachment',
					description: 'Seeded for floating chat attachment regression coverage.',
				}
			]
		});

		const caseId = seeded[0]?.id;
		if (!caseId) {
			throw new Error('Failed to seed case for floating chat attachment test');
		}

		let ingestPayload: any = null;
		let ssePayload: any = null;
		let statusPollCount = 0;
		let terminalStatusPayload: any = null;

		page.on('response', async (response) => {
			const url = response.url();
			if (url.includes('/api/ace/ingest')) {
				try {
					ingestPayload = await response.json();
				} catch {
					// ignore non-json
				}
			}
			if (url.includes('/api/ace/status')) {
				statusPollCount += 1;
				try {
					const payload = await response.json();
					if (payload?.status === 'completed' || payload?.status === 'deferred') {
						terminalStatusPayload = payload;
					}
				} catch {
					// ignore non-json
				}
			}
		});

		page.on('request', (request) => {
			if (request.url().includes('/api/sse/chat') && request.method() === 'POST') {
				try {
					ssePayload = JSON.parse(request.postData() || '{}');
				} catch {
					// ignore malformed payload capture
				}
			}
		});

		try {
			await page.goto(`/cases/${caseId}`);
			await page.waitForLoadState('domcontentloaded');
			await page.waitForTimeout(1500);

			await page.getByRole('button', { name: 'Open assistant' }).click();
			await expect(page.getByText('AI CONTEXTUAL CHAT')).toBeVisible();

			await page
				.locator('label')
				.filter({ hasText: 'Attach' })
				.locator('input[type="file"]')
				.setInputFiles(attachmentPath);

			await expect(page.getByText('todo326.txt')).toBeVisible();

			await page
				.locator('textarea[placeholder="Ask about evidence, statutes, case law…"]')
				.fill('Return only the first line of the attached file.');

			await page.locator('button[title="Send (Enter)"]').click();

			await expect(page.getByText(/Indexing attachment: todo326.txt/)).toBeVisible();
			await expect(page.getByText(/Preview ready:|Attachment indexed:/)).toBeVisible({
				timeout: 30000,
			});
			await expect(
				page.getByText(/Answering from extracted preview while background indexing completes\./)
			).toBeVisible({ timeout: 15000 });
			await expect(page.getByText(expectedFirstLine, { exact: false })).toBeVisible({
				timeout: 60000,
			});
			await expect(
				page
					.getByText(
						/Attachment indexed for retrieval: todo326.txt|Attachment retrieval indexing deferred for todo326.txt\./
					)
					.first()
			).toBeVisible({ timeout: 120000 });

			expect(ingestPayload?.success).toBeTruthy();
			expect(ingestPayload?.caseId).toBe(caseId);
			expect(ingestPayload?.indexingStatus).toBe('queued');
			expect(typeof ingestPayload?.jobId).toBe('string');
			expect(typeof ingestPayload?.attachmentSourceHash).toBe('string');

			expect(ssePayload?.conversationId).toBe(`case-${caseId}`);
			expect(ssePayload?.currentRoute).toBe(`/cases/${caseId}`);
			expect(ssePayload?.attachmentSourceHash).toBe(ingestPayload?.attachmentSourceHash);
			expect(statusPollCount).toBeGreaterThan(0);
			expect(['completed', 'deferred']).toContain(terminalStatusPayload?.status);
			expect(terminalStatusPayload?.jobId).toBe(ingestPayload?.jobId);
		} finally {
			await cleanupSeededCases({ request: page.request, caseIds: [caseId] });
		}
	});

	test('saves glossary concepts from the floating assistant into case authorities', async ({ page }) => {
		test.slow();

		await registerTestUser(page.request);
		const seeded = await seedCasesForUser({
			request: page.request,
			cases: [
				{
					title: 'Floating Chat Glossary Save',
					description: 'Seeded for floating assistant glossary save regression coverage.',
				}
			]
		});

		const caseId = seeded[0]?.id;
		if (!caseId) {
			throw new Error('Failed to seed case for floating glossary save test');
		}

		const glossaryTerm = 'Probable Cause';
		const glossaryDefinition =
			'Reasonable grounds to believe that a crime has been committed and that the accused is responsible.';
		let ssePayload: any = null;

		try {
			page.on('request', (request) => {
				if (request.url().includes('/api/sse/chat') && request.method() === 'POST') {
					try {
						ssePayload = JSON.parse(request.postData() || '{}');
					} catch {
						// ignore malformed payload capture
					}
				}
			});

			const streamedChunks = [
				{
					id: 'floating-glossary-1',
					role: 'assistant',
					content: 'Reviewing the legal definition in the active case context.',
					status: 'streaming',
					source: 'server-ollama'
				},
				{
					id: 'floating-glossary-1',
					role: 'assistant',
					content:
						'Probable cause is present when the available facts would lead a reasonable person to believe the suspect committed the offense.',
					status: 'done',
					source: 'server-ollama',
					confidence: 0.93,
					confidenceFactors: {
						caseContext: true,
						ragHits: 2,
						topScore: 0.88,
						embeddingModel: 'embeddinggemma:latest'
					},
					glossaryMatches: [
						{
							id: 'glossary-probable-cause',
							term: glossaryTerm,
							definition: glossaryDefinition,
							source: 'legal_glossary',
							citation: 'Cal. Penal Code',
							confidence: 0.98,
							jurisdiction: 'California',
							sourceNodeId: null
						}
					]
				}
			];

			await page.route('**/api/sse/chat', async (route) => {
				await route.fulfill({
					status: 200,
					contentType: 'text/event-stream',
					headers: { 'Cache-Control': 'no-cache' },
					body: streamedChunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')
				});
			});

			await page.goto(`/cases/${caseId}`);
			await page.waitForLoadState('domcontentloaded');
			await page.waitForTimeout(1500);

			await page.getByRole('button', { name: 'Open assistant' }).click();
			await expect(page.getByText('AI CONTEXTUAL CHAT')).toBeVisible();

			await page
				.locator('textarea[placeholder="Ask about evidence, statutes, case law…"]')
				.fill('Explain probable cause for this case.');

			await page.locator('button[title="Send (Enter)"]').click();

			const glossaryCard = page
				.locator('div')
				.filter({ has: page.getByText('Legal Definitions Used', { exact: true }) })
				.filter({ has: page.getByText(glossaryTerm, { exact: true }) })
				.first();
			await expect(glossaryCard).toContainText(glossaryTerm);
			await expect(glossaryCard).toContainText(glossaryDefinition);

			const saveButton = glossaryCard.getByRole('button', { name: /save|saving|saved/i });

			await expect(saveButton).toContainText('Save');
			await saveButton.click();
			await expect(saveButton).toContainText('Saved');

			await expect(page.getByText(`Saved legal concept to case: ${glossaryTerm}`)).toBeVisible();

			expect(ssePayload?.conversationId).toBe(`case-${caseId}`);

			const authoritiesResponse = await page.request.get(`/api/cases/${caseId}/authorities`);
			expect(authoritiesResponse.ok()).toBeTruthy();

			const authoritiesPayload = await authoritiesResponse.json();
			const savedConcept = authoritiesPayload.authorities.find(
				(authority: any) =>
					authority.category === 'glossary_concept' && authority.glossaryTerm === glossaryTerm
			);

			expect(savedConcept).toBeTruthy();
			expect(savedConcept.glossaryDefinition).toContain(glossaryDefinition);
			expect(savedConcept.glossaryDefinition).toContain('Jurisdiction: California');
			expect(savedConcept.glossaryDefinition).toContain('Source: legal_glossary');
		} finally {
			await cleanupSeededCases({ request: page.request, caseIds: [caseId] });
		}
	});
});