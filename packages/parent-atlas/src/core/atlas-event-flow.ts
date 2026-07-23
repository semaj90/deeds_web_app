import { z } from 'zod';

function normalizeText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function uniqueTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => normalizeText(item)).filter(Boolean))];
}

function stableSeed(...parts: Array<string | null | undefined>): string {
  return parts.map((part) => normalizeText(part)).filter(Boolean).join(':');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);

  return `{${entries.join(',')}}`;
}

function resolveEventState(candidate: Record<string, unknown>): string {
  const explicitState = normalizeText(
    candidate.state ??
      candidate.event_state ??
      candidate.eventState,
  ).toUpperCase();

  if (explicitState) return explicitState;

  const flowStatus = normalizeText(candidate.status).toUpperCase();
  if (flowStatus === 'PASS') return 'PROVEN';
  if (flowStatus === 'FAIL') return 'BLOCKED_EXTERNAL';
  if (flowStatus === 'WARN') return 'WIRED';

  return 'WIRED';
}

export const ATLAS_EVENT_STATE_VALUES = [
  'CREATED',
  'WIRED',
  'PROVEN',
  'DONE',
  'BLOCKED_EXTERNAL',
  'REFERENCE_ONLY',
] as const;

export const ATLAS_EVENT_SOURCE_VALUES = [
  'checkpoint',
  'signal',
  'recommended_action',
  'workflow_task',
] as const;

export const ATLAS_EVENT_KIND_VALUES = [
  'checkpoint',
  'answer',
  'open_file',
  'inspect_symbol',
  'create_task',
  'update_task',
  'run_validation',
  'enqueue_enrichment',
  'continue_research',
  'generate_infographic',
  'request_approval',
  'stop',
  'proposed',
  'approved',
  'queued',
  'running',
  'blocked',
  'completed',
  'failed',
  'cancelled',
] as const;

export const atlasEventStateSchema = z.enum(ATLAS_EVENT_STATE_VALUES);
export const atlasEventSourceSchema = z.enum(ATLAS_EVENT_SOURCE_VALUES);
export const atlasEventKindSchema = z.enum(ATLAS_EVENT_KIND_VALUES);

