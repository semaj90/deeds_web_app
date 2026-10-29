/**
 * CSP-DEMO-L1 acceptance: Courtroom Orientation on the fictional local-preview story.
 *
 * Run (no database seeding; the app must already answer on the configured base URL):
 *   PLAYWRIGHT_SKIP_GLOBAL_SETUP=true npx playwright test tests/e2e/courtroom-sim-level1.spec.ts --project=chromium
 *
 * What this does NOT prove: GPU performance. Headless Chromium usually renders with SwiftShader (software); the renderer
 * string is recorded in the test attachments and any FPS seen here is CPU/software evidence only.
 */
import { expect, test } from '@playwright/test';

const SIZES = [
	{ width: 1280, height: 720 },
	{ width: 1920, height: 1080 }
];
const TERMINAL = ['finished', 'interrupted', 'timeout', 'unavailable'];

test.setTimeout(300_000);

test.beforeAll(async ({ request }) => {
	// Bounded health gate: fail fast with a clear message instead of hanging in page.goto on a stalled dev server.
	const res = await request.get('/api/health', { timeout: 60_000 }).catch((e) => {
		throw new Error(`App did not answer /api/health within 60 s (${e.message}). Fix the server first; this test does not start it.`);
	});
	expect(res.status(), '/api/health status').toBe(200);
});

for (const size of SIZES) {
	test(`level 1 at ${size.width}x${size.height}`, async ({ page }, testInfo) => {
		await page.setViewportSize(size);
		const consoleLog: string[] = [];
		const pageErrors: string[] = [];
		const requests: string[] = [];
		const forbidden: string[] = [];
		page.on('console', (m) => consoleLog.push(`${m.type()}: ${m.text().slice(0, 200)}`));
		page.on('pageerror', (e) => pageErrors.push(e.message));
		page.on('request', (r) => {
			const path = new URL(r.url()).pathname;
			requests.push(`${r.method()} ${path}`);
			// Any case or session creation, update or deletion is a failure of the "fictional local state only" rule.
			if (r.method() !== 'GET' && r.method() !== 'HEAD' && /^\/api\/(simulation|cases)/.test(path)) forbidden.push(`${r.method()} ${path}`);
		});

		await page.goto('/demos/courtroom-sim', { waitUntil: 'domcontentloaded', timeout: 240_000 });
		await page.getByRole('button', { name: 'PLAY LOCAL STORY' }).click({ timeout: 120_000 });

		// Scene ready: the wrapper exposes it, and the Level 1 panel only renders once it is true.
		const wrapper = page.locator('.courtroom-wrapper');
		await expect(wrapper).toHaveAttribute('data-scene-ready', 'true', { timeout: 180_000 });
		const panel = page.getByTestId('level1-panel');
		await expect(panel).toBeVisible();
		await expect(panel.locator('[data-receipt="SCENE_READY"]')).toHaveAttribute('data-earned', 'true');

		// Camera presets: the exposed camera state follows each control.
		for (const view of ['witness', 'judge', 'wide']) {
			await page.getByTestId(`camera-${view}`).click();
			await expect(wrapper).toHaveAttribute('data-camera-view', view, { timeout: 5_000 });
			await expect(panel.locator(`[data-receipt="CAMERA_${view.toUpperCase()}"]`)).toHaveAttribute('data-earned', 'true');
			await page.waitForTimeout(700); // let the 0.5 s transition finish before the next request
		}

		// Station movement: exactly one terminal receipt, with a final position, from the real scene.
		await page.getByTestId('move-judge').click();
		const receipt = page.getByTestId('movement-receipt');
		await expect(receipt).toHaveCount(1, { timeout: 90_000 });
		const move = page.getByTestId('level1-move');
		await expect(move).toContainText('judge:', { timeout: 90_000 });
		const text = ((await move.textContent()) ?? '').replace(/\s+/g, ' ').trim();
		const outcome = TERMINAL.find((o) => text.includes(`judge: ${o}`));
		expect(outcome, `a terminal outcome in "${text}"`).toBeTruthy();
		if (outcome === 'finished') expect(text, 'finished carries a final position').toMatch(/at -?\d+\.\d, -?\d+\.\d/);
		const verified = (await panel.locator('[data-receipt="MOVE_VERIFIED"]').getAttribute('data-earned')) === 'true';
		// Verified must agree with the outcome: never earned from anything but a finished move at the station.
		if (outcome !== 'finished') expect(verified).toBe(false);
		await page.waitForTimeout(1500);
		await expect(receipt, 'still exactly one terminal receipt').toHaveCount(1);

		// Renderer identification (not a performance claim).
		const renderer = await page.evaluate(() => {
			const c = document.createElement('canvas');
			const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
			if (!gl) return { api: 'none', renderer: null };
			const ext = gl.getExtension('WEBGL_debug_renderer_info');
			return { api: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl', renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null };
		});
		const software = /swiftshader|llvmpipe|software/i.test(renderer.renderer ?? '');

		await testInfo.attach(`screenshot-${size.width}x${size.height}`, { body: await page.screenshot(), contentType: 'image/png' });
		await testInfo.attach('logs.json', {
			body: JSON.stringify({ size, outcome, moveText: text, verified, renderer, softwareRendered: software, pageErrors, forbidden, consoleErrors: consoleLog.filter((l) => l.startsWith('error')), requestCount: requests.length }, null, 2),
			contentType: 'application/json'
		});

		expect(forbidden, 'no case/session writes').toEqual([]);
		expect(pageErrors, 'no uncaught page errors').toEqual([]);
	});
}
