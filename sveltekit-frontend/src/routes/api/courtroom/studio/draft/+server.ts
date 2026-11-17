import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

import {
	CourtroomDraftErrorV1,
	getLatestSyntheticCourtroomDraftV1,
	saveSyntheticCourtroomDraftV1,
	syntheticCourtroomDraftV1Schema,
} from '$lib/server/courtroom/courtroom-draft-artifacts-v1.js';

const RESPONSE_SCHEMA = 'atlas.courtroom-draft-api.v1' as const;
const bodySchema = z.object({
	project: z.unknown(),
	expectedRevision: z.number().int().positive().nullable(),
}).strict();

function failureStatus(error: unknown): number {
	if (error instanceof CourtroomDraftErrorV1) {
		switch (error.code) {
			case 'INVALID_DRAFT': return 400;
			case 'REVISION_CONFLICT': return 409;
			case 'DRAFT_NOT_FOUND': return 404;
			case 'ARTIFACT_STORE_NOT_READY': return 503;
		}
	}
	return 500;
}

function safeError(error: unknown): string {
	if (error instanceof CourtroomDraftErrorV1) return error.message;
	return 'COURTROOM_DRAFT_REQUEST_FAILED';
}

export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });
	if (!locals.user?.id) {
		return json({ schema: RESPONSE_SCHEMA, status: 'UNAUTHORIZED', project: null, artifactId: null, projectRevision: null, error: 'UNAUTHORIZED' }, { status: 401 });
	}
	try {
		const saved = await getLatestSyntheticCourtroomDraftV1(String(locals.user.id));
		if (!saved) {
			return json({ schema: RESPONSE_SCHEMA, status: 'NOT_FOUND', project: null, artifactId: null, projectRevision: null, error: null }, { status: 404 });
		}
		return json({
			schema: RESPONSE_SCHEMA,
			status: 'FOUND',
			project: saved.project,
			artifactId: saved.artifact.artifactId,
			projectRevision: saved.project.projectRevision,
			error: null,
		});
	} catch (error) {
		return json({ schema: RESPONSE_SCHEMA, status: 'ERROR', project: null, artifactId: null, projectRevision: null, error: safeError(error) }, { status: failureStatus(error) });
	}
};

export const POST: RequestHandler = async ({ request, locals, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });
	if (!locals.user?.id) {
		return json({ schema: RESPONSE_SCHEMA, status: 'UNAUTHORIZED', project: null, artifactId: null, projectRevision: null, error: 'UNAUTHORIZED' }, { status: 401 });
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ schema: RESPONSE_SCHEMA, status: 'ERROR', project: null, artifactId: null, projectRevision: null, error: 'INVALID_JSON' }, { status: 400 });
	}
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return json({ schema: RESPONSE_SCHEMA, status: 'ERROR', project: null, artifactId: null, projectRevision: null, error: 'INVALID_REQUEST' }, { status: 400 });
	}
	const project = syntheticCourtroomDraftV1Schema.safeParse(parsed.data.project);
	if (!project.success) {
		return json({ schema: RESPONSE_SCHEMA, status: 'ERROR', project: null, artifactId: null, projectRevision: null, error: 'INVALID_SYNTHETIC_DRAFT' }, { status: 400 });
	}
	try {
		const saved = await saveSyntheticCourtroomDraftV1({
			ownerId: String(locals.user.id),
			expectedRevision: parsed.data.expectedRevision,
			project: project.data,
		});
		return json({
			schema: RESPONSE_SCHEMA,
			status: 'SAVED',
			project: saved.project,
			artifactId: saved.artifact.artifactId,
			projectRevision: saved.project.projectRevision,
			error: null,
		}, { status: 201 });
	} catch (error) {
		return json({ schema: RESPONSE_SCHEMA, status: 'ERROR', project: null, artifactId: null, projectRevision: null, error: safeError(error) }, { status: failureStatus(error) });
	}
};
