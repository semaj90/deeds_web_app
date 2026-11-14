/**
 * Dossier style diagnostic + DSPy boundary-rule validation (read-only, proposal-only).
 *
 * 1. Observes the case page (computed card radius/border vs the dossier tokens, AA contrast of the
 *    muted-text token, console/page/request failures, horizontal overflow at 390px).
 * 2. Packs the findings into an `atlas.dspy-repair-request.v1` packet and a deterministic
 *    `atlas.dspy-repair-output.v1` proposal, then runs both through the EXISTING validators in
 *    python/parent_atlas_dspy_repair.py (no dspy package needed, nothing is installed).
 * 3. Negative cases prove the validator fails closed (unauthorized ref, checksum mismatch,
 *    wrong authority).
 *
 * Not a DSPy model run. The checksum is a local digest of the observations, not a ContextManifest
 * checksum, so the packet carries no source authority. Output is attached to the test report only.
 *
 * Run (no DB seeding):
 *   PLAYWRIGHT_SKIP_GLOBAL_SETUP=true DOSSIER_CASE_ID=<uuid> npx playwright test \
 *     tests/e2e/dossier-style-dspy-validation.spec.ts --project=chromium
 */
import { test, expect, type ConsoleMessage, type Page, type Request } from '@playwright/test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const CASE_ID = process.env.DOSSIER_CASE_ID ?? '';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPO_ROOT = path.resolve(process.cwd(), '..');
const EXPECTED = { radius: '10px', borderWidth: '1px' };
const AA_MIN = 4.5;

interface Finding {
	id: string;
	kind: 'token-mismatch' | 'contrast' | 'console-error' | 'page-error' | 'request-failed' | 'overflow';
	detail: string;
}

function sha256(text: string): string {
	return 'sha256:' + createHash('sha256').update(text, 'utf8').digest('hex');
}

function luminance(hex: string): number {
	const c = [1, 3, 5]
		.map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
		.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
	return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: string, b: string): number {
	const x = luminance(a);
	const y = luminance(b);
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Calls the existing Python validators. Returns { ok, error }. */
function runPythonValidator(kind: 'request' | 'output', payload: unknown, extra: unknown = {}) {
	const code = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(REPO_ROOT, 'python'))})
import parent_atlas_dspy_repair as m
d = json.load(sys.stdin)
try:
    if d["kind"] == "request":
        m.validate_dspy_repair_request_v1(d["payload"])
    else:
        e = d["extra"]
        m.validate_dspy_repair_output_v1(d["payload"], context_manifest_checksum=e["checksum"],
            allowed_evidence_refs=e["refs"], allowed_target_ids=e["targets"])
    print(json.dumps({"ok": True}))
except Exception as ex:
    print(json.dumps({"ok": False, "error": str(ex)}))
