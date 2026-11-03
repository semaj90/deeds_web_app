import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import {
	GroundedExtractionSourceBindingError,
	resolveGroundedExtractionSourceBindingV1,
} from '$lib/server/atlas/identity/grounded-extraction-source-binding-v1.js';
import { requestLangExtractTupleProposalsV1 } from '$lib/server/atlas/integration/langextract-documentation-tuple-proposals-v1.js';

const RequestSchema = z.object({
	text: z.string().min(1).max(20_000),
	packetKey: z.string().min(1).max(256),
	sourceRef: z.string().min(1).max(1_024),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	workspaceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = RequestSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const input = parsed.data;
	if (Buffer.byteLength(input.text, 'utf8') > 10_000) {
		return json({ error: 'Source exceeds the 10000-byte limit' }, { status: 413 });
	}

	try {
		const sourceBytes = Buffer.from(input.text, 'utf8');
		const sourceBinding = await resolveGroundedExtractionSourceBindingV1({
			packetKey: input.packetKey,
			sourceRef: input.sourceRef,
			sourceRevision: input.sourceRevision,
			workspaceRevision: input.workspaceRevision,
			submittedText: input.text,
		});
		const sourceUrl = `atlas-source:${encodeURIComponent(input.sourceRef)}`;
		const proposals = await requestLangExtractTupleProposalsV1({
			sourceBytes,
			sourceRef: input.sourceRef,
			sourceUrl,
			workspaceRevision: input.workspaceRevision,
		});

		return json({
			sourceBinding,
			proposals,
			canonicalAuthority: false,
			writesPerformed: false,
			promotionEligible: false,
		});
	} catch (error) {
		if (error instanceof GroundedExtractionSourceBindingError) {
			return json({
				error: error.code,
				code: error.code,
				canonicalAuthority: false,
				writesPerformed: false,
			}, { status: 409 });
		}
		return json({
			error: 'GROUNDED_TUPLE_PROPOSAL_UNAVAILABLE',
			code: 'GROUNDED_TUPLE_PROPOSAL_UNAVAILABLE',
			canonicalAuthority: false,
			writesPerformed: false,
		}, { status: 503 });
	}
};
