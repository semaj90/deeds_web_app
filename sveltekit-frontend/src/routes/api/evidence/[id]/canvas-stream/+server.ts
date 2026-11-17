import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isUuid } from '$lib/server/validation.js';
import {
	evidenceCanvasCommandV1Schema,
	formatEvidenceCanvasSseEventV1,
	getRecentEvidenceCanvasCommandsV1,
	publishEvidenceCanvasCommandV1,
	subscribeEvidenceCanvasCommandsV1
} from '$lib/server/evidence/evidence-canvas-command-bus-v1.js';

function isAuthorized(locals: App.Locals): boolean {
	return Boolean(locals.user);
}

export const GET: RequestHandler = async ({ params, url, request, locals }) => {
	const evidenceId = params.id ?? '';
	const wantsStream =
		url.searchParams.get('stream') === '1' ||
		(request.headers.get('accept')?.includes('text/event-stream') ?? false);

	if (!isAuthorized(locals)) {
		if (wantsStream) return new Response('Unauthorized', { status: 401 });
		return json({ ok: false, evidenceId, commands: [], error: 'Unauthorized' }, { status: 401 });
	}

	if (!isUuid(evidenceId)) {
		if (wantsStream) return new Response('Invalid evidence ID', { status: 400 });
		return json({ ok: false, evidenceId, commands: [], error: 'Invalid evidence ID' }, { status: 400 });
	}

	if (!wantsStream) {
		return json({
			ok: true,
			evidenceId,
			commands: getRecentEvidenceCanvasCommandsV1(evidenceId),
			error: null
		});
	}

	const encoder = new TextEncoder();
	let isClosed = false;
	let unsubscribe: (() => void) | null = null;
	let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

	const cleanup = () => {
		if (isClosed) return;
		isClosed = true;
		if (unsubscribe) {
			unsubscribe();
			unsubscribe = null;
		}
		if (keepAliveInterval) {
			clearInterval(keepAliveInterval);
			keepAliveInterval = null;
		}
	};

	const stream = new ReadableStream({
		start(controller) {
			const safeEnqueue = (chunk: string) => {
				if (isClosed) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					cleanup();
				}
			};

			safeEnqueue(
				formatEvidenceCanvasSseEventV1('connected', {
					evidenceId,
					recentCount: getRecentEvidenceCanvasCommandsV1(evidenceId).length
				})
			);

			unsubscribe = subscribeEvidenceCanvasCommandsV1(evidenceId, (envelope) => {
				safeEnqueue(
					formatEvidenceCanvasSseEventV1(
						'canvas-command',
						envelope as unknown as Record<string, unknown>
					)
				);
			});

			keepAliveInterval = setInterval(() => {
				safeEnqueue(formatEvidenceCanvasSseEventV1('ping', { ts: Date.now() }));
			}, 15_000);

			if (request.signal) {
				if (request.signal.aborted) {
					cleanup();
					try {
						controller.close();
					} catch {
						/* already closed */
					}
					return;
				}
				request.signal.addEventListener(
					'abort',
					() => {
						cleanup();
						try {
							controller.close();
						} catch {
							/* already closed */
						}
					},
					{ once: true }
				);
			}
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const evidenceId = params.id ?? '';
	if (!isAuthorized(locals)) {
		return json({ ok: false, evidenceId, error: 'Unauthorized' }, { status: 401 });
	}
	if (!isUuid(evidenceId)) {
		return json({ ok: false, evidenceId, error: 'Invalid evidence ID' }, { status: 400 });
	}

	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return json({ ok: false, evidenceId, error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = evidenceCanvasCommandV1Schema.safeParse(rawBody);
	if (!parsed.success) {
		return json(
			{
				ok: false,
				evidenceId,
				error: parsed.error.issues[0]?.message ?? 'Invalid canvas command payload'
			},
			{ status: 400 }
		);
	}

	const envelope = publishEvidenceCanvasCommandV1(evidenceId, parsed.data);
	return json({ ok: true, evidenceId, envelope }, { status: 201 });
};
