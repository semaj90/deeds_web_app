import type { AgentVisualState, AgentVisualStatus } from '$lib/types/agent.js';
import type { WorkflowEvent, WorkflowEventType } from '$lib/client/workflow-event-stream.js';

const WORKFLOW_STATUS: Record<WorkflowEventType, AgentVisualStatus> = {
	SSE_CONNECTED: 'SEARCHING',
	SSE_ERROR: 'BLOCKED',
	WORKFLOW_COMPLETE: 'DONE',
	WORKFLOW_ERROR: 'BLOCKED',
	OCR_COMPLETE: 'ANALYZING',
	OCR_ERROR: 'BLOCKED',
	EMBEDDING_COMPLETE: 'ANALYZING',
	EMBEDDING_ERROR: 'BLOCKED',
	ENTITY_COMPLETE: 'EDITING',
	ENTITY_ERROR: 'BLOCKED',
	SUMMARY_COMPLETE: 'ANALYZING',
	SUMMARY_ERROR: 'BLOCKED',
	SCHEMA_LOOKUP_COMPLETE: 'SEARCHING',
	RERANK_COMPLETE: 'ANALYZING',
	KAG_COMPLETE: 'ANALYZING',
	SCAFFOLD_WARMED: 'SEARCHING',
	ASSIST_COMPLETE: 'DONE',
	ASSIST_ERROR: 'BLOCKED',
	PIPELINE_STAGE_START: 'SEARCHING',
	PIPELINE_STAGE_DONE: 'ANALYZING',
	PIPELINE_STAGE_ERROR: 'BLOCKED',
};

const WORKFLOW_TYPES = new Set<WorkflowEventType>([
	'SSE_CONNECTED',
	'SSE_ERROR',
	'WORKFLOW_COMPLETE',
	'WORKFLOW_ERROR',
	'OCR_COMPLETE',
	'OCR_ERROR',
	'EMBEDDING_COMPLETE',
	'EMBEDDING_ERROR',
	'ENTITY_COMPLETE',
	'ENTITY_ERROR',
	'SUMMARY_COMPLETE',
	'SUMMARY_ERROR',
	'SCHEMA_LOOKUP_COMPLETE',
	'RERANK_COMPLETE',
	'KAG_COMPLETE',
	'SCAFFOLD_WARMED',
	'ASSIST_COMPLETE',
	'ASSIST_ERROR',
	'PIPELINE_STAGE_START',
	'PIPELINE_STAGE_DONE',
	'PIPELINE_STAGE_ERROR',
]);

export function isWorkflowVisualEventType(type: string): type is WorkflowEventType {
	return WORKFLOW_TYPES.has(type as WorkflowEventType);
}

export function workflowEventKey(event: WorkflowEvent, sessionId: string): string {
	const label = (event.label ?? event.type).trim().replace(/\s+/g, '-').toLowerCase();
	return `${sessionId}:${label}`;
}

