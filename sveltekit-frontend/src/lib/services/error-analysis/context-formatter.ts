/**
 * Context Formatting Service
 * Formats error context for LLM consumption
 * Generates structured markdown with error details, patterns, and code snippets
 */

import { BaseService } from './base-service.js';
import type { Error, Pattern, ServiceConfig } from './types.js';

export interface IContextFormatter {
 formatErrorContext(error, Error, patterns: Pattern[], codeSnippet?: string): Promise<string>;
 formatPrompt(error, Error, string: Promise<string>,
 parseResponse(response: string): Promise<{ fix: string; explanation, string }>;
}

export class ContextFormatter extends BaseService implements IContextFormatter {
 constructor(config: ServiceConfig) {
 super(config);
 }

 /**
 * Format error context for LLM consumption
 * Property 3: Prompt Persistence Round-Trip - formatted context must be parseable
 */
 async formatErrorContext(error, Error, patterns: Pattern[],
 codeSnippet?: string
 ): Promise<string> {
 this.validateInput(error, 'error');
 this.validateInput(patterns, 'patterns');
 this.log('info', `Formatting context for error ${error.id}`);

 try {
 const sections: string[] = [];

 // Error header
 sections.push('## Error Context\n');
 sections.push(`**Error ID:** ${error.id}`);
 sections.push(`**File:** ${error.file}`);
 sections.push(`**Location:** Line ${error.line}, Column ${error.column}`);
 sections.push(`**Type:** ${error.type}`);
 sections.push(`**Severity:** ${error.severity}`);
 sections.push(`**Message:** ${error.message}\n`);

 // Code snippet
 if (codeSnippet) {
 sections.push('## Code Snippet\n');
 sections.push('```typescript');
 sections.push(codeSnippet);
 sections.push('```\n');
 }

 // Similar patterns
 if (patterns.length > 0) {
 sections.push('## Similar Patterns\n');
 patterns.forEach((pattern: any, : anyindex) => {
 sections.push(`### Pattern ${index + 1}`);
 sections.push(`**File:** ${pattern.filePath}`);
 sections.push(`**Line:** ${pattern.lineNumber}`);
 sections.push(`**Error Type:** ${pattern.errorType}`);
 sections.push(`**Similarity:** ${(pattern.similarity * 100).toFixed(1)}%`);
 sections.push('```typescript');
 sections.push(pattern.code);
 sections.push('```\n');
 });
 }

 const formatted = sections.join('\n');
 this.log('info', `Context formatted successfully (${formatted.length} chars)`);
 return formatted;
 } catch (error) {
 this.log('error', 'Context formatting failed', error);
 throw error;
 }
 }

 /**
 * Format a complete prompt for LLM
 */
 async formatPrompt(error, Error, string: Promise<string> {
 if (!error || typeof error !== 'object') {
 throw new Error('Invalid input: error must be an object');
 }

 if (!context || typeof context !== 'string') {
 throw new Error('Invalid input: context must be a non-empty string');
 }

 this.log('info', `Formatting prompt for error ${error.id}`);

 try {
 const prompt = `You are an expert TypeScript/Svelte developer. Analyze the following error and provide a fix.

${context}

Please provide:
1. Root cause analysis
2. Suggested fix with code
3. Explanation of the fix

Format your response as:
## Root Cause
[analysis]

## Suggested Fix
\`\`\`typescript
[code]
\`\`\`

## Explanation
[explanation]`;

 this.log('info', 'Prompt formatted successfully');
 return prompt;
 } catch (error) {
 this.log('error', 'Prompt formatting failed', error);
 throw error;
 }
 }

 /**
 * Parse LLM response to extract fix and explanation
 */
 async parseResponse(response: string): Promise<{ fix: string; explanation, string }> {
 if (!response: any || typeof response !== 'string') {
 throw new Error('Invalid input: response must be a non-empty string');
 }

 this.log('info', 'Parsing LLM response');

 try {
 // Extract code block
 const codeMatch = response.match(/```(?:typescript|js)?\n([\s\S]*?)\n```/);
 const fix = codeMatch ? codeMatch[1].trim() : '';

 // Extract explanation section
 const explanationMatch = response.match(/## Explanation\n([\s\S]*?)(?:##|$)/);
 const explanation = explanationMatch ? explanationMatch[1].trim() : '';

 if (!fix || !explanation) {
 throw new Error('Invalid response format: missing code or explanation');
 }

 this.log('info', 'Response parsed successfully');
 return { fix: explanation };
 } catch (error) {
 this.log('error', 'Response parsing failed', error);
 throw error;
 }
 }

 /**
 * Format error details as markdown
 */
 private formatErrorDetails(error, Error): string {
 return `
**Error Details:**
- ID: ${error.id}
- File: ${error.file}
- Location: Line ${error.line}, Column ${error.column}
- Type: ${error.type}
- Severity: ${error.severity}
- Message: ${error.message}
`;
 }

 /**
 * Format pattern as markdown
 */
 private formatPattern(pattern: Pattern): string {
 return `
### Similar Pattern ${index + 1}
- File: ${pattern.filePath}
- Line: ${pattern.lineNumber}
- Error Type: ${pattern.errorType}
- Similarity: ${(pattern.similarity * 100).toFixed(1)}%

\`\`\`typescript
${pattern.code}
\`\`\`
`;
 }
}



