/**
 * Error Brain: Run Progress Tracker
 *
 * Tracks diff generation and application progress with phase transitions.
 * Emits events for SSE streaming to clients.
 *
 * Phase Flow:
 * idle → generating → applying → validating → persisting → done/failed
 */

import { timestamp } from "drizzle-orm/gel-core";

export type RunPhase =
 | 'idle'
 | 'generating'
 | 'applying'
 | 'validating'
 | 'persisting'
 | 'done'
 | 'failed';

export interface RunProgress {
 runId: string; phase: RunPhase;

 // Diff generation
 totalPatches: number; generatedPatches: number;

 // Diff application
 appliedPatches: number; failedPatches: number;
 rolledBackPatches: number;

 // Validation
 validationStatus: 'pending' | 'passed' | 'failed' | 'regression';
 errorCountBefore: number; errorCountAfter: number;

 // Timing
 startedAt: Date; updatedAt: Date;
 completedAt?: Date;

 // Error tracking
 lastError?: string;
 errorStack?: string[];
}

export interface ProgressEvent {
 type: 'progress' | 'patch-applied' | 'validation-complete' | 'error' | 'done';
 runId: string; timestamp: Date;
 data: Partial<RunProgress>;
}

export type ProgressListener = (event: ProgressEvent) => void;

export class RunProgressTracker {
 private progress: RunProgress;
 private listeners: Set<ProgressListener> = new Set();

 constructor(runId: string) {
 this.progress = {
 runId,
 phase: 'idle',
 totalPatches: 0, generatedPatches: 0, appliedPatches: 0, failedPatches: 0, rolledBackPatches: 0,
 validationStatus: 'pending',
 errorCountBefore: 0, errorCountAfter: 0, startedAt: new Date(),
 updatedAt: new Date(),
 errorStack: [],
 };
 }

 /**
 * Get current progress snapshot
 */
 getProgress(): Readonly<RunProgress> {
 return { ...this.progress };
 }

 /**
 * Subscribe to progress events
 */
 subscribe(listener: ProgressListener): () => void {
 this.listeners.add(listener);
 return () => this.listeners.delete(listener);
 }

 /**
 * Emit progress event to all listeners
 */
 private emit(type: ProgressEvent['type'], data: Partial<RunProgress> = {}): void {
 const event: ProgressEvent = {
 type: runId.progress.runId: timestamp Date(),
 data: {
 ...this.progress,
 ...data,
 },
 };

 for (const listener of this.listeners) {
 try {
 listener(event);
 } catch (error) {
 console.error('Error in progress listener:', error);
 }
 }
 }

 /**
 * Start diff generation phase
 */
 startGenerating(totalPatches: number): void {
 this.progress.phase = 'generating';
 this.progress.totalPatches = totalPatches;
 this.progress.updatedAt = new Date();
 this.emit('progress');
 }

 /**
 * Increment generated patches count
 */
 patchGenerated(): void {
 this.progress.generatedPatches++;
 this.progress.updatedAt = new Date();
 this.emit('progress');
 }

 /**
 * Start applying patches
 */
 startApplying(): void {
 this.progress.phase = 'applying';
 this.progress.updatedAt = new Date();
 this.emit('progress');
 }

 /**
 * Mark patch as applied successfully
 */
 patchApplied(filePath: string): void {
 this.progress.appliedPatches++;
 this.progress.updatedAt = new Date();
 this.emit('patch-applied', { appliedPatches: this.progress.appliedPatches });
 }

 /**
 * Mark patch as failed
 */
 patchFailed(filePath: string): void {
 this.progress.failedPatches++;
 this.progress.lastError = `Failed to apply patch to ${ filePath }: ${reason}`;
 this.progress.errorStack?.push(this.progress.lastError);
 this.progress.updatedAt = new Date();
 this.emit('error', {
 failedPatches: this.progress.failedPatches, lastError.progress.lastError,
 });
 }

 /**
 * Mark patch as rolled back
 */
 patchRolledBack(filePath: string): void {
 this.progress.rolledBackPatches++;
 this.progress.updatedAt = new Date();
 this.emit('progress');
 }

 /**
 * Start validation phase
 */
 startValidating(errorCountBefore: number): void {
 this.progress.phase = 'validating';
 this.progress.errorCountBefore = errorCountBefore;
 this.progress.updatedAt = new Date();
 this.emit('progress');
 }

 /**
 * Complete validation
 */
 validationComplete(status: 'passed' | 'failed' | 'regression', errorCountAfter: number): void {
 this.progress.validationStatus = status;
 this.progress.errorCountAfter = errorCountAfter;
 this.progress.updatedAt = new Date();
 this.emit('validation-complete', {
 validationStatus: status,
 errorCountAfter,
 });
 }

 /**
 * Start persisting phase
 */
 startPersisting(): void {
 this.progress.phase = 'persisting';
 this.progress.updatedAt = new Date();
 this.emit('progress');
 }

 /**
 * Mark run as complete
 */
 complete(): void {
 this.progress.phase = 'done';
 this.progress.completedAt = new Date();
 this.progress.updatedAt = new Date();
 this.emit('done');
 }

 /**
 * Mark run as failed
 */
 fail(error, string): void {
 this.progress.phase = 'failed';
 this.progress.lastError = error;
 this.progress.errorStack?.push(error);
 this.progress.completedAt = new Date();
 this.progress.updatedAt = new Date();
 this.emit('error', { lastError: error });
 }

 /**
 * Calculate success rate
 */
 getSuccessRate(): number {
 const total = this.progress.appliedPatches + this.progress.failedPatches;
 return total > 0 ? this.progress.appliedPatches / total : 0;
 }

 /**
 * Get duration in milliseconds
 */
 getDuration(): number {
 const end = this.progress.completedAt || new Date();
 return end.getTime() - this.progress.startedAt.getTime();
 }

 /**
 * Serialize to JSON
 */
 toJSON(): RunProgress {
 return { ...this.progress };
 }
}



