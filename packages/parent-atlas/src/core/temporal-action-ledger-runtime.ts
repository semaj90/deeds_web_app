import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  actionCurrentProjectionSchema,
  agentActionEventSchema,
  projectActionCurrent,
  temporalActionChecksum,
  temporalActionIndexManifestSchema,
  type ActionCurrentProjectionV1,
  type AgentActionEventV1,
} from './temporal-action-ledger.js';

export const temporalActionCurrentIndexFileSchema = z.object({
  schema: z.literal('atlas.temporal-action-current-index.v1'),
  generated_at: z.string().datetime(),
  event_log_ref: z.string().min(1),
  event_log_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  event_count: z.number().int().nonnegative(),
  execution_key_count: z.number().int().nonnegative(),
  rows: z.array(actionCurrentProjectionSchema),
  index_checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type TemporalActionCurrentIndexFileV1 = z.infer<typeof temporalActionCurrentIndexFileSchema>;

export interface TemporalActionLedgerPathsV1 {
  rootDir: string;
  eventsJsonl: string;
  actionLatestJson: string;
  manifestJson: string;
}

export interface TemporalActionLedgerRuntimeOptionsV1 {
  rootDir: string;
  workspaceId: string;
  ledgerRevision: string;
  producerRevision: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tmp, filePath);
}

export function resolveTemporalActionLedgerPaths(rootDir: string): TemporalActionLedgerPathsV1 {
  return {
    rootDir,
    eventsJsonl: path.join(rootDir, 'actions.jsonl'),
    actionLatestJson: path.join(rootDir, 'indexes', 'action-latest.json'),
    manifestJson: path.join(rootDir, 'manifest.json'),
  };
}

export async function readTemporalActionEvents(eventsJsonl: string): Promise<AgentActionEventV1[]> {
  if (!(await fileExists(eventsJsonl))) return [];
  const text = await readFile(eventsJsonl, 'utf8');
  if (!text.trim()) return [];
  const rows: AgentActionEventV1[] = [];
  const eventIds = new Set<string>();
  const ledgerSequences = new Set<number>();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`ACTION_LEDGER_JSON_PARSE_FAILED:line=${index + 1}:${error instanceof Error ? error.message : String(error)}`);
    }
    const event = agentActionEventSchema.parse(parsed);
    const { event_checksum, ...withoutChecksum } = event;
    if (temporalActionChecksum(withoutChecksum) !== event_checksum) {
      throw new Error(`ACTION_EVENT_CHECKSUM_MISMATCH:${event.event_id}`);
    }
    if (eventIds.has(event.event_id)) throw new Error(`ACTION_EVENT_ID_DUPLICATE:${event.event_id}`);
    if (ledgerSequences.has(event.ledger_sequence)) throw new Error(`ACTION_LEDGER_SEQUENCE_DUPLICATE:${event.ledger_sequence}`);
    eventIds.add(event.event_id);
    ledgerSequences.add(event.ledger_sequence);
    rows.push(event);
  }
  return rows.sort((a, b) => a.ledger_sequence - b.ledger_sequence);
}

export async function appendTemporalActionEvent(
  options: TemporalActionLedgerRuntimeOptionsV1,
  eventInput: z.input<typeof agentActionEventSchema>,
): Promise<AgentActionEventV1> {
  const paths = resolveTemporalActionLedgerPaths(options.rootDir);
  await mkdir(path.dirname(paths.eventsJsonl), { recursive: true });
  const event = agentActionEventSchema.parse(eventInput);
  const { event_checksum, ...withoutChecksum } = event;
  if (temporalActionChecksum(withoutChecksum) !== event_checksum) {
    throw new Error(`ACTION_EVENT_CHECKSUM_MISMATCH:${event.event_id}`);
  }

  const existing = await readTemporalActionEvents(paths.eventsJsonl);
  const latest = existing.at(-1);
  if (latest && event.ledger_sequence <= latest.ledger_sequence) {
    throw new Error(`ACTION_LEDGER_SEQUENCE_NOT_APPEND_ONLY:latest=${latest.ledger_sequence}:next=${event.ledger_sequence}`);
  }
  if (existing.some((row) => row.event_id === event.event_id)) {
    throw new Error(`ACTION_EVENT_ID_DUPLICATE:${event.event_id}`);
  }

  await appendFile(paths.eventsJsonl, `${JSON.stringify(event)}\n`, { encoding: 'utf8', flag: 'a' });
  return event;
}

