import type { SceneGenerationPlanV1 } from './scene-generation-plan-v1.js';
import { findSceneEventConflictsV1 } from '$lib/splat/scene-event-visibility-v1.js';

export interface SceneObjectSelectionV1 {
	id: string;
	label: string;
	room?: string;
	sourceEvidenceId?: string;
	sourceRevision?: string;
	reviewRevision?: string;
}

/** Build a read-only inspector projection from the resolved plan, never client review claims. */
export function buildSceneObjectInspectorV1(plan: SceneGenerationPlanV1, selected: SceneObjectSelectionV1) {
	const actor = plan.actors.find((item) => item.actorId === selected.id) ?? null;
	const primitive = plan.primitives.find((item) => item.objectId === selected.id) ?? null;
	const asset = plan.assets.find((item) => item.assetId === selected.id) ?? null;
	const placements = plan.placements.filter((item) => item.targetId === selected.id);
	const events = plan.events.filter((item) => item.targetRefs.some((target) => target.targetId === selected.id) || item.actorIds.includes(selected.id));
	const conflicts = findSceneEventConflictsV1(events.map((event) => ({
		eventId: event.eventId,
		clockId: event.clock.clockId,
		startMs: event.clock.startMs,
		endMs: event.clock.endMs,
		status: event.reviewStatus === 'accepted' ? 'accepted' as const : event.reviewStatus === 'disputed' ? 'disputed' as const : event.reviewStatus === 'unresolved' ? 'unresolved' as const : 'provisional' as const,
		targetRefs: event.targetRefs,
		action: event.action.type === 'visible_during_interval'
			? { type: 'visible_during_interval' as const, visible: event.action.visible }
			: event.action.type === 'pulse_light_during_interval'
				? {
					type: 'pulse_light_during_interval' as const,
					colorHex: event.action.colorHex,
					minIntensity: event.action.minIntensity,
					maxIntensity: event.action.maxIntensity,
					periodMs: event.action.periodMs
				}
				: {
				type: 'move_during_interval' as const,
				fromMeters: [event.action.fromMeters[0] ?? 0, event.action.fromMeters[1] ?? 0, event.action.fromMeters[2] ?? 0] as [number, number, number],
				toMeters: [event.action.toMeters[0] ?? 0, event.action.toMeters[1] ?? 0, event.action.toMeters[2] ?? 0] as [number, number, number]
			}
	}))).filter((conflict) => conflict.targetId === selected.id);
	const evidenceIds = new Set<string>([
		...(actor?.evidenceIds ?? []),
		...events.flatMap((item) => item.evidenceIds),
		...(selected.sourceEvidenceId ? [selected.sourceEvidenceId] : [])
	]);
	const sources = plan.sources.filter((source) => evidenceIds.has(source.evidenceId));
	const unresolvedEvidenceIds = [...evidenceIds].filter((evidenceId) => !sources.some((source) => source.evidenceId === evidenceId)).sort();
	return {
		object: {
			id: selected.id,
			label: actor?.label ?? primitive?.registryId ?? (asset ? `Asset ${asset.assetId}` : selected.label),
			kind: actor ? 'actor' as const : primitive ? 'primitive' as const : asset ? 'asset' as const : 'scene-object' as const,
			description: actor?.appearance ?? null,
			room: selected.room ?? null,
			placement: placements[0] ?? null,
			sourceEvidenceId: selected.sourceEvidenceId ?? null,
			sourceRevision: selected.sourceRevision ?? null,
			reviewRevision: selected.reviewRevision ?? null
		},
		events: events.map((event) => ({
			eventId: event.eventId,
			label: event.label,
			status: event.status,
			reviewStatus: event.reviewStatus,
			clockId: event.clock.clockId,
			startMs: event.clock.startMs,
			endMs: event.clock.endMs,
			uncertaintyMs: event.clock.uncertaintyMs,
			evidenceIds: event.evidenceIds
		})),
		conflicts,
		sources,
		unresolvedEvidenceIds,
		coordinateStatus: plan.environment.coordinateStatus
	};
}
