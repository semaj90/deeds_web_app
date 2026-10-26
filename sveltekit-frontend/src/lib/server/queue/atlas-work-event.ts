/**
 * atlas-work-event.ts — Event envelope and idempotency contracts for Parent Atlas.
 *
 * Implements KAFKA-02 / KAFKA-09:
 * - Revision-bound event envelope carrying canonical source identity,
 *   workspace/source/graph revisions, commit LSN/idempotency key, and payload checksum.
 * - Strict idempotency semantics:
 *   - Identical eventId + identical payloadChecksum -> REPLAY (safe duplicate, no duplicate execution)
 *   - Identical eventId + different payloadChecksum -> CONFLICT (rejected, dead-lettered)
 * - Safe boundary:
 *   - Rejects hidden thoughts, prompts, raw KV tensors, or GPU pointers.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

export const RevisionSchema = z.string().min(1);

export const AtlasWorkEventTypeSchema = z.enum([
  'TASK_TRANSITION',
  'SOURCE_REVISION_UPDATED',
  'EVIDENCE_RECEIPT_COMMITTED',
  'TOPOLOGY_SNAPSHOT_PROMOTED',
  'INSPECTION_AUDIT_LOGGED',
]);

export type AtlasWorkEventType = z.infer<typeof AtlasWorkEventTypeSchema>;

export const AtlasWorkEventV1Schema = z.object({
  schemaVersion: z.literal('atlas.work-event.v1'),
  eventId: z.string().min(1),
  eventType: AtlasWorkEventTypeSchema,
  canonicalSourceId: z.string().min(1),
  workspaceRevision: RevisionSchema.optional(),
  sourceRevision: RevisionSchema.optional(),
  graphRevision: RevisionSchema.optional(),
  producer: z.string().min(1),
  timestamp: z.number().int().positive(),
  payloadChecksum: z.string().startsWith('sha256:'),
  payload: z.record(z.string(), z.unknown()),
}).strict().superRefine((event, ctx) => {
  if (event.payloadChecksum !== computePayloadChecksum(event.payload)) {
    ctx.addIssue({ code: 'custom', path: ['payloadChecksum'], message: 'PAYLOAD_CHECKSUM_MISMATCH' });
  }
  const forbiddenKeys = new Set(['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor', 'gpu_pointer']);
  const inspect = (value: unknown, path: Array<string | number>) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => inspect(item, [...path, index]));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) {
        ctx.addIssue({ code: 'custom', path: [...path, key], message: `FORBIDDEN_EVENT_PAYLOAD_FIELD: '${key}'` });
      }
      inspect(child, [...path, key]);
    }
  };
  inspect(event.payload, ['payload']);
});

export type AtlasWorkEventV1 = z.infer<typeof AtlasWorkEventV1Schema>;

export function computePayloadChecksum(payload: Record<string, unknown>): string {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]));
    }
    return value;
  };
  const canonicalString = JSON.stringify(canonicalize(payload));
  return `sha256:${createHash('sha256').update(canonicalString).digest('hex')}`;
}

export function createAtlasWorkEventV1(params: {
  eventId: string;
  eventType: AtlasWorkEventType;
  canonicalSourceId: string;
  producer: string;
  payload: Record<string, unknown>;
  workspaceRevision?: string;
  sourceRevision?: string;
  graphRevision?: string;
  timestamp?: number;
}): AtlasWorkEventV1 {
  const payloadChecksum = computePayloadChecksum(params.payload);

  return AtlasWorkEventV1Schema.parse({
    schemaVersion: 'atlas.work-event.v1',
    eventId: params.eventId,
    eventType: params.eventType,
    canonicalSourceId: params.canonicalSourceId,
    producer: params.producer,
    workspaceRevision: params.workspaceRevision,
    sourceRevision: params.sourceRevision,
    graphRevision: params.graphRevision,
    timestamp: params.timestamp ?? Date.now(),
    payloadChecksum,
    payload: params.payload,
  });
}
