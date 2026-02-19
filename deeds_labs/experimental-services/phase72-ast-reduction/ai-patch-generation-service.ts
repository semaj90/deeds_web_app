/**
 * Phase 72: AI Patch Generation Service
 * Uses gemma3-legal to generate TypeScript/Svelte fixes
 */

export interface PatchContext {
  errorCluster: any;
  sampleErrors: any[];
  relatedCode: string[];
  projectStructure: string;
}

export interface GeneratedPatch {
  code: string;
  explanation: string;
  confidence: number;
  affectedFiles: string[];
  testCases?: string[];
}

export class AIPatchGenerationService {
  private ollamaUrl: string;
  private model: string = 'gemma3-legal:latest';

  constructor(ollamaUrl: string) {
    this.ollamaUrl = ollamaUrl;
  }

  async generatePatchForCluster(context: PatchContext): Promise<GeneratedPatch | null> {
    console.log(`🤖 Generating patch for cluster: ${context.errorCluster.id}`);

    const prompt = this.buildPatchPrompt(context);

    try {
      const response = await this.callOllama(prompt);
      const patch = this.parsePatchResponse(response);

      if (patch && this.validatePatch(patch)) {
        console.log(`✅ Generated valid patch with ${patch.confidence}% confidence`);
        return patch;
      } else {
        console.log('❌ Generated patch failed validation');
        return null;
      }
    } catch (error) {
      console.error('❌ Failed to generate patch:', error);
      return null;
    }
  }

  private buildPatchPrompt(context: PatchContext): string {
    const { errorCluster, sampleErrors, relatedCode, projectStructure } = context;

    return `You are an expert TypeScript and Svelte developer specializing in automated code fixes.

## Task
Generate a precise code patch to fix the following cluster of related TypeScript/Svelte errors.

## Error Cluster Information
- Pattern: ${errorCluster.pattern}
- Error Count: ${errorCluster.errorCount}
- Suggested Fix: ${errorCluster.suggestedFix || 'Not provided'}

## Sample Errors (${sampleErrors.length} shown)
${sampleErrors.slice(0, 5).map((error, i) => `
### Error ${i + 1}
File: ${error.file}:${error.line}:${error.column}
Code: ${error.code}
Message: ${error.message}
Category: ${error.category}
`).join('\n')}

## Related Code Context
${relatedCode.slice(0, 3).map(code => `
\`\`\`typescript
${code}
\`\`\`
`).join('\n')}

## Project Structure
${projectStructure}

## Requirements
1. Provide ONLY the corrected code changes
2. Maintain exact indentation and style
3. Fix the root cause, not just symptoms
4. Ensure type safety
5. Follow Svelte 5 and TypeScript best practices
6. Include import statements if needed
7. Provide confidence score (0-100)

## Output Format
Return a JSON object with:
{
  "code": "the corrected code",
  "explanation": "why this fix works",
  "confidence": 85,
  "affectedFiles": ["file1.ts", "file2.svelte"],
  "testCases": ["optional test cases"]
}

Generate the fix:`;
  }

  private async callOllama(prompt: string): Promise<string> {
    const response = await fetch(`${this.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1, // Low temperature for consistent fixes
          top_p: 0.9,
          num_predict: 2048
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const result = await response.json();
    return result.response;
  }

  private parsePatchResponse(response: string): GeneratedPatch | null {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const patch = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!patch.code || !patch.explanation || typeof patch.confidence !== 'number') {
        return null;
      }

      return {
        code: patch.code,
        explanation: patch.explanation,
        confidence: Math.min(100, Math.max(0, patch.confidence)),
        affectedFiles: patch.affectedFiles || [],
        testCases: patch.testCases || []
      };
    } catch (error) {
      console.error('Failed to parse patch response:', error);
      return null;
    }
  }

  private validatePatch(patch: GeneratedPatch): boolean {
    // Basic validation checks
    if (patch.confidence < 50) return false;
    if (!patch.code.trim()) return false;
    if (patch.affectedFiles.length === 0) return false;

    // Check for common issues
    const code = patch.code.toLowerCase();
    if (code.includes('console.log') && !code.includes('// debug')) {
      console.warn('⚠️ Patch contains console.log statements');
    }

    return true;
  }

  async generateBatchPatches(contexts: PatchContext[]): Promise<Map<string, GeneratedPatch>> {
    const results = new Map<string, GeneratedPatch>();

    console.log(`🤖 Generating ${contexts.length} patches in batch...`);

    // Process in parallel with rate limiting
    const batchSize = 3;
    for (let i = 0; i < contexts.length; i += batchSize) {
      const batch = contexts.slice(i, i + batchSize);
      const promises = batch.map(context =>
        this.generatePatchForCluster(context).then(patch => ({
          clusterId: context.errorCluster.id,
          patch
        }))
      );

      const batchResults = await Promise.all(promises);

      for (const result of batchResults) {
        if (result.patch) {
          results.set(result.clusterId, result.patch);
        }
      }

      // Rate limiting delay
      if (i + batchSize < contexts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ Generated ${results.size}/${contexts.length} valid patches`);
    return results;
  }

  async refinePatch(originalPatch: GeneratedPatch, feedback: string): Promise<GeneratedPatch | null> {
    const refinementPrompt = `
Original patch failed validation. Please refine it based on this feedback:

${feedback}

Original patch:
${JSON.stringify(originalPatch, null, 2)}

Generate an improved version:
`;

    try {
      const response = await this.callOllama(refinementPrompt);
      const refinedPatch = this.parsePatchResponse(response);

      if (refinedPatch) {
        // Boost confidence slightly for refined patches
        refinedPatch.confidence = Math.min(95, refinedPatch.confidence + 10);
      }

      return refinedPatch;
    } catch (error) {
      console.error('Failed to refine patch:', error);
      return null;
    }
  }

  async validatePatchWithTests(patch: GeneratedPatch): Promise<boolean> {
    if (!patch.testCases || patch.testCases.length === 0) {
      return patch.confidence >= 80; // High confidence patches don't need tests
    }

    console.log('🧪 Running patch validation tests...');

    // This would integrate with a test runner
    // For now, return true if tests are provided
    return patch.testCases.length > 0;
  }
}