#!/usr/bin/env node
// Phase 89: Gemma3 Contextual Prompt Engineer
// Uses gemma3-legal:latest with learned patterns and adaptive context

import { execSync } from 'child_process';
import { readFile } from 'fs/promises';
import pg from 'pg';
import { redisFromEnv } from './lib/phase89-cache.mjs';

const { Pool } = pg;

class Gemma3PromptEngineer {
  constructor() {
    this.model = 'gemma3-legal:latest';
    this.baseUrl = 'http://localhost:11434';
    this.pgPool = null;
    this.redis = null;
  }

  async connect() {
    this.pgPool = new Pool({
      host: 'localhost',
      port: 5434,
      database: 'legal_ai_db',
      user: 'legal_admin',
      password: '123456'
    });

    this.redis = await redisFromEnv();
  }

  /**
   * Build context-aware prompt for error fixing
   */
  async buildPrompt(errorId, options = {}) {
    const {
      includePatterns = true,
      includePlaybooks = true,
      includeSimilar = true,
      includeHistory = true,
      maxContext = 2000 // tokens
    } = options;

    // Get error details
    const errorResult = await this.pgPool.query(
      `SELECT id, error_code, file_path, line, message, tags
       FROM raw_error_embeddings
       WHERE id = $1`,
      [errorId]
    );

    if (errorResult.rows.length === 0) {
      throw new Error(`Error ${errorId} not found`);
    }

    const error = errorResult.rows[0];
    let prompt = `You are an expert TypeScript/Svelte error-fixing agent using Gemma3-Legal.\n\n`;

    // Error details
    prompt += `## Error to Fix\n\n`;
    prompt += `**Code**: ${error.error_code}\n`;
    prompt += `**File**: ${error.file_path}:${error.line}\n`;
    prompt += `**Message**: ${error.message}\n`;
    if (error.tags?.length > 0) {
      prompt += `**Tags**: ${error.tags.join(', ')}\n`;
    }
    prompt += `\n`;

    // Learned patterns
    if (includePatterns) {
      const patterns = await this.pgPool.query(
        `SELECT pattern_name, solution_template, confidence_score, times_applied
         FROM learned_fix_patterns
         WHERE error_code = $1
         ORDER BY confidence_score DESC, times_applied DESC
         LIMIT 3`,
        [error.error_code]
      );

      if (patterns.rows.length > 0) {
        prompt += `## Learned Fix Patterns (${error.error_code})\n\n`;
        for (const pattern of patterns.rows) {
          const confidence = (pattern.confidence_score * 100).toFixed(1);
          prompt += `**${pattern.pattern_name}** (${confidence}% confidence, ${pattern.times_applied} applications):\n`;
          prompt += `\`\`\`typescript\n${pattern.solution_template}\n\`\`\`\n\n`;
        }
      }
    }

    // Similar errors (Top-K)
    if (includeSimilar) {
      const similar = await this.pgPool.query(
        `SELECT e.error_code, e.file_path, e.line, e.message, s.similarity
         FROM error_similarity_index s
         JOIN raw_error_embeddings e ON s.target_id = e.id
         WHERE s.source_id = $1
         ORDER BY s.similarity DESC
         LIMIT 3`,
        [errorId]
      );

      if (similar.rows.length > 0) {
        prompt += `## Similar Errors (for context)\n\n`;
        for (const sim of similar.rows) {
          prompt += `- **${sim.error_code}** at ${sim.file_path}:${sim.line} (${(sim.similarity * 100).toFixed(1)}% similar)\n`;
          prompt += `  ${sim.message}\n`;
        }
        prompt += `\n`;
      }
    }

    // Fix history for this error code
    if (includeHistory) {
      const history = await this.pgPool.query(
        `SELECT fix_strategy, success_score, COUNT(*) as times_used
         FROM error_fix_history
         WHERE error_code = $1 AND validated = true
         GROUP BY fix_strategy, success_score
         ORDER BY success_score DESC, times_used DESC
         LIMIT 3`,
        [error.error_code]
      );

      if (history.rows.length > 0) {
        prompt += `## Historical Fix Success Rates\n\n`;
        for (const h of history.rows) {
          prompt += `- **${h.fix_strategy}**: ${(h.success_score * 100).toFixed(1)}% success (${h.times_used} times)\n`;
        }
        prompt += `\n`;
      }
    }

    // Playbook context
    if (includePlaybooks) {
      const playbook = await this.pgPool.query(
        `SELECT raw_text FROM raw_error_embeddings
         WHERE source = 'playbook' AND error_code = $1
         LIMIT 1`,
        [error.error_code]
      );

      if (playbook.rows.length > 0) {
        prompt += `## Auto-Generated Playbook Excerpt\n\n`;
        // Include first 500 chars of playbook
        const excerpt = playbook.rows[0].raw_text.substring(0, 500);
        prompt += `${excerpt}...\n\n`;
      }
    }

    // File context
    try {
      const content = await readFile(error.file_path, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, error.line - 15);
      const end = Math.min(lines.length, error.line + 15);
      const context = lines.slice(start, end);

      prompt += `## File Context (lines ${start + 1}-${end})\n\n`;
      prompt += `\`\`\`typescript\n`;
      context.forEach((line, i) => {
        const lineNum = start + i + 1;
        const marker = lineNum === error.line ? '>>> ' : '    ';
        prompt += `${marker}${line}\n`;
      });
      prompt += `\`\`\`\n\n`;

    } catch (err) {
      console.warn(`Could not read file context: ${err.message}`);
    }

    // Final instructions
    prompt += `## Instructions\n\n`;
    prompt += `1. Analyze the error using learned patterns and context\n`;
    prompt += `2. Apply the highest-confidence fix strategy\n`;
    prompt += `3. Provide ONLY the fixed code for the error line and surrounding context\n`;
    prompt += `4. Ensure the fix follows TypeScript 5.6+ and Svelte 5 best practices\n`;
    prompt += `5. Do NOT include explanations, only code\n\n`;
    prompt += `## Fixed Code:\n\n`;

    return prompt;
  }

