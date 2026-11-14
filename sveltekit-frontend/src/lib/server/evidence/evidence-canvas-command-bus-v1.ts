import { z } from 'zod';

export const evidenceCanvasCommandV1Schema = z.discriminatedUnion('command', [
	z.object({
		command: z.literal('evidence.add_pin'),
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(1),
		label: z.string().trim().min(1).max(200).optional()
	}).strict(),
	z.object({
		command: z.literal('evidence.add_rect'),
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(1),
		width: z.number().gt(0).max(1),
		height: z.number().gt(0).max(1),
		label: z.string().trim().min(1).max(200).optional()
	}).strict().refine((value) => value.x + value.width <= 1 && value.y + value.height <= 1, {
		message: 'Rectangle bounds exceed normalized [0, 1] canvas'
	}),
	z.object({
		command: z.literal('evidence.add_arrow'),
		x1: z.number().min(0).max(1),
		y1: z.number().min(0).max(1),
		x2: z.number().min(0).max(1),
		y2: z.number().min(0).max(1),
		label: z.string().trim().min(1).max(200).optional()
	}).strict(),
	z.object({
		command: z.literal('evidence.add_text'),
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(1),
		text: z.string().trim().min(1).max(500)
	}).strict(),
	z.object({
		command: z.literal('video.seek_keyframe'),
		timestampMs: z.number().int().min(0).max(86_400_000),
		dhashHex: z.string().regex(/^[0-9a-f]{16}$/).optional()
	}).strict(),
	z.object({
		command: z.literal('evidence.clear_markup')
	}).strict()
]);

export type EvidenceCanvasCommandV1 = z.infer<typeof evidenceCanvasCommandV1Schema>;

export interface EvidenceCanvasCommandEnvelopeV1 {
	id: string;
	evidenceId: string;
	sequence: number;
	createdAt: string;
	command: EvidenceCanvasCommandV1;
}

const MAX_RECENT_COMMANDS_PER_EVIDENCE = 100;
const recentByEvidence = new Map<string, EvidenceCanvasCommandEnvelopeV1[]>();
const subscribersByEvidence = new Map<string, Set<(envelope: EvidenceCanvasCommandEnvelopeV1) => void>>();
let nextSequence = 1;

export function publishEvidenceCanvasCommandV1(
	evidenceId: string,
	command: EvidenceCanvasCommandV1
): EvidenceCanvasCommandEnvelopeV1 {
	const sequence = nextSequence;
	nextSequence += 1;

	const envelope: EvidenceCanvasCommandEnvelopeV1 = {
		id: `canvas-cmd-${sequence}`,
		evidenceId,
		sequence,
		createdAt: new Date().toISOString(),
		command
	};

	const ring = recentByEvidence.get(evidenceId) ?? [];
	ring.push(envelope);
	if (ring.length > MAX_RECENT_COMMANDS_PER_EVIDENCE) {
		ring.splice(0, ring.length - MAX_RECENT_COMMANDS_PER_EVIDENCE);
	}
	recentByEvidence.set(evidenceId, ring);

	const listeners = subscribersByEvidence.get(evidenceId);
	if (listeners) {
		for (const listener of listeners) {
			try {
				listener(envelope);
			} catch {
				// Subscriber failures must not abort delivery to remaining listeners.
			}
		}
	}

	return envelope;
}

export function subscribeEvidenceCanvasCommandsV1(
	evidenceId: string,
	listener: (envelope: EvidenceCanvasCommandEnvelopeV1) => void
): () => void {
	let listeners = subscribersByEvidence.get(evidenceId);
	if (!listeners) {
		listeners = new Set();
		subscribersByEvidence.set(evidenceId, listeners);
	}
	listeners.add(listener);

	return () => {
		const active = subscribersByEvidence.get(evidenceId);
		if (!active) return;
		active.delete(listener);
		if (active.size === 0) {
			subscribersByEvidence.delete(evidenceId);
		}
	};
}

export function getRecentEvidenceCanvasCommandsV1(
	evidenceId: string
): EvidenceCanvasCommandEnvelopeV1[] {
	return [...(recentByEvidence.get(evidenceId) ?? [])];
}

export function clearEvidenceCanvasCommandsForTestV1(evidenceId?: string): void {
	if (evidenceId !== undefined) {
		recentByEvidence.delete(evidenceId);
		subscribersByEvidence.delete(evidenceId);
		return;
	}
	recentByEvidence.clear();
	subscribersByEvidence.clear();
	nextSequence = 1;
}

export function formatEvidenceCanvasSseEventV1(
	event: 'connected' | 'canvas-command' | 'ping',
	payload: Record<string, unknown>
): string {
	return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}
