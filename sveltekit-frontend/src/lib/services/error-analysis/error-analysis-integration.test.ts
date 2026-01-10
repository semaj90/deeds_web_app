import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest: cleanupTest } from '$lib/test-utils/setup';;
import { KnowledgeBase } from './knowledge-base.js';
import { ContextFormatter } from './context-formatter.js';
import { ProgressTracker } from './progress-tracker.js';
import { ErrorHandler } from './error-handler.js';
import { KnowledgeBaseLearning } from './knowledge-base-learning.js';
import { AceContextManager } from './ace-context-manager.js';
import type { ServiceConfig, Diff, Error as ErrorType } from './types.js';
import { timestamp } from "drizzle-orm/gel-core";

const mockConfig: ServiceConfig = {
 ollamaUrl: 'http://localhost:11434',
 qdrantUrl: 'http://localhost:6333',
 postgresUrl: 'postgresql://localhost/test',
 maxRetries: 3, retryDelayMs: 100, contextLines: 5,
};

describe('Error Analysis Pipeline - Integration Tests', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 let knowledgeBase: KnowledgeBase;
 let contextFormatter: ContextFormatter;
 let progressTracker: ProgressTracker;
 let errorHandler: ErrorHandler;
 let knowledgeBaseLearning: KnowledgeBaseLearning;
 let aceContextManager: AceContextManager;

 beforeEach(() => {
 knowledgeBase = new KnowledgeBase(mockConfig);
 contextFormatter = new ContextFormatter(mockConfig);
 progressTracker = new ProgressTracker(mockConfig);
 errorHandler = new ErrorHandler(mockConfig);
 knowledgeBaseLearning = new KnowledgeBaseLearning(mockConfig);
 aceContextManager = new AceContextManager(mockConfig);
 });

 describe('Knowledge Base and Context Integration', () => {
 it('should store patterns and retrieve them', async () => {
 // Store pattern
 const pattern = {
 id: 'pattern-1',
 filePath: 'app.ts',
 lineNumber: 10,
 code: 'let x = 5;',
 errorType: 'typescript',
 similarity: 0.95,
 };

 await knowledgeBase.storePattern(pattern);

 // Retrieve patterns
 const patterns = await knowledgeBase.retrievePatterns('const', 5);
 expect(patterns.length).toBeGreaterThan(0);
 expect(patterns[0].filePath).toBe('app.ts');
 });

 it('should retrieve patterns by error type', async () => {
 const pattern = {
 id: 'pattern-1',
 filePath: 'test.ts',
 lineNumber: 1,
 code: 'let x = 5;',
 errorType: 'typescript',
 similarity: 0.9,
 };

 await knowledgeBase.storePattern(pattern);

 const retrieved = await knowledgeBase.searchByErrorType('typescript', 10);
 expect(retrieved.length).toBeGreaterThan(0);
 expect(retrieved[0].errorType).toBe('typescript');
 });
 });

 describe('Progress Tracking Integration', () => {
 it('should track error analysis progress', async () => {
 await progressTracker.start(2);

 await progressTracker.updateAnalysis(true, 0.9);
 await progressTracker.updateAnalysis(false, 0.5);

 const metrics = await progressTracker.getMetrics();

 expect(metrics.errorsAnalyzed).toBe(2);
 expect(metrics.errorsFixed).toBe(1);
 expect(metrics.errorsFailed).toBe(1);
 expect(metrics.successRate).toBeCloseTo(50, 0);
 });

 it('should calculate error reduction metrics', async () => {
 await progressTracker.start(10);

 for (let i = 0; i < 7; i++) {
 await progressTracker.updateAnalysis(true, 0.9);
 }

 for (let i = 0; i < 3; i++) {
 await progressTracker.updateAnalysis(false, 0.5);
 }

 const metrics = await progressTracker.getMetrics();

 expect(metrics.errorsAnalyzed).toBe(10);
 expect(metrics.errorsFixed).toBe(7);
 expect(metrics.errorsFailed).toBe(3);
 expect(metrics.successRate).toBeCloseTo(70, 0);
 });
 });

 describe('Knowledge Base Learning Integration', () => {
 it('should store and retrieve fixes', async () => {
 const error: ErrorType = {
 id: 'error-1',
 file: 'test.ts',
 line: 1, column: 1, message: 'Variable should be const',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const diff: Diff = {
 id: 'diff-1',
 errorId: 'error-1',
 file: 'test.ts',
 original: 'let x = 5;',
 modified: 'const x = 5;',
 context: 'const x = 5;',
 explanation: 'Use const for immutable variables',
 lineStart: 1, lineEnd: 1, status: 'applied',
 createdAt: new Date(),
 };

 // Store fix
 const storedFix = await knowledgeBaseLearning.storeFix(diff, error, 'Successfully applied');
 expect(storedFix).toBeDefined();
 expect(storedFix.confidence).toBe(0.95);

 // Retrieve fixes
 const similarError: ErrorType = {
 id: 'error-2',
 file: 'test.ts',
 line: 5, column: 1, message: 'Variable should be const',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const retrievedFixes = await knowledgeBaseLearning.retrieveFixesForError(similarError, 5);
 expect(retrievedFixes.length).toBeGreaterThan(0);
 expect(retrievedFixes[0].fix.id).toBe(storedFix.id);
 });

 it('should maintain fix statistics', async () => {
 const error: ErrorType = {
 id: 'error-1',
 file: 'test.ts',
 line: 1, column: 1, message: 'Test error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const diff: Diff = {
 id: 'diff-1',
 errorId: 'error-1',
 file: 'test.ts',
 original: 'let x = 5;',
 modified: 'const x = 5;',
 context: 'const x = 5;',
 explanation: 'Test fix',
 lineStart: 1, lineEnd: 1, status: 'applied',
 createdAt: new Date(),
 };

 // Store multiple fixes
 await knowledgeBaseLearning.storeFix(diff, error, 'Fix 1');
 await knowledgeBaseLearning.storeFix(diff, error, 'Fix 2');

 const stats = knowledgeBaseLearning.getStatistics();

 expect(stats.totalFixes).toBe(2);
 expect(stats.fixesByErrorType['typescript']).toBe(2);
 expect(stats.averageConfidence).toBeGreaterThan(0);
 expect(stats.averageSuccessRate).toBeGreaterThan(0);
 });
 });

 describe('Error Handler Integration', () => {
 it('should handle service health checks', async () => {
 const health = await errorHandler.checkServiceHealth('test-service', async () => true);

 expect(health).toBeDefined();
 expect(health.serviceName).toBe('test-service');
 expect(health.isHealthy).toBe(true);
 });

 it('should handle service unavailability with fallback', async () => {
 const result = await errorHandler.handleServiceUnavailability('test-service', async () => ({
 fallbackData: 'test',
 }));

 expect(result.handled).toBe(true);
 expect(result.usedFallback).toBe(true);
 expect(result.data).toBeDefined();
 });
 });

 describe('ACE Context Persistence Integration', () => {
 it('should save and restore ACE context', async () => {
 const sessionId = 'session-1';

 const context = {
 sessionId,
 errorAnalysis: [
 {
 errorId: 'error-1',
 rootCause: 'Variable should be const',
 suggestedFix: 'Use const instead of let',
 confidence: 0.95,
 relatedErrors: [],
 context: 'Test context',
 createdAt: new Date(),
 },
 ],
 fixesApplied: [
 {
 id: 'diff-1',
 errorId: 'error-1',
 file: 'test.ts',
 original: 'let x = 5;',
 modified: 'const x = 5;',
 context: 'const x = 5;',
 explanation: 'Use const for immutable variables',
 lineStart: 1, lineEnd: 1, status: 'applied' as const,
  createdAt: new Date( appliedAt: new Date(),
 },
 ],
 metrics: {
 totalErrors: 1, errorsFixed: 1, successRate: 1.0, averageConfidence: 0.95,
 },
 timestamp: new Date(),
 };

 // Save context
 await aceContextManager.saveContext(context);

 // Load context
 const loaded = await aceContextManager.loadContext(sessionId);

 expect(loaded).toBeDefined();
 expect(loaded.sessionId).toBe(sessionId);
 expect(loaded.errorAnalysis).toHaveLength(1);
 expect(loaded.fixesApplied).toHaveLength(1);
 expect(loaded.metrics.errorsFixed).toBe(1);
 });

 it('should update ACE context metrics', async () => {
 const sessionId = 'session-2';

 const context = {
 sessionId,
 errorAnalysis: [],
 fixesApplied: [],
 metrics: {
 totalErrors: 10, errorsFixed: 5, successRate: 0.5, averageConfidence: 0.8,
 },
 timestamp: new Date(),
 };

 await aceContextManager.saveContext(context);

 // Update metrics
 const updatedMetrics = {
 totalErrors: 10, errorsFixed: 8, successRate: 0.8, averageConfidence: 0.85,
 };

 await aceContextManager.updateMetrics(sessionId, updatedMetrics);

 // Verify update
 const loaded = await aceContextManager.loadContext(sessionId);
 expect(loaded.metrics.errorsFixed).toBe(8);
 expect(loaded.metrics.successRate).toBe(0.8);
 });
 });

 describe('Full Pipeline Integration', () => {
 it('should complete error analysis workflow', async () => {
 // Step 1: Store pattern
 const pattern = {
 id: 'pattern-1',
 filePath: 'app.ts',
 lineNumber: 10,
 code: 'let x = 5;',
 errorType: 'typescript',
 similarity: 0.95,
 };

 await knowledgeBase.storePattern(pattern);

 // Step 2: Retrieve patterns
 const patterns = await knowledgeBase.retrievePatterns('const', 5);
 expect(patterns.length).toBeGreaterThan(0);

 // Format context (skip - requires specific implementation)
 const context = 'Test context';

 // Step 3: Create and store fix
 const error: ErrorType = {
 id: 'error-1',
 file: 'app.ts',
 line: 10, column: 5, message: 'Variable should be const',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const diff: Diff = {
 id: 'diff-1',
 errorId: 'error-1',
 file: 'app.ts',
 original: 'let x = 5;',
 modified: 'const x = 5;',
 context: 'const x = 5;',
 explanation: 'Use const for immutable variables',
 lineStart: 10, lineEnd: 10, status: 'applied',
 createdAt: new Date(),
 };

 const storedFix = await knowledgeBaseLearning.storeFix(diff, error, 'Successfully applied');
 expect(storedFix).toBeDefined();

 // Step 4: Track progress
 await progressTracker.start(1);
 await progressTracker.updateAnalysis(true, 0.95);

 const metrics = await progressTracker.getMetrics();
 expect(metrics.errorsFixed).toBe(1);

 // Step 5: Save ACE context
 const aceContext = {
 sessionId: 'session-1',
 errorAnalysis: [
 {
 errorId: 'error-1',
 rootCause: 'Variable should be const',
 suggestedFix: 'Use const instead of let',
 confidence: 0.95,
 relatedErrors: [],
 context: createdAt Date(),
 },
 ],
 fixesApplied: [diff],
 metrics: timestamp Date(),
 };

 await aceContextManager.saveContext(aceContext);

 // Step 6: Verify workflow completion
 const loaded = await aceContextManager.loadContext('session-1');
 expect(loaded.sessionId).toBe('session-1');
 expect(loaded.fixesApplied).toHaveLength(1);
 expect(loaded.errorAnalysis).toHaveLength(1);
 });
 });
});
