type TimelinePayload = Record<string, unknown>;

function asPayloadRecord(payload: unknown): TimelinePayload {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as TimelinePayload)
    : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function stringArray(...values: unknown[]): string[] {
  return [...new Set(values.flatMap((value) => {
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }))];
}

export interface AgenticProposalTimelineRow {
  id: string;
  sessionId: string | null;
  eventType: string | null;
  pipeline: string | null;
  summaryId: string | null;
  payload: unknown;
  createdAt: Date | string | null;
}

export function normalizeAgenticProposalTimelineRow(row: AgenticProposalTimelineRow) {
  const payload = asPayloadRecord(row.payload);
  const featureId = firstString(payload.featureId, payload.feature_id);
  const sourceRef = firstString(payload.sourceRef, payload.source_ref);
  const sourceRefs = stringArray(payload.sourceRefs, payload.source_refs);
  const normalizedSourceRefs = sourceRefs.length > 0 ? sourceRefs : sourceRef ? [sourceRef] : [];
  const workspaceTaskId = firstString(payload.workspaceTaskId, payload.workspace_task_id);
  const parentAtlasCardId = firstString(payload.parentAtlasCardId, payload.parent_atlas_card_id);
  const warning = firstString(payload.warning);
  const missingFeatureId =
    typeof payload.missingFeatureId === 'boolean'
      ? payload.missingFeatureId
      : !featureId;

  return {
    id: row.id,
    sessionId: row.sessionId,
    eventType: row.eventType,
    pipeline: row.pipeline,
    summaryId: row.summaryId,
    createdAt: row.createdAt,
    payload,
    featureId,
    feature_id: featureId,
    sourceRef,
    source_ref: sourceRef,
    sourceRefs: normalizedSourceRefs,
    source_refs: normalizedSourceRefs,
    workspaceTaskId,
    workspace_task_id: workspaceTaskId,
    parentAtlasCardId,
    parent_atlas_card_id: parentAtlasCardId,
    missingFeatureId,
    warning,
  };
}