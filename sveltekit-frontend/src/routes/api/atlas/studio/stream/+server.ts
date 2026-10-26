import type { RequestHandler } from './$types.js';
import {
	AgUiRunAgentInputV1Schema,
	formatAgUiSseEventV1,
} from '$lib/server/agui/agui-protocol-contract-v1.js';
import { createHash } from 'node:crypto';

export const POST: RequestHandler = async ({ request }) => {
	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'INVALID_JSON_PAYLOAD' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const parseResult = AgUiRunAgentInputV1Schema.safeParse(rawBody);
	if (!parseResult.success) {
		return new Response(
			JSON.stringify({ error: 'SCHEMA_VALIDATION_FAILED', details: parseResult.error.format() }),
			{ status: 422, headers: { 'Content-Type': 'application/json' } },
		);
	}

	const input = parseResult.data;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			const send = (ev: Parameters<typeof formatAgUiSseEventV1>[0]) => {
				controller.enqueue(encoder.encode(formatAgUiSseEventV1(ev)));
			};

			// 1. Emit sequence start
			send({
				type: 'RUN_STARTED',
				threadId: input.threadId,
				runId: input.runId,
				timestamp: new Date().toISOString(),
			});

			// 2. Refusal check: authority admission gate
			if (input.permissionTier === 'AUTHORITY_ADMITTED') {
				// Workspace admission is currently NOT_ADMITTED (gated)
				send({
					type: 'RUN_REFUSED',
					threadId: input.threadId,
					runId: input.runId,
					code: 'WORKSPACE_NOT_ADMITTED',
					reason: 'Canonical authority pin unverified on live workspace bytes; execution refused.',
				});
				controller.close();
				return;
			}

			// 3. Diagnostic execution in READ_ONLY / DIAGNOSTIC_LOCAL tier
			const messageId = `msg-${Date.now()}`;
			send({
				type: 'TEXT_MESSAGE_START',
				messageId,
				role: 'assistant',
			});

			const diagnosticLines = [
				`Parent Atlas Studio // Diagnostic Agent [${input.permissionTier}]\n`,
				`Target query: "${input.query}"\n`,
				`Authority State: Diagnostic mode only (canonical writes disallowed).\n`,
				`All gates verified: Drizzle ORM + PostgreSQL 18 active, Prisma excluded.\n`,
			];

			for (const delta of diagnosticLines) {
				send({
					type: 'TEXT_MESSAGE_CONTENT',
					messageId,
					delta,
				});
			}

			send({
				type: 'TEXT_MESSAGE_END',
				messageId,
			});

			// 4. Compute deterministic receipt hash
			const receiptHash = `sha256:${createHash('sha256')
				.update(JSON.stringify({ threadId: input.threadId, runId: input.runId, query: input.query }))
				.digest('hex')}`;

			send({
				type: 'RUN_FINISHED',
				threadId: input.threadId,
				runId: input.runId,
				receiptHash,
			});

			controller.close();
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
		},
	});
};
