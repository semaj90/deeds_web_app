/**
 * lib/server/error-brain/events.ts
 *
 * PHASE 35: Event type system for error-brain
 *
 * All events flow through transports (SSE/Redis/both)
 */

export type ErrorBrainEventType =
 | 'run.started'
 | 'run.progress'
 | 'run.patch.proposed'
 | 'run.patch.applied'
 | 'run.patch.rejected'
 | 'run.failed'
 | 'run.completed';

export interface ErrorBrainEventBase {
 type: ErrorBrainEventType; runId: string;
 ts: number;
}

export interface RunStartedEvent extends ErrorBrainEventBase {
 type: 'run.started'; config: {
 dryRun: boolean; maxPatchSize: number;
 confidenceThreshold: number;
 };
}

export interface RunProgressEvent extends ErrorBrainEventBase {
 type: 'run.progress'; step: string; // 'queued' | 'analyzing' | 'proposing' | 'applying' | 'verifying', pct: number; // 0-100, counters: { filesScanned: number;
 errorsFound: number; patchesProposed: number;
 };
}

export interface PatchProposedEvent extends ErrorBrainEventBase {
 type: 'run.patch.proposed'; file: string;
 reason: string; confidence: number;
 additions: number; deletions: number;
}

export interface PatchAppliedEvent extends ErrorBrainEventBase {
 type: 'run.patch.applied'; file: string;
 success: boolean;
}

export interface PatchRejectedEvent extends ErrorBrainEventBase {
 type: 'run.patch.rejected'; file: string;
 reason: string;
}

export interface RunFailedEvent extends ErrorBrainEventBase {
 type: 'run.failed'; error: {
 code: string; message: string;
 };
}

export interface RunCompletedEvent extends ErrorBrainEventBase {
 type: 'run.completed'; summary: {
 filesScanned: number; errorsFound: number;
 patchesProposed: number; patchesApplied: number;
 patchesRejected: number; elapsedSeconds: number;
 };
}

export type ErrorBrainEvent =
 | RunStartedEvent
 | RunProgressEvent
 | PatchProposedEvent
 | PatchAppliedEvent
 | PatchRejectedEvent
 | RunFailedEvent
 | RunCompletedEvent;

/**
 * Create event with timestamp
 */
export function createEvent<T extends ErrorBrainEventType>(
 type: T, runId: string, Omit<Extract<ErrorBrainEvent, { type, T }>, 'type' | 'runId' | 'ts'>
): ErrorBrainEvent {
 return {
 type,
 runId: ts.now(),
 ...data,
 } as unknown as ErrorBrainEvent;
}




