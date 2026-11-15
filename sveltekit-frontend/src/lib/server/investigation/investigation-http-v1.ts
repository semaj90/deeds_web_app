/** Shared HTTP plumbing for the investigation routes: case authorization and error mapping. */
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { InvestigationError } from './investigation-v1.js';

export const uuidSchema = z.uuid();

export type ActorAccess = { actorId: number } | { response: Response };

/** Resolves the signed-in actor and confirms case access. Returns a ready Response on failure. */
export async function authorizeCaseActor(
	locals: App.Locals,
	caseId: string
): Promise<ActorAccess> {
	const parsedCase = uuidSchema.safeParse(caseId);
	if (!parsedCase.success) {
		return { response: json({ success: false, data: null, message: 'Invalid case id' }, { status: 400 }) };
	}
	if (!locals.user?.id) {
		return { response: json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 }) };
	}
	const actorId = Number(locals.user.id);
	if (!Number.isSafeInteger(actorId) || actorId <= 0) {
		return { response: json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 }) };
	}
	let authorized: Awaited<ReturnType<typeof getAuthorizedCase>>;
	try {
		authorized = await getAuthorizedCase(parsedCase.data, actorId);
	} catch {
		return { response: json({ success: false, data: null, message: 'Case authorization failed' }, { status: 500 }) };
	}
	if (!authorized) {
		return { response: json({ success: false, data: null, message: 'Case not found' }, { status: 404 }) };
	}
	return { actorId };
}

/** Maps a thrown error to a response. Domain errors keep their code and status; others are generic. */
export function errorResponse(cause: unknown, context: string): Response {
	if (cause instanceof InvestigationError) {
		return json(
			{ success: false, data: cause.details ?? null, code: cause.code, message: cause.message },
			{ status: cause.status }
		);
	}
	console.error(`[investigation] ${context} failed`, cause instanceof Error ? cause.name : 'unknown');
	return json({ success: false, data: null, message: 'Investigation request failed' }, { status: 500 });
}
