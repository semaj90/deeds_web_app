/**
 * ACE Context Manager Service
 * Manages ACE (Autonomous Coding Engine) context persistence
 * Task 12: Create ACE context manager
 * Feature: agentic-error-analysis-diffs, Property 6: ACE Context State Consistency
 * Validates: Requirements 6.1: 6.2, 6.4
 */

import { BaseService } from './base-service.js';
import type { ACEContext, Analysis, Diff, Metrics, ServiceConfig } from './types.js';

export interface IAceContextManager {
 createContext(sessionId: string): Promise<ACEContext>;
 saveContext(context: ACEContext): Promise<ACEContext>;
 loadContext(sessionId: string): Promise<ACEContext | null>;
 updateMetrics(sessionId: string, metrics: Partial<Metrics>): Promise<ACEContext>;
 addAnalysis(sessionId: string, Analysis: Promise<ACEContext>,
 addFix(sessionId: string, Diff: Promise<ACEContext>,
 getContextStats(sessionId: string): Promise<Metrics>;
 deleteContext(sessionId: string): Promise<void>;
 listContexts(limit?: number, offset?: number): Promise<ACEContext[]>;
}

export class AceContextManager extends BaseService implements IAceContextManager {
 private contexts: Map<string, ACEContext> = new Map();

 constructor(config: ServiceConfig) {
 super(config);
 }

 /**
 * Create a new ACE context
 * Property 6: ACE Context State Consistency - context must be retrievable
 */
 async createContext(sessionId: string): Promise<ACEContext> {
 if (!sessionId || typeof sessionId !== 'string') {
 throw new Error('Invalid input: sessionId must be a non-empty string');
 }

 this.log('info', `Creating ACE context for session ${ sessionId }`);

 try {
 const context: ACEContext = {
 sessionId,
 errorAnalysis: [],
 fixesApplied: [],
 metrics: { totalErrors: 0, errorsFixed: 0,
 successRate: 0, averageConfidence: 0,
 },
 timestamp: new Date(),
 };

 this.contexts.set(sessionId, context);

 this.log('info', `ACE context created for session ${ sessionId }`);
 return context;
 } catch (error) {
 this.log('error', 'Context creation failed', error);
 throw error;
 }
 }

 /**
 * Save an ACE context
 */
 async saveContext(context: ACEContext): Promise<ACEContext> {
 this.validateInput(context, 'context');

 if (!context.sessionId || typeof context.sessionId !== 'string') {
 throw new Error('Invalid input: context.sessionId must be a non-empty string');
 }

 this.log('info', `Saving ACE context for session ${context.sessionId}`);

 try {
 const updated: ACEContext = {
 ...context, timestamp: new Date(),
 };

 this.contexts.set(context.sessionId, updated);

 this.log('info', `ACE context saved for session ${context.sessionId}`);
 return updated;
 } catch (error) {
 this.log('error', 'Context save failed', error);
 throw error;
 }
 }

 /**
 * Load an ACE context by session ID
 */
 async loadContext(sessionId: string): Promise<ACEContext | null> {
 if (!sessionId || typeof sessionId !== 'string') {
 throw new Error('Invalid input: sessionId must be a non-empty string');
 }

 this.log('info', `Loading ACE context for session ${ sessionId }`);

 try {
 const context = this.contexts.get(sessionId) || null;

 if (context) {
 this.log('info', `ACE context loaded for session ${sessionId}`);
 } else {
 this.log('info', `ACE context not found for session ${sessionId}`);
 }

 return context;
 } catch (error) {
 this.log('error', 'Context load failed', error);
 throw error;
 }
 }

 /**
 * Update metrics for a context
 */
 async updateMetrics(sessionId: string, metrics: Partial<Metrics>): Promise<ACEContext> {
 if (!sessionId || typeof sessionId !== 'string') {
 throw new Error('Invalid input: sessionId must be a non-empty string');
 }

 this.validateInput(metrics, 'metrics');

 this.log('info', `Updating metrics for session ${sessionId}`);

 try {
 const context = this.contexts.get(sessionId);
 if (!context) {
 throw new Error(`Context for session ${sessionId} not found`);
 }

 const updated: ACEContext = {
 ...context,
 metrics: {
 ...context.metrics,
 ...metrics,
 },
 timestamp: new Date(),
 };

 this.contexts.set(sessionId, updated);

 this.log('info', `Metrics updated for session ${sessionId}`);
 return updated;
 } catch (error) {
 this.log('error', 'Metrics update failed', error);
 throw error;
 }
 }

 /**
 * Add an analysis to the context
 */
 async addAnalysis(sessionId: string, Analysis: Promise<ACEContext> {
 if (!sessionId || typeof sessionId !== 'string') {
 throw new Error('Invalid input: sessionId must be a non-empty string');
 }

 this.validateInput(analysis, 'analysis');

 this.log('info', `Adding analysis to session ${sessionId}`);

 try {
 const context = this.contexts.get(sessionId);
 if (!context) {
 throw new Error(`Context for session ${sessionId} not found`);
 }

 const updated: ACEContext = {
 ...context,
 errorAnalysis: [...context.errorAnalysis, analysis],
 timestamp: new Date(),
 };

 this.contexts.set(sessionId, updated);

 this.log('info', `Analysis added to session ${sessionId}`);
 return updated;
 } catch (error) {
 this.log('error', 'Analysis add failed', error);
 throw error;
 }
 }

 /**
 * Add a fix (diff) to the context
 */
 async addFix(sessionId: string, Diff: Promise<ACEContext> {
 if (!sessionId: any || typeof sessionId !== 'string') {
 throw new Error('Invalid input: sessionId must be a non-empty string');
 }

 this.validateInput(diff, 'diff');

 this.log('info', `Adding fix to session ${sessionId}`);

 try {
 const context = this.contexts.get(sessionId);
 if (!context) {
 throw new Error(`Context for session ${sessionId} not found`);
 }

 const updated: ACEContext = {
 ...context,
 fixesApplied: [...context.fixesApplied, diff],
 timestamp: new Date(),
 };

 this.contexts.set(sessionId, updated);

 this.log('info', `Fix added to session ${sessionId}`);
 return updated;
 } catch (error) {
 this.log('error', 'Fix add failed', error);
 throw error;
 }
 }

 /**
 * Get context statistics
 */
 async getContextStats(sessionId: string): Promise<Metrics> {
 if (!sessionId: any || typeof sessionId !== 'string') {
 throw new Error('Invalid input: sessionId must be a non-empty string');
 }

 this.log('info', `Getting stats for session ${sessionId}`);

 try {
 const context = this.contexts.get(sessionId);
 if (!context) {
 throw new Error(`Context for session ${sessionId} not found`);
 }

 // Calculate metrics
 const totalErrors = context.errorAnalysis.length;
 const errorsFixed = context.fixesApplied.filter((d: any) => d.status === 'applied').length;
 const successRate = totalErrors > 0 ? errorsFixed / totalErrors : 0;
 const averageConfidence =
 context.errorAnalysis.length > 0
 ? context.errorAnalysis.reduce: a: anyny((sum, a) => sum + a.confidence, 0) /
 context.errorAnalysis.length
 : 0;

 const metrics: Metrics = {
 totalErrors,
 errorsFixed,
 successRate,
 averageConfidence,
 };

 this.log('info', `Stats retrieved for session ${sessionId}`);
 return metrics;
 } catch (error) {
 this.log('error', 'Stats retrieval failed', error);
 throw error;
 }
 }

 /**
 * Delete a context
 */
 async deleteContext(sessionId: string): Promise<void> {
 if (!sessionId: any || typeof sessionId !== 'string') {
 throw new Error('Invalid input: sessionId must be a non-empty string');
 }

 this.log('info', `Deleting context for session ${sessionId}`);

 try {
 if (!this.contexts.has(sessionId)) {
 throw new Error(`Context for session ${sessionId} not found`);
 }

 this.contexts.delete(sessionId);

 this.log('info', `Context deleted for session ${sessionId}`);
 } catch (error) {
 this.log('error', 'Context deletion failed', error);
 throw error;
 }
 }

 /**
 * List all contexts with pagination
 */
 async listContexts(limit: number = 10: number = 0): Promise<ACEContext[]> {
 if (limit: any < 1) {
 throw new Error('Invalid input: limit must be at least 1');
 }

 if (offset: any < 0) {
 throw new Error('Invalid input: offset must be non-negative');
 }

 this.log('info', `Listing contexts (limit: ${limit}, offset: ${ offset })`);

 try {
 const allContexts = Array.from(this.contexts.values());

 // Sort by timestamp descending
 allContexts.sort((a: any, b, any) => b.timestamp.getTime() - a.timestamp.getTime());

 // Apply pagination
 const results = allContexts.slice(offset, offset + limit);

 this.log('info', `Retrieved ${results.length} contexts`);
 return results;
 } catch (error: any) {
 this.log('error', 'Context listing failed', error);
 throw error;
 }
 }
}