export async function rebuildTemporalActionCurrentIndex(
  options: TemporalActionLedgerRuntimeOptionsV1,
): Promise<TemporalActionCurrentIndexFileV1> {
  const paths = resolveTemporalActionLedgerPaths(options.rootDir);
  const events = await readTemporalActionEvents(paths.eventsJsonl);
  const grouped = new Map<string, AgentActionEventV1[]>();
  for (const event of events) {
    const bucket = grouped.get(event.execution_key) ?? [];
    bucket.push(event);
    grouped.set(event.execution_key, bucket);
  }
  const rows: ActionCurrentProjectionV1[] = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, bucket]) => projectActionCurrent(bucket));
  const eventLogChecksum = temporalActionChecksum(events);
  const raw = {
    schema: 'atlas.temporal-action-current-index.v1' as const,
    generated_at: new Date().toISOString(),
    event_log_ref: path.relative(options.rootDir, paths.eventsJsonl).replaceAll('\\', '/'),
    event_log_checksum: eventLogChecksum,
    event_count: events.length,
    execution_key_count: rows.length,
    rows,
  };
  const index = temporalActionCurrentIndexFileSchema.parse({
    ...raw,
    index_checksum: temporalActionChecksum(raw),
  });
  await atomicWriteJson(paths.actionLatestJson, index);

  const manifestRaw = {
    schema: 'atlas.temporal-action-index-manifest.v1' as const,
    workspace_id: options.workspaceId,
    ledger_revision: options.ledgerRevision,
    event_log_jsonl_ref: path.relative(options.rootDir, paths.eventsJsonl).replaceAll('\\', '/'),
    action_latest_arrow_ref: null,
    action_by_target_arrow_ref: null,
    action_by_opcode_arrow_ref: null,
    action_by_outcome_arrow_ref: null,
    action_by_error_arrow_ref: null,
    workspace_snapshot_map_arrow_ref: null,
    receipt_ref: path.relative(options.rootDir, paths.actionLatestJson).replaceAll('\\', '/'),
    event_count: events.length,
    event_log_checksum: eventLogChecksum,
    projection_checksum: index.index_checksum,
    canonical_event_owner: 'WORKFLOW_RUNTIME' as const,
    projection_authority: 'DERIVED' as const,
    producer_revision: options.producerRevision,
  };
  const manifest = temporalActionIndexManifestSchema.parse(manifestRaw);
  await atomicWriteJson(paths.manifestJson, manifest);
  return index;
}

export async function lookupCurrentActionByExecutionKey(
  rootDir: string,
  executionKey: string,
): Promise<ActionCurrentProjectionV1 | null> {
  const paths = resolveTemporalActionLedgerPaths(rootDir);
  if (!(await fileExists(paths.actionLatestJson))) return null;
  const raw = JSON.parse(await readFile(paths.actionLatestJson, 'utf8')) as unknown;
  const index = temporalActionCurrentIndexFileSchema.parse(raw);
  return index.rows.find((row) => row.execution_key === executionKey) ?? null;
}

export function describeTemporalActionLedgerRuntime(): string {
  return [
    'actions.jsonl is the immutable reference event history; appends require globally increasing ledger_sequence and unique event_id.',
    'indexes/action-latest.json is a deterministic derived projection and may be deleted/rebuilt from actions.jsonl.',
    'Arrow indexes are intentionally left null in the V1 manifest until the event/reuse semantics are proven; adding Arrow is an acceleration/materialization step, not a history-owner change.',
    'Result artifacts are referenced by ID and remain outside the ledger, preserving the action-index versus CAS separation.',
  ].join(' ');
}
