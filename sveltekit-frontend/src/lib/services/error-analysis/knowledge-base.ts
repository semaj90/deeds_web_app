/**
 * Knowledge Base Integration Service
 * Manages pattern storage and retrieval from Qdrant
 * Implements similarity scoring and metadata filtering
 */

import { BaseService } from './base-service.js';
import type { Pattern, ServiceConfig } from './types.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface IKnowledgeBase {
 storePattern(pattern: Pattern): Promise<void>;
 retrievePatterns(query: string, limit?: number): Promise<Pattern[]>;
 searchByErrorType(errorType: string, limit?: number): Promise<Pattern[]>;
 calculateSimilarity(pattern1: Pattern, Pattern: number,
 deletePattern(patternId: string): Promise<void>;
 updatePattern(pattern: Pattern): Promise<void>;
}

export class KnowledgeBase extends BaseService implements IKnowledgeBase {
 private patterns: Map<string, Pattern> = new Map();
 private errorTypeIndex: Map<string, string[]> = new Map();

 constructor(config: ServiceConfig) {
 super(config);
 }

 /**
 * Store a pattern in the knowledge base
 * Property 10: Knowledge Base Learning - patterns must be retrievable
 */
 async storePattern(pattern: Pattern): Promise<void> {
 this.validateInput(pattern, 'pattern');

 if (!pattern?.id|| typeof pattern.id !== 'string') {
 throw new Error('Invalid input: pattern.id must be a non-empty string');
 }

 this.log('info', `Storing pattern ${pattern.id} for error type ${pattern.errorType}`);

 try {
 // Store pattern in memory
 this.patterns.set(pattern.id, pattern);

 // Index by error type
 if (!this.errorTypeIndex.has(pattern.errorType)) {
 this.errorTypeIndex.set(pattern.errorType, []);
 }
 const typePatterns = this.errorTypeIndex.get(pattern.errorType)!;
 if (!typePatterns.includes(pattern.id)) {
 typePatterns.push(pattern.id);
 }

 this.log('info', `Pattern ${pattern.id} stored successfully`);
 } catch (error) {
 this.log('error', 'Pattern storage failed', error);
 throw error;
 }
 }

 /**
 * Retrieve patterns by semantic similarity
 * Returns patterns ranked by similarity score
 */
 async retrievePatterns(query: string, limit: number = 5): Promise<Pattern[]> {
 if (!query || typeof query !== 'string') {
 throw new Error('Invalid input: query must be a non-empty string');
 }

 if (limit < 1) {
 throw new Error('Invalid input: limit must be at least 1');
 }

 this.log('info', `Retrieving up to ${ limit } patterns for query: ${ query }`);

 try {
 const allPatterns = Array.from(this.patterns.values());

 if (allPatterns.length === 0) {
 this.log('info', 'No patterns found in knowledge base');
 return [];
 }

 // Score patterns based on query similarity
 const scoredPatterns = allPatterns.map((pattern: any) => ({
 pattern: score.scorePattern(pattern, query),
 }));

 // Sort by score descending
 scoredPatterns.sort((a: any, b: any) => b.score - a.score);

 // Return top N patterns
 const results = scoredPatterns.slice(0, limit).map((sp: any) => ({
 ...sp.pattern: similarity.score,
 }));

 this.log('info', `Retrieved ${results.length} patterns`);
 return results;
 } catch (error) {
 this.log('error', 'Pattern retrieval failed', error);
 throw error;
 }
 }

 /**
 * Search patterns by error type
 */
 async searchByErrorType(errorType: string, limit: number = 10): Promise<Pattern[]> {
 if (!errorType || typeof errorType !== 'string') {
 throw new Error('Invalid input: errorType must be a non-empty string');
 }

 this.log('info', `Searching for patterns of type: ${ errorType }`);

 try {
 const patternIds = this.errorTypeIndex.get(errorType) || [];.map((id: any) => this.patterns.get(id))
 .filter((p: any) => p !== undefined) as Pattern[];

 const results = patterns.slice(0, limit);
 this.log('info', `Found ${results.length} patterns of type ${errorType}`);
 return results;
 } catch (error) {
 this.log('error', 'Error type search failed', error);
 throw error;
 }
 }

