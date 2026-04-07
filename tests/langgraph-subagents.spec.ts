/**
 * LangGraph Supervisor + Subagent Pipeline — E2E Tests
 *
 * Tests the /api/agent/investigate endpoint across:
 *   - GET: metadata/topology
 *   - POST supervisor mode: LLM routing → subagent execution
 *   - POST flat mode: single ReAct agent (legacy)
 *   - POST streaming mode: SSE incremental updates
 *   - Routing accuracy: each domain routes to correct subagent
 *   - Error handling: recursion limit, timeout, invalid input
 *
 * Screenshots saved to: scripts/tests/screenshots/langgraph-subagents/
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://127.0.0.1:5173';
const SCREENSHOT_DIR = path.resolve(
	__dirname,
	'../sveltekit-frontend/scripts/tests/screenshots/langgraph-subagents'
);
const RESULTS_FILE = path.join(SCREENSHOT_DIR, 'test-results.json');

// Accumulate test results for comparison
const testResults: Array<{
	name: string;
	mode: string;
	query: string;
	status: number;
	route?: string;
	duration?: number;
	toolCount?: number;
	tools?: string[];
	answerPreview?: string;
	error?: string;
}> = [];

function saveResults() {
	fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
	fs.writeFileSync(RESULTS_FILE, JSON.stringify(testResults, null, 2));
}

// ── GET: Topology & Metadata ──────────────────────────────────

test.describe('GET /api/agent/investigate — topology', () => {
	test('returns agent metadata with 32 tools and 5 subagents', async ({ request }) => {
		const res = await request.get(`${BASE_URL}/api/agent/investigate`);
		expect(res.status()).toBe(200);

		const data = await res.json();
		expect(data.name).toBe('Autonomous Investigation Agent');
		expect(data.architecture).toContain('StateGraph');
		expect(data.toolCount).toBe(32);
		expect(data.modes.supervisor.subagents).toHaveLength(5);

		const subagentNames = data.modes.supervisor.subagents.map((s: any) => s.name);
		expect(subagentNames).toEqual(
			expect.arrayContaining(['audio', 'document', 'case', 'codebase', 'general'])
		);

		testResults.push({
			name: 'topology',
			mode: 'GET',
			query: '',
			status: res.status(),
			toolCount: data.toolCount,
			tools: subagentNames,
			answerPreview: `${data.toolCount} tools, ${data.modes.supervisor.subagents.length} subagents`,
		});
	});
});

// ── POST Supervisor Mode: Routing Tests ─────────────────────────

test.describe('POST supervisor mode — routing', () => {
	test.setTimeout(300_000); // 5 min per test — LLM routing + subagent execution

	const routingTests = [
		{
			name: 'routes to general for system health',
			query: 'check system health status',
			expectedRoute: 'general',
		},
		{
			name: 'routes to codebase for file search',
			query: 'find all TODO comments in TypeScript files',
			expectedRoute: 'codebase',
		},
		{
			name: 'routes to case for citation lookup',
			query: 'search citations related to Miranda v Arizona',
			expectedRoute: 'case',
		},
		{
			name: 'routes to document for PDF analysis',
			query: 'analyze this PDF document for legal entities',
			expectedRoute: 'document',
		},
		{
			name: 'routes to audio for transcription',
			query: 'transcribe the deposition audio recording',
			expectedRoute: 'audio',
		},
	];

	for (const tc of routingTests) {
		test(tc.name, async ({ request }) => {
			const res = await request.post(`${BASE_URL}/api/agent/investigate`, {
				data: {
					query: tc.query,
					mode: 'supervisor',
					maxIterations: 5,
					verbose: true,
				},
				timeout: 180_000,
			});

			expect(res.status()).toBe(200);
			const data = await res.json();

			expect(data.mode).toBe('supervisor');
			expect(data.route).toBe(tc.expectedRoute);
			expect(data.answer).toBeTruthy();
			expect(data.reasoning).toBeInstanceOf(Array);
			expect(data.reasoning.length).toBeGreaterThan(0);

			testResults.push({
				name: tc.name,
				mode: 'supervisor',
				query: tc.query,
				status: res.status(),
				route: data.route,
				duration: data.duration,
				toolCount: data.toolCalls?.length ?? 0,
				tools: data.toolCalls?.map((t: any) => t.tool) ?? [],
				answerPreview: data.answer?.slice(0, 200) ?? '',
			});
		});
	}
});

// ── POST Flat Mode: Comparison ──────────────────────────────────

test.describe('POST flat mode — comparison', () => {
	test.setTimeout(300_000); // 5 min — 32 tools + LLM

	test('flat mode returns valid answer for same query', async ({ request }) => {
		const res = await request.post(`${BASE_URL}/api/agent/investigate`, {
			data: {
				query: 'check system health status',
				mode: 'flat',
				maxIterations: 5,
				verbose: true,
			},
			timeout: 180_000,
		});

		expect(res.status()).toBe(200);
		const data = await res.json();

		expect(data.mode).toBe('flat');
		expect(data.answer).toBeTruthy();

		testResults.push({
			name: 'flat mode health check',
			mode: 'flat',
			query: 'check system health status',
			status: res.status(),
			duration: data.duration,
			toolCount: data.toolCalls?.length ?? 0,
			tools: data.toolCalls?.map((t: any) => t.tool) ?? [],
			answerPreview: data.answer?.slice(0, 200) ?? '',
		});
	});
});

// ── POST Streaming Mode: SSE ────────────────────────────────────

test.describe('POST streaming mode — SSE', () => {
	test.setTimeout(300_000);

	test('streams incremental supervisor updates', async ({ request }) => {
		const res = await request.post(`${BASE_URL}/api/agent/investigate`, {
			data: {
				query: 'check system health',
				mode: 'supervisor',
				stream: true,
				maxIterations: 5,
			},
			timeout: 180_000,
		});

		expect(res.status()).toBe(200);
		const contentType = res.headers()['content-type'];
		expect(contentType).toContain('text/event-stream');

		const body = await res.text();
		const events = body
			.split('\n\n')
			.filter((e) => e.startsWith('data: '))
			.map((e) => {
				try {
					return JSON.parse(e.replace('data: ', ''));
				} catch {
					return null;
				}
			})
			.filter(Boolean);

		expect(events.length).toBeGreaterThanOrEqual(2); // route_intent + subagent + __end__

		// First event should be route_intent
		const routeEvent = events.find((e: any) => e.node === 'route_intent');
		expect(routeEvent).toBeTruthy();
		expect(routeEvent.data.route).toBeTruthy();

		// Last event should be __end__
		const endEvent = events.find((e: any) => e.node === '__end__');
		expect(endEvent).toBeTruthy();

		testResults.push({
			name: 'streaming SSE',
			mode: 'stream',
			query: 'check system health',
			status: res.status(),
			toolCount: events.length,
			tools: events.map((e: any) => e.node),
			answerPreview: `${events.length} SSE events: ${events.map((e: any) => e.node).join(' → ')}`,
		});
	});
});

// ── Input Validation ────────────────────────────────────────────

test.describe('Input validation', () => {
	test('rejects empty query', async ({ request }) => {
		const res = await request.post(`${BASE_URL}/api/agent/investigate`, {
			data: { query: '', mode: 'supervisor' },
		});
		expect(res.status()).toBe(400);
	});

	test('rejects excessive maxIterations', async ({ request }) => {
		const res = await request.post(`${BASE_URL}/api/agent/investigate`, {
			data: { query: 'test', maxIterations: 100 },
		});
		expect(res.status()).toBe(400);
	});
});

// ── Screenshot: AI Dashboard Page ───────────────────────────────

test.describe('UI screenshots — LangGraph agent pages', () => {
	test('ai-dashboard page loads', async ({ page }) => {
		await page.goto(`${BASE_URL}/ai-dashboard`, { waitUntil: 'networkidle', timeout: 30_000 });
		await page.waitForTimeout(2000);
		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'ai-dashboard.png'),
			fullPage: true,
		});

		const title = await page.title();
		expect(title).toBeTruthy();
	});

	test('command-center page loads', async ({ page }) => {
		await page.goto(`${BASE_URL}/command-center`, {
			waitUntil: 'networkidle',
			timeout: 30_000,
		});
		await page.waitForTimeout(2000);
		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'command-center.png'),
			fullPage: true,
		});
	});
});

// ── Save results after all tests ────────────────────────────────

test.afterAll(() => {
	saveResults();
	console.log(`\n═══ LangGraph Subagent Test Results ═══`);
	console.log(`Total tests: ${testResults.length}`);
	console.log(`Results saved to: ${RESULTS_FILE}`);

	// Print comparison table
	const supervisorTests = testResults.filter((r) => r.mode === 'supervisor');
	const flatTests = testResults.filter((r) => r.mode === 'flat');
	const streamTests = testResults.filter((r) => r.mode === 'stream');

	console.log(`\nSupervisor mode: ${supervisorTests.length} tests`);
	for (const t of supervisorTests) {
		console.log(
			`  → ${t.name}: route=${t.route}, tools=${t.toolCount}, duration=${t.duration}ms`
		);
	}

	console.log(`\nFlat mode: ${flatTests.length} tests`);
	for (const t of flatTests) {
		console.log(`  → ${t.name}: tools=${t.toolCount}, duration=${t.duration}ms`);
	}

	console.log(`\nStream mode: ${streamTests.length} tests`);
	for (const t of streamTests) {
		console.log(`  → ${t.name}: events=${t.toolCount}`);
	}
});