`;
	const py = process.env.ATLAS_PYTHON ?? 'py';
	const args = process.env.ATLAS_PYTHON ? ['-I', '-c', code] : ['-3.13', '-I', '-c', code];
	const r = spawnSync(py, args, {
		input: JSON.stringify({ kind, payload, extra }),
		encoding: 'utf8',
		cwd: REPO_ROOT,
		timeout: 30_000
	});
	if (r.status !== 0) throw new Error('python validator failed to run: ' + (r.stderr || r.error));
	return JSON.parse(r.stdout.trim().split('\n').pop() as string) as { ok: boolean; error?: string };
}

async function observe(page: Page, viewport: { width: number; height: number }) {
	const findings: Finding[] = [];
	const add = (kind: Finding['kind'], detail: string) =>
		findings.push({ id: `finding:${kind}:${findings.length + 1}`, kind, detail });

	const onConsole = (m: ConsoleMessage) => m.type() === 'error' && add('console-error', m.text().slice(0, 200));
	const onPageError = (e: Error) => add('page-error', e.message.slice(0, 200));
	const onRequestFailed = (r: Request) => {
		const reason = r.failure()?.errorText ?? '';
		// An in-flight analytics beacon aborted by this test's own next navigation is not a page defect.
		if (reason === 'net::ERR_ABORTED' && r.url().includes('/api/analytics/')) return;
		add('request-failed', `${r.url().slice(0, 120)} ${reason}`);
	};
	page.on('console', onConsole);
	page.on('pageerror', onPageError);
	page.on('requestfailed', onRequestFailed);

	await page.setViewportSize(viewport);
	await page.goto(`/cases/${CASE_ID}`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.dossier-workspace', { timeout: 80_000 });
	await page.waitForTimeout(1500);

	const m = await page.evaluate(() => {
		const card = document.querySelector('.dossier-card');
		const cs = card ? getComputedStyle(card) : null;
		const root = getComputedStyle(document.documentElement);
		return {
			radius: cs?.borderRadius ?? null,
			borderWidth: cs?.borderTopWidth ?? null,
			mutedAa: root.getPropertyValue('--dossier-text-muted-aa').trim(),
			cardBg: root.getPropertyValue('--dossier-bg-card').trim(),
			workspaceBg: root.getPropertyValue('--dossier-bg-workspace').trim(),
			overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
		};
	});

	if (m.radius !== EXPECTED.radius) add('token-mismatch', `card radius ${m.radius} != ${EXPECTED.radius}`);
	if (m.borderWidth !== EXPECTED.borderWidth) add('token-mismatch', `card border ${m.borderWidth} != ${EXPECTED.borderWidth}`);
	for (const bg of [m.cardBg, m.workspaceBg]) {
		const ratio = contrast(m.mutedAa, bg);
		if (ratio < AA_MIN) add('contrast', `${m.mutedAa} on ${bg} = ${ratio.toFixed(2)}:1 < ${AA_MIN}`);
	}
	if (m.overflow) add('overflow', `horizontal overflow at ${viewport.width}px`);
	page.off('console', onConsole);
	page.off('pageerror', onPageError);
	page.off('requestfailed', onRequestFailed);
	return findings;
}

test.describe('dossier style + DSPy boundary rules', () => {
	test.skip(!UUID_RE.test(CASE_ID), 'set DOSSIER_CASE_ID to a case UUID');

	test('observations validate through the existing DSPy request/output validators', async ({ page }, testInfo) => {
		test.setTimeout(180_000);
		const findings = [
			...(await observe(page, { width: 1360, height: 900 })),
			...(await observe(page, { width: 390, height: 844 }))
		];

		// Evidence refs: one per finding plus the page URL, so every cited ref is allowlisted.
		const evidenceRefs = [`page:/cases/${CASE_ID}`, ...findings.map((f) => `evidence:${sha256(f.id + f.detail)}`)];
		const targetIds = ['target:src/lib/styles/dossier-global.css', 'target:src/routes/(app)/cases/[id]/+page.svelte'];
		const checksum = sha256(JSON.stringify({ CASE_ID, findings }));

		const request = {
			schema: 'atlas.dspy-repair-request.v1',
			contextManifestChecksum: checksum,
			query: 'Review dossier style observations for the case page',
			diagnosisContext: findings.length ? findings.map((f) => `${f.id}: ${f.detail}`).join('\n') : null,
			allowedTargetCandidateIds: targetIds,
			allowedEvidenceRefs: evidenceRefs,
			authority: 'PROPOSAL_ONLY'
		};
		const output = {
			schema: 'atlas.dspy-repair-output.v1',
			contextManifestChecksum: checksum,
			diagnosis: findings.length ? `${findings.length} observation(s) need review` : 'No style findings; tokens and contrast hold',
			targetCandidates: [targetIds[0]],
			patchPlan: 'Proposal only: review each finding, adjust tokens in dossier-global.css, no automatic edit',
			validationPlan: 'Re-run this spec and npm run check',
			evidenceRefs
		};
		const extra = { checksum, refs: evidenceRefs, targets: targetIds };

		// Positive: both DTOs pass the existing validators.
		expect(runPythonValidator('request', request)).toEqual({ ok: true });
		expect(runPythonValidator('output', output, extra)).toEqual({ ok: true });

		// Negative: fail-closed behaviour of the same validators.
		const badRef = runPythonValidator('output', { ...output, evidenceRefs: [...evidenceRefs, 'evidence:not-allowlisted'] }, extra);
		expect(badRef.ok).toBe(false);
		expect(badRef.error).toContain('UNAUTHORIZED_EVIDENCE_REF');

		const badTarget = runPythonValidator('output', { ...output, targetCandidates: ['target:/etc/passwd'] }, extra);
		expect(badTarget.ok).toBe(false);
		expect(badTarget.error).toContain('UNAUTHORIZED_TARGET_ID');

		const badSum = runPythonValidator('output', { ...output, contextManifestChecksum: sha256('other') }, extra);
		expect(badSum.ok).toBe(false);
		expect(badSum.error).toContain('CONTEXT_MANIFEST_CHECKSUM_MISMATCH');

		const badAuthority = runPythonValidator('request', { ...request, authority: 'CANONICAL' });
		expect(badAuthority.ok).toBe(false);
		expect(badAuthority.error).toContain('PROPOSAL_ONLY');

		await testInfo.attach('dossier-dspy-receipt.json', {
			contentType: 'application/json',
			body: JSON.stringify(
				{ status: 'PROPOSAL_ONLY', canonicalAuthority: false, checksum, findings, writesPerformed: false },
				null,
				2
			)
		});

		// The style assertions themselves: any finding fails the test after the receipt is attached.
		expect.soft(findings, JSON.stringify(findings, null, 2)).toEqual([]);
	});
});