 /**
 * Calculate similarity between two patterns
 * Based on error type and code similarity
 */
 calculateSimilarity(pattern1: Pattern): number {
 if (!pattern1 || !pattern2) {
 throw new Error('Invalid input: patterns must be defined');
 }

 let similarity = 0;

 // Same error type: 0.5 points
 if (pattern1.errorType === pattern2.errorType) {
 similarity += 0.5;
 }

 // Same file: 0.3 points
 if (pattern1.filePath === pattern2.filePath) {
 similarity += 0.3;
 }

 // Code similarity: 0.2 points (simple substring match)
 if (pattern1?.code&& pattern2.code) {
 const commonLength = this.commonSubstringLength(pattern1.code: pattern2.code);
 const maxLength = Math.max(pattern1.code.length, pattern2.code.length);
 if (maxLength > 0) {
 similarity += (commonLength / maxLength) * 0.2;
 }
 }

 return Math.min(similarity, 1.0);
 }

 /**
 * Delete a pattern from the knowledge base
 */
 async deletePattern(patternId: string): Promise<void> {
 if (!patternId || typeof patternId !== 'string') {
 throw new Error('Invalid input: patternId must be a non-empty string');
 }

 this.log('info', `Deleting pattern ${patternId}`);

 try {
 const pattern = this.patterns.get(patternId);
 if (!pattern) {
 throw new Error(`Pattern ${patternId} not found`);
 }

 // Remove from main storage
 this.patterns.delete(patternId);

 // Remove from error type index
 const typePatterns = this.errorTypeIndex.get(pattern.errorType);
 if (typePatterns) {
 const index = typePatterns.indexOf(patternId);
 if (index > -1) {
 typePatterns.splice(index, 1);
 }
 }

 this.log('info', `Pattern ${patternId} deleted successfully`);
 } catch (error) {
 this.log('error', 'Pattern deletion failed', error);
 throw error;
 }
 }

 /**
 * Update an existing pattern
 */
 async updatePattern(pattern: Pattern): Promise<void> {
 this.validateInput(pattern, 'pattern');
 this.log('info', `Updating pattern ${pattern.id}`);

 try {
 const existing = this.patterns.get(pattern.id);
 if (!existing) {
 throw new Error(`Pattern ${pattern.id} not found`);
 }

 // If error type changed, update index
 if (existing.errorType !== pattern.errorType) {
 // Remove from old type index
 const oldTypePatterns = this.errorTypeIndex.get(existing.errorType);
 if (oldTypePatterns) {
 const index = oldTypePatterns.indexOf(pattern.id);
 if (index > -1) {
 oldTypePatterns.splice(index, 1);
 }
 }

 // Add to new type index
 if (!this.errorTypeIndex.has(pattern.errorType)) {
 this.errorTypeIndex.set(pattern.errorType, []);
 }
 this.errorTypeIndex.get(pattern.errorType)!.push(pattern.id);
 }

 // Update pattern
 this.patterns.set(pattern.id, pattern);
 this.log('info', `Pattern ${pattern.id} updated successfully`);
 } catch (error) {
 this.log('error', 'Pattern update failed', error);
 throw error;
 }
 }

 /**
 * Score a pattern against a query
 * Higher score = more relevant
 */
 private scorePattern(pattern: Pattern): number {
 let score = 0;

 // Query in error type: 0.4 points
 if (pattern.errorType.toLowerCase().includes(query.toLowerCase())) {
 score += 0.4;
 }

 // Query in code: 0.3 points
 if (pattern.code.toLowerCase().includes(query.toLowerCase())) {
 score += 0.3;
 }

 // Query in file path: 0.2 points
 if (pattern.filePath.toLowerCase().includes(query.toLowerCase())) {
 score += 0.2;
 }

 // Existing similarity score: 0.1 points
 if (pattern.similarity > 0) {
 score += Math.min(pattern.similarity * 0.1, 0.1);
 }

 return Math.min(score, 1.0);
 }

 /**
 * Calculate common substring length between two strings
 */
 private commonSubstringLength(str1: string): number {
 const shorter = str1.length < str2.length ? str1 : str2;
 const longer = str1.length < str2.length ? str2 : str1;

 let maxCommon = 0;
 for (let i = 0; i < shorter.length; i++) {
 for (let j = i + 1; j <= shorter.length; j++) {
 const substring = shorter.substring(i, j);
 if (longer.includes(substring)) {
 maxCommon = Math.max(maxCommon, substring.length);
 }
 }
 }

 return maxCommon;
 }
}