export const atlasEventSchema = z.object({
  event_id: z.string().min(1),
  source: atlasEventSourceSchema,
  event: atlasEventKindSchema,
  state: atlasEventStateSchema,
  lane: z.string().min(1),
  gate: z.string().min(1).nullable().optional(),
  task_id: z.string().min(1).nullable().optional(),
  story_id: z.string().min(1).nullable().optional(),
  trace_id: z.string().min(1).nullable().optional(),
  query: z.string().min(1).nullable().optional(),
  summary: z.string().min(1),
  next_steps: z.array(z.string().min(1)).default([]),
  evidence_refs: z.array(z.string().min(1)).default([]),
  evidence_packet_keys: z.array(z.string().min(1)).default([]),
  source_ref: z.string().min(1).nullable().optional(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const atlasEventFlowSchema = z.object({
  flow_id: z.string().min(1),
  contract_version: z.literal('atlas-event-flow-v1'),
  repository: z.string().min(1),
  source_root: z.string().min(1),
  generated_at: z.string().min(1),
  status: z.enum(['PASS', 'WARN', 'FAIL']),
  events: z.array(atlasEventSchema),
  summary: z.object({
    event_count: z.number().int().nonnegative(),
    created_count: z.number().int().nonnegative(),
    wired_count: z.number().int().nonnegative(),
    proven_count: z.number().int().nonnegative(),
    done_count: z.number().int().nonnegative(),
    blocked_count: z.number().int().nonnegative(),
    next_step_count: z.number().int().nonnegative(),
  }),
  evidence_refs: z.array(z.string().min(1)).default([]),
  notes: z.array(z.string().min(1)).default([]),
  next_safe_action: z.string().min(1),
});

export type AtlasEventState = z.infer<typeof atlasEventStateSchema>;
export type AtlasEventSource = z.infer<typeof atlasEventSourceSchema>;
export type AtlasEventKind = z.infer<typeof atlasEventKindSchema>;
export type AtlasEvent = z.infer<typeof atlasEventSchema>;
export type AtlasEventFlow = z.infer<typeof atlasEventFlowSchema>;

function normalizeEvent(input: unknown, fallbackEventId = ''): AtlasEvent {
  const candidate = (input && typeof input === 'object' && !Array.isArray(input))
    ? (input as Record<string, unknown>)
    : {};

  const state = resolveEventState(candidate);
  const event = normalizeText(candidate.event ?? candidate.kind).toLowerCase();
  const source = normalizeText(candidate.source ?? candidate.source_type ?? candidate.sourceType).toLowerCase();

  return atlasEventSchema.parse({
    event_id: normalizeText(candidate.event_id ?? candidate.eventId) || fallbackEventId || stableSeed(source, event, candidate.lane as string, candidate.summary as string),
    source: atlasEventSourceSchema.parse(source || 'checkpoint'),
    event: atlasEventKindSchema.parse(event || 'checkpoint'),
    state: atlasEventStateSchema.parse(state || 'WIRED'),
    lane: normalizeText(candidate.lane) || 'daily-graphify',
    gate: normalizeText(candidate.gate) || null,
    task_id: normalizeText(candidate.task_id ?? candidate.taskId) || null,
    story_id: normalizeText(candidate.story_id ?? candidate.storyId) || null,
    trace_id: normalizeText(candidate.trace_id ?? candidate.traceId) || null,
    query: normalizeText(candidate.query ?? candidate.raw_query ?? candidate.rawQuery) || null,
    summary: normalizeText(candidate.summary ?? candidate.title ?? candidate.rationale ?? candidate.next_action ?? candidate.nextAction),
    next_steps: uniqueTextArray(candidate.next_steps ?? candidate.nextSteps),
    evidence_refs: uniqueTextArray(candidate.evidence_refs ?? candidate.evidenceRefs),
    evidence_packet_keys: uniqueTextArray(candidate.evidence_packet_keys ?? candidate.evidencePacketKeys),
    source_ref: normalizeText(candidate.source_ref ?? candidate.sourceRef) || null,
    created_at: normalizeText(candidate.created_at ?? candidate.createdAt ?? candidate.generated_at ?? candidate.generatedAt ?? new Date().toISOString()),
    updated_at: normalizeText(candidate.updated_at ?? candidate.updatedAt ?? candidate.generated_at ?? candidate.generatedAt ?? new Date().toISOString()),
    payload: (candidate.payload && typeof candidate.payload === 'object' && !Array.isArray(candidate.payload))
      ? (candidate.payload as Record<string, unknown>)
      : {},
  });
}

export function normalizeAtlasEvent(input: unknown): AtlasEvent {
  return normalizeEvent(input);
}

export function buildAtlasEventFlow(input: unknown): AtlasEventFlow {
  const candidate = (input && typeof input === 'object' && !Array.isArray(input))
    ? (input as Record<string, unknown>)
    : {};
  const generatedAt = normalizeText(candidate.generated_at ?? candidate.generatedAt ?? new Date().toISOString());
  const baseEvent = normalizeEvent({
    event_id: candidate.event_id ?? candidate.eventId,
    source: 'checkpoint',
    event: 'checkpoint',
    state:
      candidate.state ??
      candidate.event_state ??
      candidate.eventState ??
      (normalizeText(candidate.status).toUpperCase() === 'PASS'
        ? 'PROVEN'
        : normalizeText(candidate.status).toUpperCase() === 'FAIL'
          ? 'BLOCKED_EXTERNAL'
          : 'WIRED'),
    lane: candidate.lane ?? 'daily-graphify',
    gate: candidate.gate ?? 'control-plane-summary',
    summary: candidate.summary ?? 'Daily graphify control-plane event flow',
    next_steps: candidate.next_steps ?? candidate.nextSteps ?? [],
    evidence_refs: candidate.evidence_refs ?? candidate.evidenceRefs ?? [],
    evidence_packet_keys: candidate.evidence_packet_keys ?? candidate.evidencePacketKeys ?? [],
    source_ref: candidate.source_ref ?? candidate.sourceRef ?? null,
    created_at: generatedAt,
    updated_at: generatedAt,
  }, `${stableSeed(candidate.repository as string, generatedAt, candidate.lane as string)}:checkpoint`);

  const suppliedEvents = Array.isArray(candidate.events)
    ? candidate.events.map((event, index) =>
      normalizeEvent(
        event,
        stableSeed(baseEvent.event_id, 'event', String(index)),
      ),
    )
    : [];

  const events = suppliedEvents.length > 0
    ? suppliedEvents
    : [
        baseEvent,
        ...uniqueTextArray(candidate.recommendation_signals).map((value, index) =>
          normalizeEvent({
            event_id: stableSeed(baseEvent.event_id, 'signal', String(index), value),
            source: 'signal',
            event: 'run_validation',
            state: 'PROVEN',
            lane: 'daily-graphify',
            gate: candidate.gate ?? 'daily-graphify',
            summary: value,
            next_steps: uniqueTextArray(candidate.next_steps ?? candidate.nextSteps),
            evidence_refs: uniqueTextArray(candidate.evidence_refs ?? candidate.evidenceRefs),
            created_at: generatedAt,
            updated_at: generatedAt,
          }, stableSeed(baseEvent.event_id, 'signal', String(index))),
        ),
      ];

  const summary = {
    event_count: events.length,
    created_count: events.filter((event) => event.state === 'CREATED').length,
    wired_count: events.filter((event) => event.state === 'WIRED').length,
    proven_count: events.filter((event) => event.state === 'PROVEN').length,
    done_count: events.filter((event) => event.state === 'DONE').length,
    blocked_count: events.filter((event) => event.state === 'BLOCKED_EXTERNAL').length,
    next_step_count: events.reduce((total, event) => total + event.next_steps.length, 0),
  };

  return atlasEventFlowSchema.parse({
    flow_id: normalizeText(candidate.flow_id ?? candidate.flowId) || stableSeed(candidate.repository as string, generatedAt, candidate.lane as string) || 'atlas-event-flow',
    contract_version: 'atlas-event-flow-v1',
    repository: normalizeText(candidate.repository) || 've-updated-the-local-quantization-notebook',
    source_root: normalizeText(candidate.source_root ?? candidate.sourceRoot) || '.',
    generated_at: generatedAt,
    status: (() => {
      const flowStatus = normalizeText(candidate.status).toUpperCase();
      return flowStatus || (summary.blocked_count > 0 ? 'WARN' : 'PASS');
    })(),
    events,
    summary,
    evidence_refs: uniqueTextArray(candidate.evidence_refs ?? candidate.evidenceRefs),
    notes: uniqueTextArray(candidate.notes),
    next_safe_action: normalizeText(candidate.next_safe_action ?? candidate.nextSafeAction ?? baseEvent.next_steps[0] ?? 'Use the event flow as a bounded planning surface.'),
  });
}

export function summarizeAtlasEventFlow(flow: unknown): Record<string, unknown> {
  const candidate = (flow && typeof flow === 'object' && !Array.isArray(flow))
    ? (flow as Record<string, unknown>)
    : {};
  const events = Array.isArray(candidate.events) ? candidate.events : [];
  function eventSummaryState(event: unknown): string | null {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
    return normalizeText((event as Record<string, unknown>).state).toUpperCase() || null;
  }
  function eventNextStepsCount(event: unknown): number {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return 0;
    const nextSteps = (event as Record<string, unknown>).next_steps;
    return Array.isArray(nextSteps) ? nextSteps.length : 0;
  }
  const summary = {
    event_count: events.length,
    created_count: events.filter((event) => eventSummaryState(event) === 'CREATED').length,
    wired_count: events.filter((event) => eventSummaryState(event) === 'WIRED').length,
    proven_count: events.filter((event) => eventSummaryState(event) === 'PROVEN').length,
    done_count: events.filter((event) => eventSummaryState(event) === 'DONE').length,
    blocked_count: events.filter((event) => eventSummaryState(event) === 'BLOCKED_EXTERNAL').length,
    next_step_count: events.reduce((total, event) => total + eventNextStepsCount(event), 0),
  };

  return {
    exists: Boolean(flow),
    flowId: normalizeText(candidate.flow_id ?? candidate.flowId) || null,
    status: normalizeText(candidate.status) || null,
    eventCount: summary.event_count,
    createdCount: summary.created_count,
    wiredCount: summary.wired_count,
    provenCount: summary.proven_count,
    doneCount: summary.done_count,
    blockedCount: summary.blocked_count,
    nextStepCount: summary.next_step_count,
    nextSafeAction: normalizeText(candidate.next_safe_action ?? candidate.nextSafeAction) || null,
  };
}

export function hashAtlasEventFlow(flow: unknown): string {
  return stableStringify(flow ?? null);
}
