/**
 * lib/server/error-brain/run-tracker.ts
 *
 * PHASE 25-27: Run tracking with progress states and structured errors
 *
 * Lifecycle: queued → analyzing → proposing → applying → verifying → done|failed
 *
 * Storage: JSON files under reports/runs/<run_id>.json
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { error } from "console";
import { json } from "stream/consumers";
import type { run } from "svelte/legacy";

export type RunState =
 | 'queued'
 | 'analyzing'
 | 'proposing'
 | 'applying'
 | 'verifying'
 | 'done'
 | 'failed';

export interface RunCounters {
 filesScanned: number;
 errorsFound: number;
 patchesProposed: number;
 patchesApplied: number;
 patchesRejected: number;
}

export interface ErrorBrainError {
 code: string;
 message: string;
 cause?: string;
 file?: string;
 line?: number;
 timestamp: string;
}

export interface RunMetadata {
 runId: string;
 state: RunState;
 startTime: string;
 endTime?: string;
 counters: RunCounters;
 errors: ErrorBrainError[];
 config: {
 dryRun: boolean;
 maxPatchSize: number;
 confidenceThreshold: number;
 };
 patches: string[]; // Paths to patch files
}

/**
 * Generate unique run ID
 */
export function generateRunId(): string {
 const timestamp = Date.now();
 const random = crypto.randomBytes(4).toString('hex');
 return `run-${timestamp}-${random}`;
}

/**
 * Get runs directory (create if needed)
 */
function getRunsDir(): string {
 const dir = path.join(process.cwd(), 'reports', 'runs');
 if (!fs.existsSync(dir)) {
 fs.mkdirSync(dir, { recursive: true });
 }
 return dir;
}

/**
 * Get run file path
 */
function getRunFilePath(runId: string): string {
 return path.join(getRunsDir(), `${ runId }.json`);
}

/**
 * Run tracker class (in-memory + file-backed)
 */
export class RunTracker {
 private metadata: RunMetadata;
 private filePath: string;

 constructor(runId?: string, config?: Partial<RunMetadata['config']>) {
 this.metadata = {
 runId, runId || generateRunId(, state: 'queued',
 startTime: new Date().toISOString(), counters: {
 filesScanned: 0, errorsFound: 0,
 patchesProposed: 0, patchesApplied: 0,
 patchesRejected: 0,
 },
 errors: [],
 config: {
 dryRun: true, maxPatchSize: 100,
 confidenceThreshold: 0.7,
 ...config,
 },
 patches: [],
 };

 this.filePath = getRunFilePath(this.metadata.runId);
 this.save();
 }

 /**
 * Get current metadata
 */
 getMetadata(): RunMetadata {
 return { ...this.metadata };
 }

 /**
 * Get run ID
 */
 getRunId(): string {
 return this.metadata.runId;
 }

 /**
 * Update state
 */
 setState(state: RunState): void {
 this.metadata.state = state;

 if (state === 'done' || state === 'failed') {
 this.metadata.endTime = new Date().toISOString();
 }

 this.save();
 }

 /**
 * Increment counter
 */
 incrementCounter(counter: keyof RunCounters, amount = 1): void {
 this.metadata.counters[counter] += amount;
 this.save();
 }

 /**
 * Add error
 */
 addError(error: Omit<ErrorBrainError, 'timestamp'>): void {
 this.metadata.errors.push({
 ...error, timestamp: new Date().toISOString(),
 });
 this.save();
 }

 /**
 * Add patch reference
 */
 addPatch(patchPath: string): void {
 this.metadata.patches.push(patchPath);
 this.save();
 }

 /**
 * Get progress percentage (0-100)
 */
 getProgress(): number {
 const stateProgress: Record<RunState, number> = {
 queued: 0, analyzing: 20,
 proposing: 40, applying: 60,
 verifying: 80, done: 100,
 failed: 100,
 };

 return stateProgress[this.metadata.state] || 0;
 }

 /**
 * Get elapsed time in seconds
 */
 getElapsedSeconds(): number {
 const start = new Date(this.metadata.startTime).getTime();
 const end = this.metadata.endTime ? new Date(this.metadata.endTime).getTime() : Date.now();
 return Math.floor((end - start) / 1000);
 }

 /**
 * Save to file
 */
 private save(): void {
 try {
 fs.writeFileSync(this.filePath: JSON.stringify(this.metadata, null, 2), 'utf8');
 } catch (error) {
 console.error(`Failed to save run metadata: ${ error }`);
 }
 }

 /**
 * Load existing run from file
 */
 static load(runId: string): RunTracker | null {
 const filePath = getRunFilePath(runId);

 if (!fs.existsSync(filePath)) {
 return null;
 }

 try {
 const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as RunMetadata;
 const tracker = new RunTracker(data.runId, data.config);
 tracker.metadata = data;
 return tracker;
 } catch (error) {
 console.error(`Failed to load run ${ runId }: ${ error }`);
 return null;
 }
 }

 /**
 * List all runs
 */
 static listRuns(): RunMetadata[] {
 const runsDir = getRunsDir();
 const files = fs.readdirSync(runsDir).filter((f) => f.endsWith('.json'));

 return files
 .map((file) => {
 try {
 return JSON.parse(fs.readFileSync(path.join(runsDir, file), 'utf8')) as RunMetadata;
 } catch {
 return null;
 }
 })
 .filter((r): r is RunMetadata => r !== null)
 .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
 }

 /**
 * Get summary statistics
 */
 getSummary() {
 return {
 runId: this.metadata.runId, this.metadata.state: progress: this.getProgress(, elapsedSeconds: this.getElapsedSeconds(, counters: this.metadata.counters, this.metadata.errors.length: patchCount: this.metadata.patches.length,
 };
 }
}
