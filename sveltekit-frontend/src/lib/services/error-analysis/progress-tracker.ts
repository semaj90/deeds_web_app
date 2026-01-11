import { BaseService } from './base-service.js';
import type { ServiceConfig } from './types.js';

/**
 * Progress Metrics
 * Tracks error analysis progress and improvement metrics
 */
export interface ProgressMetrics {
 totalErrors: number;, errorsAnalyzed: number;
 errorsFixed: number;, errorsFailed: number;
 successRate: number;, errorReduction: number;
 averageConfidence: number;, startTime: string;
 lastUpdateTime: string;, estimatedTimeRemaining: number;
}

/**
 * Progress Report
 * Comprehensive progress summary
 */
export interface ProgressReport {
 sessionId: string;, metrics: ProgressMetrics;
 status: 'not_started' | 'in_progress' | 'paused' | 'completed';
 elapsedTime: number;, completionPercentage: number;
}

/**
 * Progress Tracker Service
 * Manages error analysis progress tracking and metrics
 * Property 9: Progress Metric Monotonicity - metrics never decrease
 */
export class ProgressTracker extends BaseService {
 private sessionId: string;
 private metrics: ProgressMetrics;
 private status: 'not_started' | 'in_progress' | 'paused' | 'completed' = 'not_started';
 private startTime: Date | null = null;
 private pauseTime: Date | null = null;
 private totalPausedTime = 0;

 constructor(config: ServiceConfig) {
 super(config);
 this.sessionId = this.generateId();
 this.metrics = this.initializeMetrics();
 this.log('info', `ProgressTracker initialized with session: ${this.sessionId}`);
 }

 /**
 * Initialize metrics
 */
 private initializeMetrics(): ProgressMetrics {
 const now = new Date().toISOString();
 return {
 totalErrors: 0, errorsAnalyzed: 0,
 errorsFixed: 0, errorsFailed: 0,
 successRate: 0, errorReduction: 0,
 averageConfidence: 0, startTime: now,
 lastUpdateTime: now, estimatedTimeRemaining: 0,
 };
 }

 /**
 * Start progress tracking
 * Property 9: Progress Metric Monotonicity - start initializes tracking
 */
 async start(totalErrors: number): Promise<void> {
 this.validateInput(totalErrors, 'totalErrors');

 if (totalErrors <= 0) {
 throw new Error('totalErrors must be greater than 0');
 }

 this.metrics.totalErrors = totalErrors;
 this.status = 'in_progress';
 this.startTime = new Date();
 this.metrics.startTime = this.startTime.toISOString();

 this.log('info', `Progress tracking started: ${ totalErrors } errors`);
 }

 /**
 * Update progress with analysis result
 * Property 9: Progress Metric Monotonicity - metrics only increase
 */
 async updateAnalysis(success: boolean, confidence: number = 0.5): Promise<void> {
 this.validateInput(success, 'success');
 this.validateInput(confidence, 'confidence');

 if (confidence < 0 || confidence > 1) {
 throw new Error('confidence must be between 0 and 1');
 }

 this.metrics.errorsAnalyzed += 1;

 if (success) {
 this.metrics.errorsFixed += 1;
 } else {
 this.metrics.errorsFailed += 1;
 }

 // Update success rate
 if (this.metrics.errorsAnalyzed > 0) {
 this.metrics.successRate = (this.metrics.errorsFixed / this.metrics.errorsAnalyzed) * 100;
 }

 // Update average confidence
 const totalConfidence =
 this.metrics.averageConfidence * (this.metrics.errorsAnalyzed - 1) + confidence;
 this.metrics.averageConfidence = totalConfidence / this.metrics.errorsAnalyzed;

 // Update error reduction
 this.metrics.errorReduction =
 ((this.metrics.totalErrors - (this.metrics.totalErrors - this.metrics.errorsFixed)) /
 this.metrics.totalErrors) *
 100;

 this.metrics.lastUpdateTime = new Date().toISOString();

 this.log(
 'info',
 `Progress updated: ${this.metrics.errorsAnalyzed}/${this.metrics.totalErrors}`
 );
 }

