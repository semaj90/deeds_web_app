/**
 * OCP-01 — typed contract for the CANONICAL workboard artifact, docs/reports/openspec-workboard-v1.json
 * (built by scripts/atlas/build-openspec-workboard-v1.mjs from openspec/changes/*\/tasks.md).
 *
 * This is a DIFFERENT, narrower contract than openspec-board/types.ts's OpenSpecBoardSnapshotV1, which
 * describes a DERIVED composite of ~17 downstream analysis reports (execution-controller, actionable-work,
 * etc.), consumed by /atlas/studio/openspec today. Per OCP-00's census (docs/reports/openspec-control-plane-owner-census-v1.json):
 * the two are layered, not competing -- this file models the L0 canonical source those L1 reports derive from.
 *
 * Hard rules:
 *  - Validates and exposes the artifact's REAL, EXISTING fields only. Does not invent fields absent from it.
 *  - Never reparses tasks.md. Never reimplements priorityFor()/classifyExecutionState()/WFU parsing/dependency
 *    resolution -- those already ran inside the builder that produced this JSON; this module only reads its output.
 *  - Fails closed on a malformed/incompatible artifact (throws), never silently substitutes a stale or partial shape.
 */
import { z } from 'zod';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const OPENSPEC_WORKBOARD_CONTRACT_SCHEMA = 'atlas.openspec-workboard-contract.v1' as const;

const etaSchema = z.object({ status: z.string(), method: z.string() }).passthrough();

/** The real, flat per-task shape as emitted by build-openspec-workboard-v1.mjs (verified live against 9,393 rows). */
export const OpenSpecWorkboardTaskV1Schema = z
  .object({
    taskKey: z.string().min(1),
    change: z.string().min(1),
    source: z.string().min(1),
    line: z.number().int().nonnegative(),
    text: z.string(),
    state: z.string(),
    kind: z.string(),
    executionState: z.string(),
    lane: z.string().nullable().optional(),
    declaredSourceRef: z.string().nullable(),
    declaredSourceRevision: z.string().nullable(),
    priority: z.number(),
    lastUpdatedAt: z.string(),
    timestampMethod: z.string(),
    blockHash: z.string(),
    sectionSlug: z.string().nullable().optional(),
    eta: etaSchema,
    /** Globally unique across the whole artifact (verified live: 0 duplicates / 9,393 rows) -- the reliable identity. */
    stableKey: z.string().min(1),
    ledgerId: z.string().optional(),
    /** Present on ~29% of rows live (2,751/9,393); null elsewhere with taskIdentity.basis explaining why. Never
     * treated as the sole identity -- stableKey is. Uniqueness is enforced only over non-null values. */
    logicalTaskKey: z.string().nullable(),
    taskIdentity: z
      .object({
        logicalTaskKey: z.string().nullable(),
        taskRevision: z.string(),
        sourceLine: z.number().int().nonnegative(),
        migrationKey: z.string(),
        basis: z.string(),
      })
      .passthrough(),
  })
  .passthrough(); // artifact may carry additional fields this contract doesn't yet model; never reject on extras

export const OpenSpecWorkboardSummaryV1Schema = z
  .object({
    completedTasks: z.number().int().nonnegative(),
    openTasks: z.number().int().nonnegative(),
    actionableTasks: z.number().int().nonnegative(),
    waitingTasks: z.number().int().nonnegative(),
    supersededTasks: z.number().int().nonnegative(),
    totalTasks: z.number().int().nonnegative(),
    progressFraction: z.number(),
    progressBar: z.string(),
    eta: etaSchema,
  })
  .passthrough();

/** The artifact's real top-level shape. Only the fields this contract actively validates/exposes are typed strictly;
 * everything else survives via passthrough so a future builder addition doesn't fail-closed unnecessarily. */
export const OpenSpecWorkboardV1Schema = z
  .object({
    schema: z.literal('atlas.openspec.workboard.v1'),
    generatedAt: z.string(),
    source: z.string(),
    summary: OpenSpecWorkboardSummaryV1Schema,
    taskInventory: z.array(OpenSpecWorkboardTaskV1Schema),
  })
  .passthrough();

