#!/usr/bin/env node
/**
 * Contextual Prompt Engineering Synthesizer
 *
 * Builds rich context for LLM thinking by:
 * 1. Retrieving relevant code units from Qdrant (semantic search)
 * 2. Fetching import/dependency graph from PostgreSQL
 * 3. Loading error patterns and solutions
 * 4. Synthesizing Svelte 5 + SvelteKit 2 + UnoCSS best practices
 * 5. Generating structured prompts for gemma3-legal thinking
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import ollama from 'ollama';
import pg from 'pg';

const { Pool } = pg;

// =============================================================================
// Configuration
// =============================================================================
const CONFIG = {
  postgres: {
    host: 'localhost',
    port: 5434,
    database: 'legal_ai_db',
    user: 'legal_admin',
    password: '123456'
  },
  qdrant: { url: 'http://localhost:6333' },
  ollama: {
    model: 'gemma3-legal:latest',
    embeddingModel: 'embeddinggemma:latest'
  }
};

let db, qdrant;

// =============================================================================
// Best Practices Knowledge Base
// =============================================================================
const BEST_PRACTICES = {
  svelte5: {
    runes: [
      '$state() for reactive state',
      '$derived() for computed values',
      '$effect() for side effects (replaces onMount + reactive statements)',
      'No more export let - use $props() instead',
      'Component events via callback props, not createEventDispatcher',
      '$bindable() for two-way binding'
    ],
    snippets: [
      'Use {@render children()} instead of <slot>',
      'Avoid {#snippet} syntax for reusable templates',
      'Event handlers: onclick not on:click'
    ],
    migration: [
      'Replace reactive: $ with $derived()',
      'Replace onMount(() => {}) with $effect(() => {})',
      'Replace export let prop with let { prop } = $props()'
    ]
  },

  sveltekit2: {
    routing: [
      '+page.svelte for pages',
      '+page.server.ts for server-side data loading',
      '+layout.svelte for nested layouts',
      'Use load() functions, not getServerSideProps',
      'Form actions in +page.server.ts'
    ],
    performance: [
      'Preload data with load() functions',
      'Use $app/navigation for client-side routing',
      'Leverage streaming with defer()'
    ]
  },

  unocss: {
    utility: [
      'Use uno.css utility classes: flex, grid, text-sm, bg-blue-500',
      'Prefer Tailwind-compatible classes',
      'Use shortcuts in uno.config.ts for reusable patterns',
      'Avoid @apply - use native CSS or shortcuts instead'
    ],
    integration: [
      'Import virtual:uno.css in app layout',
      'Configure UnoCSS presets: wind, icons, typography',
      'Use attributify mode for cleaner markup'
    ]
  }
};

// =============================================================================
// Context Retrieval
// =============================================================================
async function retrieveSemanticContext(query, limit = 10) {
  console.log(`\n🔍 Retrieving semantic context for: "${query}"`);

  // Get embedding for query
  const { embedding } = await ollama.embeddings({
    model: CONFIG.ollama.embeddingModel,
    prompt: query
  });

  // Search Qdrant
  const results = await qdrant.search('phase89_code_units', {
    vector: embedding,
    limit,
    with_payload: true
  });

  console.log(`   Found ${results.length} relevant files`);

  return results.map(r => ({
    file: r.payload?.file_path,
    similarity: r.score,
    errors: r.payload?.metadata?.error_count || 0,
    complexity: r.payload?.metadata?.complexity || 0,
    snippet: r.payload?.code_snippet || ''
  }));
}

// =============================================================================
// Dependency Graph Retrieval
// =============================================================================
async function getDependencyContext(filePath) {
  const result = await db.query(`
    SELECT
      source_file,
      target_file,
      import_type
    FROM phase89_import_edges
    WHERE source_file = $1 OR target_file = $1
    LIMIT 20
  `, [filePath]);

  return {
    imports: result.rows.filter(r => r.source_file === filePath),
    importedBy: result.rows.filter(r => r.target_file === filePath)
  };
}

// =============================================================================
// Error Pattern Retrieval
// =============================================================================
async function getErrorPatterns(errorType) {
  const result = await db.query(`
    SELECT
      error_message,
      solution,
      confidence
    FROM phase89_error_clusters
    WHERE cluster_label ILIKE $1
    ORDER BY confidence DESC
    LIMIT 5
  `, [`%${errorType}%`]);

  return result.rows;
}

// =============================================================================
// Prompt Synthesis
// =============================================================================
function synthesizePrompt(context) {
  const {
    query,
    semanticFiles,
    dependencies,
    errorPatterns,
    framework = 'svelte5'
  } = context;

  let prompt = `# Context-Aware Code Analysis\n\n`;
  prompt += `## Query: ${query}\n\n`;

  // Best Practices Section
  if (framework === 'svelte5') {
    prompt += `## Svelte 5 Best Practices:\n`;
    BEST_PRACTICES.svelte5.runes.forEach(rule => {
      prompt += `- ${rule}\n`;
    });
    prompt += `\n`;
  }

  // Relevant Files Section
  if (semanticFiles?.length > 0) {
    prompt += `## Relevant Code Files (by semantic similarity):\n\n`;
    semanticFiles.forEach((file, i) => {
      prompt += `${i + 1}. **${file.file}**\n`;
      prompt += `   - Similarity: ${(file.similarity * 100).toFixed(1)}%\n`;
      prompt += `   - Errors: ${file.errors} | Complexity: ${file.complexity}\n`;
      if (file.snippet) {
        prompt += `   - Snippet:\n\`\`\`typescript\n${file.snippet.substring(0, 200)}...\n\`\`\`\n`;
      }
      prompt += `\n`;
    });
  }

  // Dependency Context
  if (dependencies) {
    prompt += `## Dependency Graph:\n`;
    if (dependencies.imports?.length > 0) {
      prompt += `### Imports:\n`;
      dependencies.imports.forEach(imp => {
        prompt += `- ${imp.target_file}\n`;
      });
    }
    if (dependencies.importedBy?.length > 0) {
      prompt += `### Imported By:\n`;
      dependencies.importedBy.forEach(imp => {
        prompt += `- ${imp.source_file}\n`;
      });
    }
    prompt += `\n`;
  }

  // Error Patterns
  if (errorPatterns?.length > 0) {
    prompt += `## Known Error Patterns & Solutions:\n\n`;
    errorPatterns.forEach((pattern, i) => {
      prompt += `${i + 1}. **${pattern.error_message}**\n`;
      prompt += `   Solution: ${pattern.solution}\n`;
      prompt += `   Confidence: ${(pattern.confidence * 100).toFixed(0)}%\n\n`;
    });
  }

  // Thinking Framework
  prompt += `## LLM Thinking Framework:\n`;
  prompt += `1. **Analyze**: Review relevant files and error patterns\n`;
  prompt += `2. **Synthesize**: Apply Svelte 5/SvelteKit 2 best practices\n`;
  prompt += `3. **Propose**: Generate fix with UnoCSS utility classes\n`;
  prompt += `4. **Validate**: Check against dependency graph for side effects\n\n`;

  prompt += `## Your Task:\n${query}\n`;

  return prompt;
}

// =============================================================================
// LLM Thinking Chain
// =============================================================================
async function generateThinkingChain(prompt) {
  console.log('\n🤔 Generating LLM thinking chain...');

  const response = await ollama.chat({
    model: CONFIG.ollama.model,
    messages: [
      {
        role: 'system',
        content: 'You are an expert in Svelte 5, SvelteKit 2, and UnoCSS. Think step-by-step and provide detailed reasoning.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    options: {
      temperature: 0.3,
      num_ctx: 8192
    }
  });

  return response.message.content;
}

// =============================================================================
// Main Interface
// =============================================================================
async function main() {
  console.log('\n🧠 Contextual Prompt Engineering Synthesizer\n');
  console.log('════════════════════════════════════════════════════════════\n');

  // Connect
  db = new Pool(CONFIG.postgres);
  qdrant = new QdrantClient(CONFIG.qdrant);

  await db.query('SELECT 1');
  console.log('✅ Connected to PostgreSQL');
  console.log('✅ Connected to Qdrant');

  // Example: Analyze a specific query
  const query = process.argv[2] || 'Fix ternary operator comma errors in Svelte components';

  console.log(`\n📝 Query: "${query}"`);

  // Retrieve context
  const semanticFiles = await retrieveSemanticContext(query, 5);
  const errorPatterns = await getErrorPatterns('ternary');

  // Synthesize prompt
  const contextualPrompt = synthesizePrompt({
    query,
    semanticFiles,
    errorPatterns,
    framework: 'svelte5'
  });

  console.log('\n📄 Synthesized Prompt:\n');
  console.log(contextualPrompt);

  // Generate LLM thinking
  console.log('\n════════════════════════════════════════════════════════════\n');
  const thinking = await generateThinkingChain(contextualPrompt);

  console.log('💡 LLM Thinking Output:\n');
  console.log(thinking);

  // Cleanup
  await db.end();

  console.log('\n✅ Synthesis Complete!\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { getDependencyContext, retrieveSemanticContext, synthesizePrompt };

