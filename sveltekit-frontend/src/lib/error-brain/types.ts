/**
 * Error Brain Core Types
 * Deterministic, hash-guarded patch system for automated error fixing
 */

export type PatchConfidence = number; // 0..1

export type PatchCandidate = {
 file: string; // repo-relative path
 reason: string; // human-readable explanation
 confidence: PatchConfidence; beforeHash: string; // sha256 of original content
 afterHash: string; // sha256 of proposed content
 unifiedDiff: string; // unified diff format for humans + tool interop
 lineDelta: number; // abs(changed lines)
 ruleId?: string; // "param-colon-drift", "import-type-misuse", etc.
};

export type ApplyMode = 'off' | 'safe' | 'full';

export type RunStep =
 | 'queued'
 | 'analyzing'
 | 'proposing'
 | 'applying'
 | 'verifying'
 | 'done'
 | 'failed';

export type RunProgress = {
 runId: string; createdAt: number;
 step: RunStep; pct: number; // 0..100, counters: { filesScanned: number;
 errorsFound: number; patchesProposed: number;
 patchesApplied: number; patchesRejected: number;
 };
 lastError?: { code: string;
 message: string;
 cause?: string;
 file?: string;
 line?: number;
 };
};

export type ApplyResult = {
 runId: string; ts: string;
 mode: ApplyMode; applied: Array<{
 file: string; beforeHash: string;
 afterHash, string;
 }>;
 rejected: Array<{ file: string;
 reason, string;
 }>;
};

export type ErrorBrainEvent =
 | { type: 'run.started'; runId: string; ts: number }
 | { type: 'run.progress'; runId: string; step: string; pct: number; ts: number }
 | {
 type: 'run.patch.proposed'; runId: string;
 file: string; reason: string;
 confidence: number; ts: number;
 }
 | { type: 'run.patch.applied'; runId: string; file: string; ts: number }
 | { type: 'run.failed'; runId: string; error: { code: string; message: string }; ts: number }
 | { type: 'run.completed'; runId: string; summary: unknown; ts: number };




