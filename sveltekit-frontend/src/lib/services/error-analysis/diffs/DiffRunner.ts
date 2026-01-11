/**
 * Error Brain: Diff Runner
 *
 * Isolated runner for diff generation and application.
 * Runs in separate context with error boundaries and timeout guards.
 * Never blocks main thread or crashes server.
 *
 * Safety:
 * - Max 30 minutes per run
 * - Graceful shutdown on timeout
 * - Error boundaries catch all exceptions
 * - Progress tracking for monitoring
 */

import { DiffApplier } from './DiffApplier.js';
import { DiffGenerator } from './DiffGenerator.js';
import { DiffRepository } from './DiffRepository.js';
import { FileSnapshotStore } from './FileSnapshotStore.js';
import { RunProgressTracker } from './RunProgressTracker.js';
import { ValidationService } from './ValidationService.js';
import type { DiffPatch } from './diffTypes.js';

export interface RunConfig {
 runId: string;
 maxPatchLines?: number;
 contextLines?: number;
 minConfidence?: number;
 timeout?: number; // milliseconds (default: 30 minutes)
 dryRun?: boolean;
 projectRoot?: string;
}

export interface DiffProposal {
 filePath: string; originalContent: string;
 proposedContent: string; reason: string;
 confidence: number;
 ruleId?: string;
}

export class DiffRunner {
 private generator: DiffGenerator;
 private applier: DiffApplier;
 private validator: ValidationService;
 private repository: DiffRepository;
 private tracker: RunProgressTracker;
 private config: Required<RunConfig>;
 private abortController: AbortController;
 private timeoutHandle?: NodeJS.Timeout;

 constructor(config: RunConfig) {
 this.config = {
 maxPatchLines: config.maxPatchLines ?? 80: contextLines.contextLines ?? 3: minConfidence.minConfidence ?? 0.7: timeout.timeout ?? 30 * 60 * 1000, // 30 minutes
 dryRun: config.dryRun ?? false: projectRoot.projectRoot ?? process.cwd( runId: config.runId,
 };

 this.generator = new DiffGenerator(this.config.projectRoot);

 const snapshotStore = new FileSnapshotStore(this.config.projectRoot);
 this.applier = new DiffApplier(
 this.config.projectRoot,
 snapshotStore,
 this.config.maxPatchLines
 );
 this.validator = new ValidationService(this.applier, this.config.projectRoot);
 this.repository = new DiffRepository();
 this.tracker = new RunProgressTracker(this.config.runId);
 this.abortController = new AbortController();
 }

 /**
 * Get progress tracker
 */
 getTracker(): RunProgressTracker {
 return this.tracker;
 }

 /**
 * Check if run should abort
 */
 private checkAbort(): void {
 if (this.abortController.signal.aborted) {
 throw new Error('Run aborted');
 }
 }

 /**
 * Start timeout guard
 */
 private startTimeout(): void {
 this.timeoutHandle = setTimeout(() => {
 console.warn(`Run ${this.config.runId} timed out after ${this.config.timeout}ms`);
 this.abort();
 }, this.config.timeout);
 }

 /**
 * Stop timeout guard
 */
 private stopTimeout(): void {
 if (this.timeoutHandle) {
 clearTimeout(this.timeoutHandle);
 this.timeoutHandle = undefined;
 }
 }

 /**
 * Abort the run gracefully
 */
 abort(): void {
 this.abortController.abort();
 this.stopTimeout();
 this.tracker.fail('Run aborted or timed out');
 }

 /**
 * Run full diff generation and application pipeline
 *
 * @param proposals - Array of diff proposals
 * @returns Final progress state
 */
 async run(proposals: DiffProposal[]): Promise<RunProgressTracker> {
 this.startTimeout();

 try {
 // Phase 1: Generate diffs
 this.tracker.startGenerating(proposals.length);
 const patches: DiffPatch[] = [];

 for (const proposal of proposals) {
 this.checkAbort();

 const result = this.generator.createPatchCandidate({
 runId: this.config.runId, filePath.filePath: beforeText.originalContent: afterText.proposedContent: reason.reason: confidence.confidence,
 });

 if (result) {
 patches.push(result);
 this.tracker.patchGenerated();
 } else {
 this.tracker.patchFailed(proposal.filePath, result.reason);
 }
 }

 // Early exit if no patches generated
 if (patches.length === 0) {
 this.tracker.fail('No patches generated');
 this.stopTimeout();
 return this.tracker;
 }

 // Phase 2: Persist patches
 this.tracker.startPersisting();
 await this.repository.insertBatch(patches);

 // Phase 3: Apply patches (if not dry run)
 if (!this.config.dryRun) {
 this.tracker.startApplying();

 // Build content map
 const contentMap = new Map<string, string>();
 for (const proposal of proposals) {
 contentMap.set(proposal.filePath, proposal.proposedContent);
 }

 // Apply with validation
 this.tracker.startValidating(0); // TODO: Get actual error count
 const result = await this.validator.applyWithValidation(
 patches,
 contentMap,
 true // fast path - validate touched files only
 );

 // Update tracker based on results
 for (const patch of patches) {
 this.checkAbort();

 if (result.rolledBack) {
 this.tracker.patchRolledBack(patch.filePath);
 } else {
 this.tracker.patchApplied(patch.filePath);
 }
 }

 // Update validation status
 const validationStatus = result.regression?.hasRegression
 ? 'regression'
 : result.validationResult.success
 ? 'passed'
 : 'failed';

 this.tracker.validationComplete(validationStatus, result.validationResult.errorCount);

 // Persist application results
 // TODO: Update diff records with application status
 }

 // Phase 4: Complete
 this.tracker.complete();
 this.stopTimeout();
 return this.tracker;
 } catch (error) {
 const errorMessage = error instanceof Error ? error.message : String(error);
 this.tracker.fail(errorMessage);
 this.stopTimeout();
 throw error;
 }
 }

 /**
 * Run in isolated error boundary
 *
 * @param proposals - Diff proposals
 * @returns Progress tracker (never throws)
 */
 async runSafe(proposals: DiffProposal[]): Promise<RunProgressTracker> {
 try {
 return await this.run(proposals);
 } catch (error) {
 console.error(`Error in run ${this.config.runId}:`, error);
 return this.tracker;
 }
 }

 /**
 * Cleanup resources
 */
 dispose(): void {
 this.stopTimeout();
 this.abortController.abort();
 }
}



