import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'fs/promises';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const SCREENSHOT_DIR = 'tests/screenshots/latest';
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==';

test.beforeAll(async () => {
	await mkdir(SCREENSHOT_DIR, { recursive: true }).catch(() => {});
});

async function screenshot(page: Page, name: string) {
	await page.screenshot({
		path: `${SCREENSHOT_DIR}/${name}`,
		fullPage: false,
	});
}

test.describe('Analytics page — Google Deep Research collaborative flow', () => {
	test('shows plan controls and renders Google visual outputs after approval', async ({ page }) => {
		const topic = {
			id: 'topic-1',
			title: 'Investigate hearsay reliability',
			description: 'Assess witness credibility and exception analysis.',
			reasoning: 'This topic has repeated ACE feedback and merits a structured plan.',
			priority: 'high',
			sources: ['feedback', 'graph'],
			selfPrompt: 'Investigate hearsay reliability in witness testimony and summarize the best exceptions.',
			tags: ['hearsay', 'witness'],
			pipelineHint: 'ace',
		};

		const deepResearchPayload = {
			topics: [topic],
			feedbackSignals: [],
			pipelineSummary: [],
			graphInsights: [],
			hotQueryTags: ['hearsay'],
			topPrompts: [],
			generatedAt: '2026-04-21T00:00:00.000Z',
			modelUsed: 'mock-ollama',
			cachedUntil: null,
		};

		const googleInteractions = {
			'plan-1': {
				interactionId: 'plan-1',
				status: 'completed',
				textOutput: 'Plan step 1: classify the statement. Plan step 2: evaluate applicable hearsay exceptions.',
				durationMs: 1200,
				imageCount: 1,
				images: [
					{
						src: `data:image/png;base64,${TINY_PNG_BASE64}`,
						uri: null,
						mimeType: 'image/png',
						resolution: 'high',
					},
				],
				thoughtSummaries: ['Draft a two-step research plan.'],
				error: null,
			},
			'plan-2': {
				interactionId: 'plan-2',
				status: 'completed',
				textOutput: 'Updated plan: add witness impeachment checks before evaluating hearsay exceptions.',
				durationMs: 1500,
				imageCount: 1,
				images: [
					{
						src: `data:image/png;base64,${TINY_PNG_BASE64}`,
						uri: null,
						mimeType: 'image/png',
						resolution: 'high',
					},
				],
				thoughtSummaries: ['Refined the plan to include impeachment analysis.'],
				error: null,
			},
			'report-1': {
				interactionId: 'report-1',
				status: 'completed',
				textOutput: 'Final report: the statement is likely hearsay unless admitted as an excited utterance or present sense impression.',
				durationMs: 2200,
				imageCount: 1,
				images: [
					{
						src: `data:image/png;base64,${TINY_PNG_BASE64}`,
						uri: null,
						mimeType: 'image/png',
						resolution: 'high',
					},
				],
				thoughtSummaries: ['Approved plan and generated the final grounded report.'],
				error: null,
			},
		} as const;

		await page.route('**/api/analytics/deep-research**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(deepResearchPayload),
			});
		});

		await page.route('**/api/analytics/deep-research/google**', async (route) => {
			const request = route.request();

			if (request.method() === 'POST') {
				const body = request.postDataJSON() as {
					action: 'start' | 'follow-up' | 'approve-plan';
					collaborativePlanning?: boolean;
				};

				if (body.action === 'follow-up') {
					await route.fulfill({
						status: 200,
						contentType: 'application/json',
						body: JSON.stringify({ interactionId: 'plan-2' }),
					});
					return;
				}

				if (body.action === 'approve-plan') {
					await route.fulfill({
						status: 200,
						contentType: 'application/json',
						body: JSON.stringify({ interactionId: 'report-1' }),
					});
					return;
				}

				await route.fulfill({
					status: 202,
					contentType: 'application/json',
					body: JSON.stringify({ interactionId: body.collaborativePlanning ? 'plan-1' : 'report-1' }),
				});
				return;
			}

			const interactionId = new URL(request.url()).searchParams.get('interactionId') as keyof typeof googleInteractions;
			const payload = googleInteractions[interactionId] ?? googleInteractions['report-1'];

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(payload),
			});
		});

		await page.goto(`${BASE}/analytics#deep-research`, { waitUntil: 'domcontentloaded' });
		await expect(page.getByText('Deep Research Topics')).toBeVisible();
		await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
		await expect(page.getByRole('heading', { name: topic.title, exact: true })).toBeVisible();

		await page.getByRole('button', { name: 'Google', exact: true }).click();
		await page.getByRole('button', { name: 'Plan', exact: true }).click();

		await expect(page.getByText('Collaborative Research Plan')).toBeVisible();
		await expect(page.getByText('Review the proposed plan, refine it, or approve it to run the full research report.')).toBeVisible();
		await expect(page.locator('#dr-plan-follow-up')).toBeVisible();
		await expect(page.getByText('Draft a two-step research plan.')).toBeVisible();

		await page.locator('#dr-plan-follow-up').fill('Add witness impeachment analysis before the hearsay exception stage.');
		await page.getByRole('button', { name: 'Refine plan', exact: true }).click();

		await expect(page.getByText('Updated plan: add witness impeachment checks before evaluating hearsay exceptions.')).toBeVisible();
		await expect(page.locator('#dr-plan-follow-up')).toHaveValue('');

		await page.getByRole('button', { name: 'Approve and run', exact: true }).click();

		await expect(page.getByText('Deep Research Result')).toBeVisible();
		await expect(page.getByText('Final report: the statement is likely hearsay unless admitted as an excited utterance or present sense impression.')).toBeVisible();
		await expect(page.locator('.dr-image-grid img')).toBeVisible();
		await expect(page.getByText('image/png · high')).toBeVisible();

		await screenshot(page, 'analytics-google-deep-research-plan-and-visuals.png');
	});

	test('queues a Google task and renders the provider badge in the task panel', async ({ page }) => {
		const topic = {
			id: 'topic-1',
			title: 'Investigate hearsay reliability',
			description: 'Assess witness credibility and exception analysis.',
			reasoning: 'This topic has repeated ACE feedback and merits a structured plan.',
			priority: 'high',
			sources: ['feedback', 'graph'],
			selfPrompt: 'Investigate hearsay reliability in witness testimony and summarize the best exceptions.',
			tags: ['hearsay', 'witness'],
			pipelineHint: 'ace',
		};

		const deepResearchPayload = {
			topics: [topic],
			feedbackSignals: [],
			pipelineSummary: [],
			graphInsights: [],
			hotQueryTags: ['hearsay'],
			topPrompts: [],
			generatedAt: '2026-04-21T00:00:00.000Z',
			modelUsed: 'mock-ollama',
			cachedUntil: null,
		};

		await page.route('**/api/analytics/deep-research**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(deepResearchPayload),
			});
		});

		await page.route('**/api/tasks**', async (route) => {
			const request = route.request();

			if (request.method() === 'GET') {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ tasks: [] }),
				});
				return;
			}

			const body = request.postDataJSON() as {
				title: string;
				selfPrompt: string;
				pipelineHint: string;
				provider: 'google' | 'ollama';
			};

			await route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({
					task: {
						id: 'task-google-1',
						title: body.title,
						selfPrompt: body.selfPrompt,
						pipelineHint: body.pipelineHint,
						provider: body.provider,
						priority: 'high',
						status: 'pending',
						notified: false,
						createdAt: '2026-04-21T00:00:00.000Z',
						completedAt: null,
						result: { provider: body.provider },
					},
				}),
			});
		});

		await page.goto(`${BASE}/analytics#deep-research`, { waitUntil: 'domcontentloaded' });
		await expect(page.getByText('Deep Research Topics')).toBeVisible();
		await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
		await expect(page.getByRole('heading', { name: topic.title, exact: true })).toBeVisible();

		await page.getByRole('button', { name: 'Google', exact: true }).click();
		await page.getByRole('button', { name: 'Queue', exact: true }).click();

		await expect(page.getByText('Queued Google Deep Research task in the research task panel.')).toBeVisible();
		await expect(page.locator('.rtp-panel')).toBeVisible();
		await expect(page.locator('.rtp-panel .rtp-task-title')).toContainText(topic.title);
		await expect(page.locator('.rtp-panel .rtp-provider')).toContainText('GOOGLE');
		await expect(page.locator('.rtp-panel .rtp-pipeline')).toContainText('ACE');

		await screenshot(page, 'analytics-google-queued-task-panel.png');
	});

	test('renders a completed Google task result inside the task panel', async ({ page }) => {
		await page.route('**/api/tasks**', async (route) => {
			const request = route.request();

			if (request.method() === 'GET') {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						tasks: [
							{
								id: 'task-google-done-1',
								title: 'Completed Google Task',
								selfPrompt: 'Investigate hearsay reliability',
								pipelineHint: 'ace',
								provider: 'google',
								priority: 'high',
								status: 'done',
								notified: false,
								createdAt: '2026-04-21T00:00:00.000Z',
								completedAt: '2026-04-21T00:00:05.000Z',
								summaryId: 'summary-1',
								result: {
									provider: 'google',
									pipeline: 'ace',
									answer: 'Final report: the statement is likely hearsay unless admitted as an excited utterance or present sense impression.',
									durationMs: 2200,
									interactionId: 'report-1',
									imageCount: 1,
									images: [
										{
											src: `data:image/png;base64,${TINY_PNG_BASE64}`,
											uri: null,
											mimeType: 'image/png',
											resolution: 'high',
										},
									],
									thoughtSummaries: ['Approved plan and generated the final grounded report.'],
								},
							},
						],
					}),
				});
				return;
			}

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ ok: true }),
			});
		});

		await page.goto(`${BASE}/analytics`, { waitUntil: 'domcontentloaded' });
		await expect(page.locator('.rtp-toggle')).toBeVisible();

		await page.keyboard.press('Alt+t');
		await expect(page.locator('.rtp-panel')).toBeVisible();
		await expect(page.locator('.rtp-panel .rtp-task-title')).toContainText('Completed Google Task');
		await expect(page.locator('.rtp-panel .rtp-provider')).toContainText('GOOGLE');
		await expect(page.locator('.rtp-panel .rtp-pipeline')).toContainText('ACE');

		await page.getByRole('button', { name: /View result/i }).click();
		await expect(page.locator('.rtp-result-meta')).toContainText('GOOGLE · ACE · 2200ms');
		await expect(page.locator('.rtp-result-text')).toContainText('Final report: the statement is likely hearsay unless admitted as an excited utterance or present sense impression.');
		await expect(page.getByRole('link', { name: 'View Summary →', exact: true })).toBeVisible();

		await screenshot(page, 'analytics-google-completed-task-panel-result.png');
	});
});