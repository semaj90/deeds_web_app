/**
 * Timeline-to-Reconstruction Bridge (CSP-102)
 *
 * Connects aggregated case timeline events from /api/cases/[id]/timeline to
 * the 2D-to-3D Image Synthesis & Reconstruction sidecar (POST /reconstruct on :8092)
 * or the RabbitMQ `comfyui.render` queue.
 */

import { ENV } from '$lib/server/env.server.js';

export interface TimelineEventInput {
	id: string;
	type: string;
	title: string;
	description: string;
	actor: string | null;
	method: string | null;
	reason: string | null;
	timestamp: string;
	metadata?: Record<string, unknown>;
}

export interface ScenePromptPayload {
	who: string;
	what: string;
	why: string;
	how: string;
	location?: string;
	time_of_day?: string;
	weather?: string;
	extra?: string;
}

export interface ReconstructRequestPayload {
	scene: ScenePromptPayload;
	style: string;
	mode: 't2v' | 'i2v';
	num_frames?: number;
	include_depth?: boolean;
	include_pointcloud?: boolean;
	seed?: number;
}

export interface ComfyUIRenderJobEnvelope {
	queue: 'comfyui.render';
	caseId: string;
	jobType: 'timeline_reconstruction';
	payload: {
		scene: ScenePromptPayload;
		workflow: Record<string, unknown>;
		submittedAt: string;
	};
}

/**
 * Extracts and maps timeline events into a structured ScenePrompt (who, what, why, how)
 * suitable for the 3D reconstruction model or ComfyUI rendering.
 */
export function mapTimelineEventsToScenePrompt(
	events: TimelineEventInput[],
	fallbackNarrative: string = 'Forensic incident timeline'
): ScenePromptPayload {
	if (!events || events.length === 0) {
		return {
			who: 'Unknown participants',
			what: fallbackNarrative,
			why: 'Under investigation',
			how: 'Unspecified event sequence',
			location: 'Incident site',
		};
	}

	// 1. Who: unique actors / parties
	const actors = Array.from(
		new Set(
			events
				.map((e) => e.actor?.trim())
				.filter((a): a is string => Boolean(a && a.length > 0))
		)
	);
	const who = actors.length > 0 ? actors.join(', ') : 'Unidentified parties';

	// 2. What: Chronological action summary
	const chronological = [...events].sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
	);
	const actionSummaries = chronological
		.slice(0, 8)
		.map((e) => `[${e.type}] ${e.title}: ${e.description}`)
		.join('; ');
	const what = actionSummaries || fallbackNarrative;

	// 3. Why: Motive / intent / causal reason
	const reasons = chronological
		.map((e) => e.reason?.trim())
		.filter((r): r is string => Boolean(r && r.length > 0));
	const why = reasons.length > 0 ? reasons.join('; ') : 'Forensic case timeline establishing chronology';

	// 4. How: Methods, evidence types, and mechanisms
	const methods = Array.from(
		new Set(
			chronological
				.map((e) => e.method?.trim())
				.filter((m): m is string => Boolean(m && m.length > 0))
		)
	);
	const how = methods.length > 0 ? `Methods observed: ${methods.join(', ')}` : 'Documented forensic timeline progression';

	// 5. Time & Location from earliest event
	const earliest = chronological[0];
	let timeOfDay: string | undefined;
	if (earliest?.timestamp) {
		const hour = new Date(earliest.timestamp).getUTCHours();
		if (hour >= 5 && hour < 12) timeOfDay = 'morning';
		else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
		else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
		else timeOfDay = 'night';
	}

	return {
		who,
		what,
		why,
		how,
		location: 'Incident Scene',
		time_of_day: timeOfDay,
	};
}

/**
 * Builds a valid ReconstructRequest for the :8092 image synthesis sidecar.
 */
export function buildTimelineReconstructionPayload(
	events: TimelineEventInput[],
	options: {
		style?: string;
		mode?: 't2v' | 'i2v';
		seed?: number;
		num_frames?: number;
		include_depth?: boolean;
		include_pointcloud?: boolean;
	} = {}
): ReconstructRequestPayload {
	const scene = mapTimelineEventsToScenePrompt(events);
	return {
		scene,
		style: options.style ?? 'photorealistic crime scene forensic photography cinematic 8k',
		mode: options.mode ?? 't2v',
		num_frames: options.num_frames ?? 16,
		include_depth: options.include_depth ?? true,
		include_pointcloud: options.include_pointcloud ?? false,
		seed: options.seed,
	};
}

/**
 * Submits the reconstruction payload to the Image Synthesis & 3D Reconstruction service on :8092.
 */
export async function submitReconstructionToSidecar(
	payload: ReconstructRequestPayload,
	fetchFn: typeof fetch = fetch,
	sidecarBaseUrl?: string
): Promise<{ ok: boolean; status: string; data?: unknown; error?: string }> {
	const baseUrl = sidecarBaseUrl ?? ENV.IMAGE_SYNTHESIS_URL ?? 'http://localhost:8092';

	try {
		const resp = await fetchFn(`${baseUrl}/reconstruct`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		if (!resp.ok) {
			const errorText = await resp.text().catch(() => resp.statusText);
			return {
				ok: false,
				status: 'error',
				error: `Sidecar error (${resp.status}): ${errorText}`,
			};
		}

		const data = await resp.json().catch(() => null);
		return {
			ok: true,
			status: 'completed',
			data,
		};
	} catch (err: any) {
		return {
			ok: false,
			status: 'unavailable',
			error: `Reconstruction sidecar unreachable on ${baseUrl}: ${err?.message ?? 'connection refused'}`,
		};
	}
}

/**
 * Encapsulates the reconstruction job for the `comfyui.render` RabbitMQ queue.
 */
export function buildComfyUIRenderJob(
	caseId: string,
	scene: ScenePromptPayload,
	workflowTemplate: Record<string, unknown> = {}
): ComfyUIRenderJobEnvelope {
	return {
		queue: 'comfyui.render',
		caseId,
		jobType: 'timeline_reconstruction',
		payload: {
			scene,
			workflow: workflowTemplate,
			submittedAt: new Date().toISOString(),
		},
	};
}