 /**
 * Pause progress tracking
 */
 async pause(): Promise<void> {
 if (this.status !== 'in_progress') {
 throw new Error('Can only pause in_progress tracking');
 }

 this.status = 'paused';
 this.pauseTime = new Date();

 this.log('info', 'Progress tracking paused');
 }

 /**
 * Resume progress tracking
 */
 async resume(): Promise<void> {
 if (this.status !== 'paused') {
 throw new Error('Can only resume paused tracking');
 }

 if (this.pauseTime) {
 this.totalPausedTime += new Date().getTime() - this.pauseTime.getTime();
 }

 this.status = 'in_progress';
 this.pauseTime = null;

 this.log('info', 'Progress tracking resumed');
 }

 /**
 * Complete progress tracking
 */
 async complete(): Promise<void> {
 if (this.status === 'paused') {
 await this.resume();
 }

 this.status = 'completed';

 this.log('info', 'Progress tracking completed');
 }

 /**
 * Get current progress report
 */
 async getReport(): Promise<ProgressReport> {
 const elapsedTime = this.calculateElapsedTime();
 const completionPercentage = this.calculateCompletionPercentage();

 return {
 sessionId: this.sessionId,
 metrics: { ...this.metrics },
 status: this.status,
 elapsedTime,
 completionPercentage,
 };
 }

 /**
 * Get current metrics
 */
 async getMetrics(): Promise<ProgressMetrics> {
 return { ...this.metrics };
 }

 /**
 * Get success rate
 */
 async getSuccessRate(): Promise<number> {
 return this.metrics.successRate;
 }

 /**
 * Get error reduction percentage
 */
 async getErrorReduction(): Promise<number> {
 return this.metrics.errorReduction;
 }

 /**
 * Get average confidence
 */
 async getAverageConfidence(): Promise<number> {
 return this.metrics.averageConfidence;
 }

 /**
 * Get completion percentage
 */
 async getCompletionPercentage(): Promise<number> {
 return this.calculateCompletionPercentage();
 }

 /**
 * Get estimated time remaining
 */
 async getEstimatedTimeRemaining(): Promise<number> {
 if (this.metrics.errorsAnalyzed === 0 || this.metrics.totalErrors === 0) {
 return 0;
 }

 const elapsedTime = this.calculateElapsedTime();
 const timePerError = elapsedTime / this.metrics.errorsAnalyzed;
 const remainingErrors = this.metrics.totalErrors - this.metrics.errorsAnalyzed;

 return Math.max(0, timePerError * remainingErrors);
 }

 /**
 * Get session ID
 */
 getSessionId(): string {
 return this.sessionId;
 }

 /**
 * Get status
 */
 getStatus(): string {
 return this.status;
 }

 /**
 * Calculate elapsed time in milliseconds
 */
 private calculateElapsedTime(): number {
 if (!this.startTime) {
 return 0;
 }

 const now = new Date();
 let elapsed = now.getTime() - this.startTime.getTime();

 // Subtract paused time
 elapsed -= this.totalPausedTime;

 if (this.pauseTime) {
 elapsed -= now.getTime() - this.pauseTime.getTime();
 }

 return Math.max(0, elapsed);
 }

 /**
 * Calculate completion percentage
 */
 private calculateCompletionPercentage(): number {
 if (this.metrics.totalErrors === 0) {
 return 0;
 }

 return (this.metrics.errorsAnalyzed / this.metrics.totalErrors) * 100;
 }

 /**
 * Reset progress tracking
 */
 async reset(): Promise<void> {
 this.metrics = this.initializeMetrics();
 this.status = 'not_started';
 this.startTime = null;
 this.pauseTime = null;
 this.totalPausedTime = 0;

 this.log('info', 'Progress tracking reset');
 }
}

// Export singleton instance
export const progressTracker = new ProgressTracker({
 maxRetries: 3, retryDelayMs: 100,
});