export type OpenSpecWorkboardTaskV1 = z.infer<typeof OpenSpecWorkboardTaskV1Schema>;
export type OpenSpecWorkboardSummaryV1 = z.infer<typeof OpenSpecWorkboardSummaryV1Schema>;
export type OpenSpecWorkboardV1 = z.infer<typeof OpenSpecWorkboardV1Schema>;

export interface OpenSpecWorkboardRevisionV1 {
  /** sha256 of the exact raw artifact bytes -- the artifact declares no checksum of its own, so this is the
   * canonical revision identity for "which exact workboard snapshot was this packet/receipt built from". */
  workboardChecksum: `sha256:${string}`;
  generatedAt: string;
  sourceFilePath: string;
}

export class OpenSpecWorkboardContractError extends Error {
  readonly issues: readonly string[];
  constructor(message: string, issues: readonly string[] = []) {
    super(issues.length ? `${message}: ${issues.join('; ')}` : message);
    this.issues = issues;
  }
}

/** Structural projection over the validated task list -- no reclassification, only exposing what's already there. */
export interface OpenSpecTaskProjectionV1 {
  stableKey: string;
  logicalTaskKey: string | null;
  taskKey: string;
  change: string;
  step: string | null;
  text: string;
  state: string;
  executionState: string;
  priority: number;
  actionable: boolean;
  waiting: boolean;
  superseded: boolean;
  lane: string | null;
  sourceLine: number;
}

const STEP_RE = /^STEP-(\d{2})\b/;

function stepFromLane(lane: string | null | undefined): string | null {
  // The artifact's own 'lane' field (e.g. 'RETRIEVAL_ACE') is not a STEP-NN label; no STEP field exists on a task
  // row today. Exposed as null rather than invented -- do not fabricate a STEP mapping the artifact doesn't declare.
  return lane && STEP_RE.test(lane) ? lane : null;
}

export function projectTask(task: OpenSpecWorkboardTaskV1): OpenSpecTaskProjectionV1 {
  return {
    stableKey: task.stableKey,
    logicalTaskKey: task.logicalTaskKey,
    taskKey: task.taskKey,
    change: task.change,
    step: stepFromLane(task.lane),
    text: task.text,
    state: task.state,
    executionState: task.executionState,
    priority: task.priority,
    actionable: task.executionState === 'ACTIONABLE',
    waiting: task.executionState === 'WAITING_ON_DEPENDENCY',
    superseded: task.executionState === 'SUPERSEDED_OR_HISTORICAL',
    lane: task.lane ?? null,
    sourceLine: task.line,
  };
}

export interface LoadedOpenSpecWorkboardV1 {
  workboard: OpenSpecWorkboardV1;
  revision: OpenSpecWorkboardRevisionV1;
}

/**
 * Reads and validates the canonical workboard artifact. Fails closed (throws OpenSpecWorkboardContractError) on
 * anything not matching the real shape -- never falls back to reparsing tasks.md, never substitutes a partial shape.
 */
export async function loadOpenSpecWorkboardV1(filePath: string): Promise<LoadedOpenSpecWorkboardV1> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    throw new OpenSpecWorkboardContractError('OPENSPEC_WORKBOARD_ARTIFACT_UNREADABLE', [String(error instanceof Error ? error.message : error)]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new OpenSpecWorkboardContractError('OPENSPEC_WORKBOARD_ARTIFACT_INVALID_JSON', [String(error instanceof Error ? error.message : error)]);
  }

  const result = OpenSpecWorkboardV1Schema.safeParse(parsed);
  if (!result.success) {
    throw new OpenSpecWorkboardContractError(
      'OPENSPEC_WORKBOARD_ARTIFACT_SHAPE_MISMATCH',
      result.error.issues.slice(0, 20).map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  const workboardChecksum = `sha256:${createHash('sha256').update(raw).digest('hex')}` as const;
  return {
    workboard: result.data,
    revision: { workboardChecksum, generatedAt: result.data.generatedAt, sourceFilePath: path.resolve(filePath) },
  };
}
