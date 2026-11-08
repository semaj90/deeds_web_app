import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
	buildDeepAuditSourceInventoryV1,
	classifyG4RouteV1,
	classifyG5HandlerV1,
	classifyG5WithImportedValidationV1,
	classifyG63ModelReferenceV1,
	resolveApiGuardEvidenceV1
} from '../lib/deep-audit-source-inventory-v1.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'atlas-audit-inventory-'));
	await mkdir(join(root, 'src/routes/api/v1'), { recursive: true });
	await mkdir(join(root, 'src/routes/api/v2'), { recursive: true });
	await mkdir(join(root, 'src/backups/routes'), { recursive: true });
	await mkdir(join(root, 'docs/graph'), { recursive: true });
	await writeFile(join(root, 'src/routes/api/v1/+server.ts'), 'export const GET = () => 1;');
	await writeFile(join(root, 'src/routes/api/v2/+server.ts'), 'export const POST = async ({ locals }) => locals.user;');
	await writeFile(join(root, 'src/backups/routes/+server.ts'), 'backup');
	await writeFile(join(root, 'docs/graph/codebase-graph.json'), JSON.stringify({ files: [
		{ rel: 'src/routes/api/v1/+server.ts' },
		{ rel: 'sveltekit-frontend/src/routes/api/old/+server.ts' },
		{ rel: 'src/backups/routes/+server.ts' }
	] }));
	execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
	return root;
}

test('source inventory scopes live source, excludes backups, normalizes graph paths, and stays provisional', async () => {
	const root = await fixture();
	try {
		const report = await buildDeepAuditSourceInventoryV1({ frontendRoot: root, now: new Date() });
		assert.equal(report.inventoryStatus, 'PROVISIONAL');
		assert.equal(report.admission, 'BLOCKED_NO_MATCHING_ADMITTED_SNAPSHOT_RECEIPT');
		assert.deepEqual(report.liveSource.files.map((file) => file.path), [
			'src/routes/api/v1/+server.ts',
			'src/routes/api/v2/+server.ts'
		]);
		assert.deepEqual(report.comparison.missingFromGraph, ['src/routes/api/v2/+server.ts']);
		assert.deepEqual(report.comparison.absentFromLiveTree, ['src/routes/api/old/+server.ts']);
		assert.match(report.liveSource.inventorySha256, /^[a-f0-9]{64}$/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('source inventory marks old graph stale and missing graph blocked', async () => {
	const root = await fixture();
	try {
		const graphPath = join(root, 'docs/graph/codebase-graph.json');
		const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
		await utimes(graphPath, old, old);
		assert.equal((await buildDeepAuditSourceInventoryV1({ frontendRoot: root })).freshness, 'STALE');
		await rm(graphPath);
		assert.equal((await buildDeepAuditSourceInventoryV1({ frontendRoot: root })).freshness, 'BLOCKED');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('G4 distinguishes explicit public, direct guarded, and unresolved inherited routes', () => {
	assert.equal(classifyG4RouteV1({ path: 'src/routes/api/health/+server.ts' }).classification, 'PUBLIC');
	assert.equal(classifyG4RouteV1({ path: 'src/routes/api/private/+server.ts', source: 'if (!locals.user) return unauthorized();' }).classification, 'VERIFIED_PASS');
	assert.equal(classifyG4RouteV1({ path: 'src/routes/api/private/+server.ts', source: 'await db.select().from(rows); if (!locals.user) return unauthorized();' }).classification, 'NEEDS_MANUAL_REVIEW');
	assert.equal(classifyG4RouteV1({ path: 'src/routes/api/private/+server.ts' }).classification, 'NEEDS_MANUAL_REVIEW');
	assert.equal(classifyG4RouteV1({ path: 'src/routes/api/private/+server.ts', dependencyInventoryComplete: true }).classification, 'VERIFIED_FAIL');
	assert.equal(classifyG4RouteV1({ path: 'src/routes/api/private/+server.ts', inheritedGuardRefs: ['src/hooks.server.ts#requireUser'] }).classification, 'VERIFIED_PASS');
});

test('G4 accepts inherited protection only when the global hook delegates to deny-by-default access policy', () => {
	const hookSource = "if (event.url.pathname.startsWith('/api/')) { const accessDenial = evaluateApiRouteAccess(path, event.locals.user); }";
	const accessSource = "const PUBLIC_API_PREFIXES = ['/api/health', '/api/auth'] as const; if (!user) return { status: 401, error: 'Authentication required' };";
	const proof = resolveApiGuardEvidenceV1({ hookSource, accessSource });
	assert.equal(proof.verified, true);
	assert.deepEqual(proof.publicPrefixes, ['/api/health', '/api/auth']);
	assert.equal(classifyG4RouteV1({ path: 'src/routes/api/private/+server.ts', inheritedGuardRefs: proof.guardRefs }).classification, 'VERIFIED_PASS');
	assert.equal(resolveApiGuardEvidenceV1({ hookSource, accessSource: "const PUBLIC_API_PREFIXES = ['/api/health'] as const;" }).verified, false);
});

test('G5 recognizes local schema and tRPC input validation; leaves unknown wrappers for review', () => {
	assert.equal(classifyG5HandlerV1({ path: 'src/routes/api/a/+server.ts', parsesBody: true, source: 'schema.safeParse(body)' }).classification, 'VERIFIED_PASS');
	assert.equal(classifyG5HandlerV1({ path: 'src/routes/api/a/+server.ts', parsesBody: true, source: 'const schema = z.object({ id: z.string() }); schema.parse(body);' }).classification, 'VERIFIED_PASS');
	assert.equal(classifyG5HandlerV1({ path: 'src/server/router.ts', trpcProcedure: true, source: 'procedure.input(z.object({ id: z.string() }))' }).classification, 'VERIFIED_PASS');
	assert.equal(classifyG5WithImportedValidationV1({ path: 'src/routes/api/a/+server.ts', parsesBody: true, source: 'const body = await request.json(); parseRequest(body);', importedValidationRefs: ['src/lib/request-policy.ts#parseRequest'] }).classification, 'VERIFIED_PASS');
	assert.equal(classifyG5HandlerV1({ path: 'src/routes/api/a/+server.ts', parsesBody: true }).classification, 'NEEDS_MANUAL_REVIEW');
	assert.equal(classifyG5HandlerV1({ path: 'src/routes/api/a/+server.ts' }).classification, 'NOT_APPLICABLE');
});

test('G63 keeps artifacts, hardcoded IDs, and resolver-backed labels distinct', () => {
	assert.equal(classifyG63ModelReferenceV1({ path: 'src/lib/model.ts', source: "const model = 'gemma4:e4b';" }).classification, 'REAL_GEMMA4_ARTIFACT');
	assert.equal(classifyG63ModelReferenceV1({ path: 'src/lib/model.ts', source: "const request = { model: 'gemma4-chat' };" }).classification, 'HARDCODED_MODEL_ID');
	assert.equal(classifyG63ModelReferenceV1({ path: 'src/routes/api/gemma4-chat-clean/+server.ts', source: 'const model = resolveServerModel(); // gemma4 compatibility route' }).classification, 'STALE_LABEL');
	assert.equal(classifyG63ModelReferenceV1({ path: 'src/lib/model.ts', source: 'logger.info("gemma4")' }).classification, 'NEEDS_MANUAL_REVIEW');
});
