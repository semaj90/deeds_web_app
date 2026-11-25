import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import type { RequestHandler } from './$types';

const LABELS = [
	'api', 'auth', 'cache', 'compiler', 'database', 'devops', 'error-handling', 'frontend', 'gpu', 'graph', 'machine-learning', 'retrieval', 'test',
	'database.postgresql', 'devops.env-config', 'devops.process-mgmt', 'frontend.sveltekit', 'AMBIGUOUS', 'NOT_A_DOMAIN', 'SKIP'
] as const;
const requestSchema = z.object({
	datasetSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	rowKey: z.string().min(1).max(512),
	packetKey: z.string().max(512).nullable(),
	sourceRef: z.string().min(1).max(2048),
	choice: z.enum(LABELS),
	supportEvidence: z.string().max(3000),
	blindAtDecision: z.boolean(),
	sourceEvidenceStatus: z.string().max(100).nullable(),
	currentSourceSha256: z.string().max(80).nullable(),
	excerptSha256: z.string().max(80).nullable(),
	startByte: z.number().int().nonnegative().nullable(),
	endByte: z.number().int().nonnegative().nullable()
}).strict();

const repoRoot = () => {
	const cwd = process.cwd();
	return [cwd, path.resolve(cwd, '..'), path.resolve(cwd, '../..')]
		.find((root) => existsSync(path.join(root, 'docs/reports/domain-calibration-gold-v2.jsonl')))
		?? path.resolve(cwd, '..');
};
const datasetPath = () => path.join(repoRoot(), 'docs/reports/domain-calibration-gold-v2.jsonl');
const ledgerPath = () => path.join(repoRoot(), '.tmp/atlas/domain-review/domain-calibration-gold-v2-human-review-decisions-v1.jsonl');
const deny = () => json({ ok: false, decisions: {}, error: 'ADMIN_REVIEW_AUTH_REQUIRED' }, { status: 403, headers: { 'cache-control': 'no-store' } });
const isLoopback = (host: string) => ['localhost', '127.0.0.1', '::1'].includes(host.replace(/^\[|\]$/g, '').toLowerCase());
const allowed = (event: Parameters<RequestHandler>[0]) => event.locals.user?.role === 'admin' && (
	event.locals.session?.id !== 'dev-bypass-session' ||
	(process.env.NODE_ENV === 'development' && ENV.DEV_BYPASS_AUTH && isLoopback(event.url.hostname))
);

async function loadDataset() {
	const bytes = await readFile(datasetPath());
	const datasetSha256 = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
	const rows = bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
	const byKey = new Map(rows.map((row) => [String(row.stableKey || row.packetKey || row.id || ''), row]));
	return { datasetSha256, byKey };
}

export const GET: RequestHandler = async (event) => {
	if (!allowed(event)) return deny();
	try {
		const { datasetSha256 } = await loadDataset();
		let lines: string[] = [];
		try { lines = (await readFile(ledgerPath(), 'utf8')).split(/\r?\n/).filter(Boolean); }
		catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
		const latest: Record<string, Record<string, unknown>> = {};
		for (const line of lines) {
			const record = JSON.parse(line) as Record<string, unknown>;
			if (record.datasetSha256 !== datasetSha256 || record.reviewerId !== event.locals.user!.id) continue;
			latest[String(record.rowKey)] = {
				g: record.choice, note: record.supportEvidence, by: record.reviewerId,
				at: record.savedAt, blindAtDecision: record.blindAtDecision, serverSyncedAt: record.savedAt
			};
		}
		return json({ ok: true, decisions: latest, datasetSha256, error: null }, { headers: { 'cache-control': 'no-store' } });
	} catch {
		return json({ ok: false, decisions: {}, error: 'DOMAIN_REVIEW_DATASET_UNAVAILABLE' }, { status: 503, headers: { 'cache-control': 'no-store' } });
	}
};

export const POST: RequestHandler = async (event) => {
	if (!allowed(event)) return deny();
	const origin = event.request.headers.get('origin');
	if (!origin || origin !== event.url.origin) return json({ ok: false, savedAt: null, error: 'SAME_ORIGIN_REQUIRED' }, { status: 403, headers: { 'cache-control': 'no-store' } });
	let body: unknown;
	try { body = await event.request.json(); }
	catch { return json({ ok: false, savedAt: null, error: 'INVALID_JSON' }, { status: 400, headers: { 'cache-control': 'no-store' } }); }
	const parsed = requestSchema.safeParse(body);
	if (!parsed.success) return json({ ok: false, savedAt: null, error: 'INVALID_REVIEW_DECISION', issues: parsed.error.issues }, { status: 400, headers: { 'cache-control': 'no-store' } });
	try {
		const { datasetSha256, byKey } = await loadDataset();
		const input = parsed.data;
		const row = byKey.get(input.rowKey);
		if (input.datasetSha256 !== datasetSha256 || !row || (row.canonicalSourceRef ?? row.sourceRef) !== input.sourceRef || (row.packetKey ?? null) !== input.packetKey) {
			return json({ ok: false, savedAt: null, error: 'REVIEW_ROW_OR_DATASET_STALE' }, { status: 409, headers: { 'cache-control': 'no-store' } });
		}
		const savedAt = new Date().toISOString();
		const record = {
			schema: 'atlas.domain-calibration-human-review-decision.v1', datasetSha256, rowKey: input.rowKey,
			packetKey: input.packetKey, sourceRef: input.sourceRef, sourceRevision: row.sourceRevision ?? null,
			workspaceRevision: row.workspaceRevision ?? null, choice: input.choice,
			reviewMethod: input.blindAtDecision ? 'BLIND_HUMAN_REVIEW_V1' : 'VISIBLE_HUMAN_REVIEW',
			blindAtDecision: input.blindAtDecision, supportEvidence: input.supportEvidence,
			clientEvidenceSnapshot: {
				sourceEvidenceStatus: input.sourceEvidenceStatus, currentSourceSha256: input.currentSourceSha256,
				excerptSha256: input.excerptSha256, startByte: input.startByte, endByte: input.endByte
			}, reviewerId: event.locals.user!.id, savedAt,
			canonicalAuthority: false, goldEligible: false, writesPerformed: true
		};
		await mkdir(path.dirname(ledgerPath()), { recursive: true });
		await appendFile(ledgerPath(), JSON.stringify(record) + '\n', { encoding: 'utf8', flag: 'a' });
		return json({ ok: true, savedAt, canonicalAuthority: false, goldEligible: false, error: null }, { status: 201, headers: { 'cache-control': 'no-store' } });
	} catch {
		return json({ ok: false, savedAt: null, error: 'DOMAIN_REVIEW_LEDGER_WRITE_FAILED' }, { status: 503, headers: { 'cache-control': 'no-store' } });
	}
};
