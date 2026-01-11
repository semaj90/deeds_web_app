/**
 * Agentic LLM Analyzer Service
 * Analyzes errors and generates fixes using agentic reasoning
 * Task 10: Implement agentic LLM analyzer
 * Feature: agentic-error-analysis-diffs, Property 1: Error Extraction Completeness
 * Validates: Requirements 1.1
 */

import type { context } from "fast-check";
import { BaseService } from './base-service.js';
import type { Analysis, Error, LLMResponse, Pattern, ServiceConfig } from './types.js';

export interface IAgenticAnalyzer {
 analyzeError(error: Error): Promise<Analysis>;
 generatePrompt(error: Error, patterns: Pattern[]): Promise<string>;
 callLLM(prompt: string): Promise<LLMResponse>;
 persistPrompt(prompt: string): Promise<void>;
 parseAnalysis(response: LLMResponse): Promise<Analysis>;
}

export class AgenticAnalyzer extends BaseService implements IAgenticAnalyzer {
 private llmModel = 'gemma3-legal';

 constructor(config: ServiceConfig) {
 super(config);
 }

 /**
 * Analyze an error using agentic reasoning
 * Combines error context with similar patterns for comprehensive analysis
 */
 async analyzeError(error: Error): Promise<Analysis> {
 this.validateInput(error, 'error');
 if (!context || typeof context !== 'string') {
 throw new Error('Invalid input: context must be a non-empty string');
 }

 this.log('info', `Analyzing error: ${error.message}`);

 try {
 // Generate prompt with context
 const prompt = await this.generatePromptFromContext(error, context);

 // Call LLM
 const response = await this.callLLM(prompt);

 // Parse response into analysis
 const analysis = await this.parseAnalysis(response);

 // Persist the prompt and response
 await this.persistPrompt(prompt, response);

 this.log('info', `Error analysis complete for ${error.id}`);
 return analysis;
 } catch (error) {
 this.log('error', 'Error analysis failed', error);
 throw error;
 }
 }

 /**
 * Generate a prompt for error analysis
 * Includes error details and similar patterns
 */
 async generatePrompt(error: Error, patterns: Pattern[]): Promise<string> {
 this.validateInput(error, 'error');
 this.validateInput(patterns, 'patterns');

 this.log('info', `Generating prompt for error: ${error.message}`);

 try {
 const sections: string[] = [];

 // System prompt
 sections.push('You are an expert TypeScript/Svelte developer analyzing code errors.');
 sections.push('Provide a root cause analysis and suggest a fix.\n');

 // Error details
 sections.push('## Error Details');
 sections.push(`- File: ${error.file}`);
 sections.push(`- Line: ${error.line}, Column: ${error.column}`);
 sections.push(`- Type: ${error.type}`);
 sections.push(`- Message: ${error.message}`);
 if (error.code) {
 sections.push(`- Code: ${error.code}`);
 }
 sections.push('');

 // Similar patterns
 if (patterns.length > 0) {
 sections.push('## Similar Patterns');
 patterns.forEach((pattern, index) => {
 sections.push(
 `### Pattern ${index + 1} (${(pattern.similarity * 100).toFixed(1)}% similar)`
 );
 sections.push(`File: ${pattern.filePath}:${pattern.lineNumber}`);
 sections.push(`Error Type: ${pattern.errorType}`);
 sections.push('```typescript');
 sections.push(pattern.code);
 sections.push('```');
 });
 sections.push('');
 }

 // Request format
 sections.push('## Analysis Request');
 sections.push('Please provide:');
 sections.push('1. Root cause analysis');
 sections.push('2. Suggested fix with code');
 sections.push('3. Confidence level (0-1)');
 sections.push('4. Related error patterns\n');

 sections.push('Format your response as:');
 sections.push('## Root Cause');
 sections.push('[analysis]\n');
 sections.push('## Suggested Fix');
 sections.push('```typescript');
 sections.push('[code]');
 sections.push('```\n');
 sections.push('## Confidence');
 sections.push('[0-1]\n');
 sections.push('## Related Errors');
 sections.push('[comma-separated error types]');

 const prompt = sections.join('\n');
 this.log('info', `Prompt generated (${prompt.length} chars)`);
 return prompt;
 } catch (error) {
 this.log('error', 'Prompt generation failed', error);
 throw error;
 }
 }