  /**
   * Generate fix using Gemma3
   */
  async generateFix(errorId, options = {}) {
    const prompt = await this.buildPrompt(errorId, options);

    console.log(`🤖 Calling ${this.model}...\n`);

    try {
      const response = execSync(
        `curl -s ${this.baseUrl}/api/generate`,
        {
          input: JSON.stringify({
            model: this.model,
            prompt: prompt,
            stream: false,
            options: {
              temperature: 0.2,  // Low temperature for deterministic fixes
              top_p: 0.9,
              top_k: 40,
              num_predict: 500
            }
          }),
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024
        }
      );

      const result = JSON.parse(response);

      console.log(`✅ Generated fix (${result.response.length} chars)\n`);

      return {
        fixedCode: result.response,
        prompt: prompt,
        model: this.model,
        totalDuration: result.total_duration,
        evalCount: result.eval_count
      };

    } catch (error) {
      console.error(`❌ Gemma3 call failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Batch process multiple errors
   */
  async batchFix(errorIds, options = {}) {
    const results = [];

    for (const errorId of errorIds) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing error ${errorId}`);
      console.log(`${'='.repeat(60)}\n`);

      try {
        const fix = await this.generateFix(errorId, options);
        results.push({
          errorId,
          success: true,
          fix
        });
      } catch (error) {
        results.push({
          errorId,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Interactive mode: ask Gemma3 about errors
   */
  async interactiveQuery(query) {
    console.log(`🤖 Gemma3 Query: "${query}"\n`);

    const prompt = `You are Gemma3-Legal, an expert TypeScript/Svelte error-fixing assistant.

Answer the following question using your knowledge of TypeScript errors and best practices:

${query}

Provide a clear, concise answer with code examples if relevant.`;

    try {
      const response = execSync(
        `curl -s ${this.baseUrl}/api/generate`,
        {
          input: JSON.stringify({
            model: this.model,
            prompt: prompt,
            stream: false,
            options: { temperature: 0.5 }
          }),
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024
        }
      );

      const result = JSON.parse(response);
      console.log(`📝 Answer:\n\n${result.response}\n`);

      return result.response;

    } catch (error) {
      console.error(`❌ Query failed: ${error.message}`);
      throw error;
    }
  }

  async close() {
    await this.pgPool?.end();
    await this.redis?.quit();
  }
}

// Main execution
const engineer = new Gemma3PromptEngineer();

try {
  await engineer.connect();

  const command = process.argv[2] || 'help';

  switch (command) {
    case 'fix':
      const errorId = parseInt(process.argv[3]);
      if (!errorId) {
        console.error('Usage: node phase89-gemma3-prompt.mjs fix <error_id>');
        process.exit(1);
      }
      const fix = await engineer.generateFix(errorId);
      console.log('\n📋 Fixed Code:\n');
      console.log(fix.fixedCode);
      break;

    case 'batch':
      const ids = process.argv.slice(3).map(id => parseInt(id));
      if (ids.length === 0) {
        console.error('Usage: node phase89-gemma3-prompt.mjs batch <id1> <id2> ...');
        process.exit(1);
      }
      const results = await engineer.batchFix(ids);
      console.log(`\n📊 Batch Results: ${results.filter(r => r.success).length}/${results.length} succeeded\n`);
      break;

    case 'query':
      const query = process.argv.slice(3).join(' ');
      if (!query) {
        console.error('Usage: node phase89-gemma3-prompt.mjs query <your question>');
        process.exit(1);
      }
      await engineer.interactiveQuery(query);
      break;

    case 'help':
    default:
      console.log(`
Phase 89: Gemma3 Contextual Prompt Engineer

Usage:
  node phase89-gemma3-prompt.mjs fix <error_id>              - Fix single error
  node phase89-gemma3-prompt.mjs batch <id1> <id2> ...       - Batch fix multiple errors
  node phase89-gemma3-prompt.mjs query <question>            - Ask Gemma3 about errors

Examples:
  node phase89-gemma3-prompt.mjs fix 12345
  node phase89-gemma3-prompt.mjs batch 100 101 102
  node phase89-gemma3-prompt.mjs query "How to fix TS1005 errors?"
      `);
  }

} catch (error) {
  console.error('❌ Fatal error:', error);
  process.exit(1);
} finally {
  await engineer.close();
}
