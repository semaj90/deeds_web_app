import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { loadRuntimeErrorPriorities } from '$lib/server/atlas/board/runtime-error-priorities.js';
import {
	repairCanonicalErrorKeyV1,
	repairErrorFingerprintV1,
	verifyRepairEpisodeV1,
} from '$lib/server/atlas/agentic/contracts/repair-episode-verifier-v1.js';

const SnapshotSchema = z.object({
	workspaceRevision: z.string().min(1),
	sourceRevision: z.string().min(1),
	fingerprints: z.array(z.string().min(1)),
});

const VerifyBodySchema = z.object({
	before: SnapshotSchema,
	after: SnapshotSchema,
	targetFingerprints: z.array(z.string().min(1)).min(1),
});

const EMPTY_GET = {
	status: 'UNAVAILABLE',
	canonicalAuthority: false,
	writesPerformed: false,
	total: 0,
	candidates: [] as Array<{
		fingerprint: string;
		canonicalErrorKey: string;
		repairFingerprint: string | null;
		firstAppFrame: string | null;
		priorityScore: number;
	}>,
};

export const GET: RequestHandler = async ({ locals }) => {
	const headers = { 'Cache-Control': 'no-store' };
	if (locals.user?.role !== 'admin') {
		return json(EMPTY_GET, { status: locals.user ? 403 : 401, headers });
	}
	const report = await loadRuntimeErrorPriorities();
	if (report.status === 'UNAVAILABLE') {
		return json(EMPTY_GET, { status: 503, headers });
	}
	return json({
		status: 'AVAILABLE',
		canonicalAuthority: false,
		writesPerformed: false,
		total: report.total,
		candidates: report.top10.map((entry) => ({
			fingerprint: entry.fingerprint,
			canonicalErrorKey: entry.canonicalErrorKey,
			repairFingerprint: entry.firstAppFrame
				? repairErrorFingerprintV1({
						file: entry.firstAppFrame,
						code: entry.kind,
						message: entry.message,
					})
				: null,
			canonicalJoinKeyCheck: repairCanonicalErrorKeyV1({
				file: entry.firstAppFrame ?? entry.routePath,
				code: entry.kind,
				message: entry.message,
			}),
			firstAppFrame: entry.firstAppFrame,
			priorityScore: entry.priorityScore,
		})),
	}, { headers });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const headers = { 'Cache-Control': 'no-store' };
	if (locals.user?.role !== 'admin') {
		return json({ error: 'ADMIN_REQUIRED', canonicalAuthority: false, writesPerformed: false }, { status: locals.user ? 403 : 401, headers });
	}
	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return json({ error: 'INVALID_JSON', canonicalAuthority: false, writesPerformed: false }, { status: 400, headers });
	}
	const parsed = VerifyBodySchema.safeParse(rawBody);
	if (!parsed.success) {
		return json({
			error: 'INVALID_REPAIR_VERIFICATION_PAYLOAD',
			issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
			canonicalAuthority: false,
			writesPerformed: false,
		}, { status: 400, headers });
	}
	try {
		const verification = verifyRepairEpisodeV1(parsed.data);
		return json({
			status: 'VERIFIED',
			canonicalAuthority: false,
			writesPerformed: false,
			verification,
		}, { headers });
	} catch (error) {
		return json({
			error: error instanceof Error ? error.message : 'VERIFICATION_FAILED',
			canonicalAuthority: false,
			writesPerformed: false,
		}, { status: 422, headers });
	}
};