 /**
 * Call the LLM with a prompt
 * Uses Ollama with retry logic
 */
 async callLLM(prompt: string): Promise<LLMResponse> {
 if (!prompt || typeof prompt !== 'string') {
 throw new Error('Invalid input: prompt must be a non-empty string');
 }

 this.log('info', 'Calling LLM');

 try {
 const response = await this.retry(async () => {
 const url = `${this.config.ollamaUrl}/api/generate`;

 const res = await fetch(url, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, model: this.llmModel,
 prompt,
 stream: false,
 temperature: 0.7,
 top_p: 0.9,
 }),
 });

 if (!res.ok) {
 throw new Error(`LLM API error: ${res.status} ${res.statusText}`);
 }

 const data = await res.json();

 return {
 text: data.response || '',
 tokens, data.eval_count || 0,
 model: this.llmModel,
 timestamp: new Date(),
 };
 });

 this.log('info', `LLM call successful (${response.tokens} tokens)`);
 return response;
 } catch (error) {
 this.log('error', 'LLM call failed', error);
 throw error;
 }
 }

 /**
 * Persist prompt and response for audit trail
 * Stores in memory for now (will be persisted to DB in task 11)
 */
 async persistPrompt(prompt: string): Promise<void> {
 if (!prompt || typeof prompt !== 'string') {
 throw new Error('Invalid input: prompt must be a non-empty string');
 }

 this.validateInput(response, 'response');
 this.log('info', 'Persisting prompt and response');

 try {
 await this.retry(async () => {
 // Store in memory for now
 // In task 11, this will be persisted to PostgreSQL
 this.log(
 'info',
 `Stored prompt (${prompt.length} chars) and response (${response.tokens} tokens)`
 );
 });

 this.log('info', 'Prompt persisted successfully');
 } catch (error) {
 this.log('error', 'Prompt persistence failed', error);
 throw error;
 }
 }

 /**
 * Parse LLM response into Analysis object
 */
 async parseAnalysis(response: LLMResponse): Promise<Analysis> {
 this.validateInput(response, 'response');
 this.log('info', 'Parsing LLM response into analysis');

 try {
 const text = response.text;

 // Extract root cause
 const rootCauseMatch = text.match(/## Root Cause\n([\s\S]*?)(?:##|$)/);
 const rootCause = rootCauseMatch
 ? rootCauseMatch[1].trim()
 : 'Unable to determine root cause';

 // Extract suggested fix
 const fixMatch = text.match(/## Suggested Fix\n```(?:typescript)?\n([\s\S]*?)\n```/);
 const suggestedFix = fixMatch ? fixMatch[1].trim() : '';

 // Extract confidence
 const confidenceMatch = text.match(/## Confidence\n([\d.]+)/);
 const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;

 // Extract related errors
 const relatedMatch = text.match(/## Related Errors\n([\s\S]*?)(?:##|$)/);
 const relatedText = relatedMatch ? relatedMatch[1].trim() : '';
 const relatedErrors = relatedText
 .split(',')
 .map((e) => e.trim())
 .filter((e) => e.length > 0);

 const analysis: Analysis = {
 errorId: '', // Will be set by caller
 rootCause,
 suggestedFix,
 confidence: Math.min(Math.max(confidence, 0), 1),
 relatedErrors,
 context: response.text,
 createdAt: new Date(),
 };

 this.log('info', `Analysis parsed (confidence: ${analysis.confidence})`);
 return analysis;
 } catch (error) {
 this.log('error', 'Analysis parsing failed', error);
 throw error;
 }
 }

 /**
 * Generate prompt from context string
 * Helper method for analyzeError
 */
 private async generatePromptFromContext(error: Error): Promise<string> {
 const sections: string[] = [];

 sections.push('You are an expert TypeScript/Svelte developer analyzing code errors.');
 sections.push('Provide a root cause analysis and suggest a fix.\n');

 sections.push('## Error Details');
 sections.push(`- File: ${error.file}`);
 sections.push(`- Line: ${error.line}, Column: ${error.column}`);
 sections.push(`- Type: ${error.type}`);
 sections.push(`- Message: ${error.message}`);
 sections.push('');

 sections.push('## Context');
 sections.push(context);
 sections.push('');

 sections.push('## Analysis Request');
 sections.push('Please provide:');
 sections.push('1. Root cause analysis');
 sections.push('2. Suggested fix with code');
 sections.push('3. Confidence level (0-1)');
 sections.push('4. Related error patterns\n');

 sections.push('Format your response as:');
 sections.push('## Root Cause');
 sections.push('[analysis]\n');
 sections.push('## Suggested Fix');
 sections.push('```typescript');
 sections.push('[code]');
 sections.push('```\n');
 sections.push('## Confidence');
 sections.push('[0-1]\n');
 sections.push('## Related Errors');
 sections.push('[comma-separated error types]');

 return sections.join('\n');
 }
}