function hashString(input: string): number {
	let hash = 2166136261;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function deriveState(event: WorkflowEvent): AgentVisualStatus {
	return WORKFLOW_STATUS[event.type] ?? 'SEARCHING';
}

function deriveProgress(event: WorkflowEvent, previous?: AgentVisualState): number {
	if (event.type === 'WORKFLOW_COMPLETE' || event.type === 'ASSIST_COMPLETE') return 100;
	if (event.type === 'WORKFLOW_ERROR' || event.type === 'ASSIST_ERROR') return 0;
	if (event.type.endsWith('_ERROR')) return 0;
	if (event.type.endsWith('_COMPLETE')) return clamp((previous?.progress ?? 40) + 18, 0, 100);
	if (event.type === 'PIPELINE_STAGE_START' || event.type === 'SSE_CONNECTED') {
		return Math.max(previous?.progress ?? 0, 8);
	}
	return previous?.progress ?? 0;
}

function deriveMetrics(event: WorkflowEvent, previous?: AgentVisualState) {
	const data = event.data ?? {};
	const durationMs = typeof event.durationMs === 'number' ? event.durationMs : undefined;
	const labelLength = (event.label ?? event.type).length;
	const confidenceBase = previous?.confidence ?? 0.36;
	const evidenceBase = previous?.evidence ?? 0.28;
	const activityBase = previous?.activity ?? 0.44;

	const confidence =
		event.type.endsWith('_ERROR') ? 0.12 : clamp(confidenceBase + 0.11, 0.1, 0.96);
	const evidence =
		event.type.endsWith('_COMPLETE') || event.type === 'WORKFLOW_COMPLETE'
			? clamp(evidenceBase + 0.18, 0.1, 0.98)
			: clamp(evidenceBase + 0.05, 0.05, 0.92);
	const activity = clamp(
		activityBase + (event.type === 'PIPELINE_STAGE_START' || event.type === 'SSE_CONNECTED' ? 0.16 : 0.08),
		0.06,
		0.98,
	);

	const hasMessage = typeof event.label === 'string' || typeof event.error === 'string';
	const messageWeight = hasMessage ? 0.07 : 0.03;
	const dataWeight = Object.keys(data).length > 0 ? 0.08 : 0.02;

	return {
		confidence,
		evidence,
		activity,
		sprites: clamp((previous?.spriteId ?? 0) + 1, 0, 255),
		paletteIndex: hashString(event.type) % 7,
		animationId: hashString(event.label ?? event.type) % 32,
		clusterX: clamp((hashString(event.label ?? event.type) % 20) + (durationMs ? durationMs % 3 : 0), 0, 19),
		clusterY: clamp((hashString(sessionKeyFromEvent(event)) >> 4) % 20, 0, 19),
		agentPhaseNoise: labelLength % 5,
		messageWeight,
		dataWeight,
	};
}

function sessionKeyFromEvent(event: WorkflowEvent): string {
	return `${event.sessionId ?? ''}:${event.label ?? event.type}`;
}

export function buildWorkflowAgentVisualState(
	event: WorkflowEvent,
	sessionId: string,
	previous?: AgentVisualState,
): AgentVisualState {
	const key = workflowEventKey(event, sessionId);
	const hash = hashString(key);
	const metrics = deriveMetrics(event, previous);
	const state = deriveState(event);
	const progress = deriveProgress(event, previous);
	const centerX = 24 + (hash % 18) * 28;
	const centerY = 20 + ((hash >>> 5) % 10) * 22;
	const offsetX = previous ? (previous.x - previous.previousX) * 0.5 : ((hash >>> 9) % 7) - 3;
	const offsetY = previous ? (previous.y - previous.previousY) * 0.5 : ((hash >>> 13) % 7) - 3;

	return {
		agentId: key,
		state,
		progress,
		confidence: metrics.confidence,
		evidence: metrics.evidence,
		activity: metrics.activity,
		clusterX: metrics.clusterX,
		clusterY: metrics.clusterY,
		previousX: previous?.x ?? centerX - 16,
		previousY: previous?.y ?? centerY - 10,
		x: centerX + offsetX,
		y: centerY + offsetY,
		spriteId: metrics.sprites,
		paletteIndex: metrics.paletteIndex,
		animationId: metrics.animationId,
		updatedAtMs: Date.now(),
	};
}

export function mergeWorkflowAgentVisualState(
	current: AgentVisualState[],
	event: WorkflowEvent,
	sessionId: string,
	limit = 8,
): AgentVisualState[] {
	if (!isWorkflowVisualEventType(event.type)) return current;
	const key = workflowEventKey(event, sessionId);
	const previous = current.find((state) => state.agentId === key);
	const nextState = buildWorkflowAgentVisualState(event, sessionId, previous);
	const next = [nextState, ...current.filter((state) => state.agentId !== key)];
	return next.slice(0, Math.max(1, limit));
}
