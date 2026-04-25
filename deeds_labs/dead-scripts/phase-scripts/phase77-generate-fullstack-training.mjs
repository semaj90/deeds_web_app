#!/usr/bin/env node
/**
 * Phase 77: Generate Full-Stack Training Data from Codebase Context
 *
 * Generates comprehensive JSONL training datasets from the actual codebase:
 * - bits-ui component patterns
 * - Svelte 5 runes & migration patterns
 * - TypeScript type patterns
 * - Style guides & best practices
 * - Full-stack integration patterns
 *
 * Output: Multiple specialized JSONL files for fine-tuning
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Output directory
const OUTPUT_DIR = path.join(rootDir, 'training-data');

/**
 * Extract bits-ui component patterns from routes
 */
async function extractBitsUIPatterns() {
  const patterns = [];
  const routeFiles = await glob('src/routes/**/*.svelte', { cwd: rootDir });

  for (const file of routeFiles) {
    const content = await fs.readFile(path.join(rootDir, file), 'utf-8');

    // Extract bits-ui imports
    const bitsImports = content.match(/import\s+\{[^}]+\}\s+from\s+['"]bits-ui['"]/g);
    if (!bitsImports) continue;

    // Extract component usage
    const componentUsage = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Look for bits-ui component patterns
      if (line.includes('<Dialog.') || line.includes('<Popover.') ||
          line.includes('<Dropdown.') || line.includes('<Select.') ||
          line.includes('<Tooltip.') || line.includes('<Accordion.')) {

        // Capture multi-line component with context
        const contextStart = Math.max(0, i - 2);
        const contextEnd = Math.min(lines.length, i + 10);
        const snippet = lines.slice(contextStart, contextEnd).join('\n');

        componentUsage.push({
          file,
          line: i + 1,
          snippet: snippet.trim(),
        });
      }
    }

    if (componentUsage.length > 0) {
      patterns.push({
        file,
        imports: bitsImports[0],
        usage: componentUsage,
        hasTypeScript: file.endsWith('.svelte') && content.includes('lang="ts"'),
      });
    }
  }

  return patterns;
}

/**
 * Extract Svelte 5 runes patterns
 */
async function extractSvelte5Patterns() {
  const patterns = [];
  const svelteFiles = await glob('src/**/*.svelte', { cwd: rootDir });

  for (const file of svelteFiles) {
    const content = await fs.readFile(path.join(rootDir, file), 'utf-8');

    // Look for rune usage
    const runes = {
      state: (content.match(/\$state\([^)]*\)/g) || []).length,
      derived: (content.match(/\$derived(?:\.by)?\([^)]*\)/g) || []).length,
      effect: (content.match(/\$effect(?:\.pre)?\([^)]*\)/g) || []).length,
      props: (content.match(/\$props\(\)/g) || []).length,
      bindable: (content.match(/\$bindable\([^)]*\)/g) || []).length,
    };

    if (Object.values(runes).some(count => count > 0)) {
      // Extract script section
      const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
      if (scriptMatch) {
        patterns.push({
          file,
          runes,
          script: scriptMatch[1].trim(),
          hasTypeScript: content.includes('lang="ts"'),
        });
      }
    }
  }

  return patterns;
}

/**
 * Extract TypeScript patterns from services
 */
async function extractTypeScriptPatterns() {
  const patterns = [];
  const tsFiles = await glob('src/lib/**/*.{ts,tsx}', {
    cwd: rootDir,
    ignore: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts'],
  });

  for (const file of tsFiles) {
    const content = await fs.readFile(path.join(rootDir, file), 'utf-8');

    // Extract type definitions
    const types = content.match(/(?:type|interface)\s+\w+[^;{]*[;{]/g) || [];

    // Extract generic patterns
    const generics = content.match(/\w+<[^>]+>/g) || [];

    // Extract async/await patterns
    const asyncPatterns = content.match(/async\s+function[^{]*{[^}]+}/g) || [];

    if (types.length > 0 || generics.length > 0 || asyncPatterns.length > 0) {
      patterns.push({
        file,
        types: types.slice(0, 5), // First 5 types
        generics: [...new Set(generics)].slice(0, 5),
        asyncPatterns: asyncPatterns.slice(0, 3),
        category: file.includes('/services/') ? 'service' :
                 file.includes('/types/') ? 'types' :
                 file.includes('/utils/') ? 'utils' : 'other',
      });
    }
  }

  return patterns;
}

/**
 * Extract style guide patterns
 */
async function extractStylePatterns() {
  const patterns = [];
  const styleFiles = await glob('src/**/*.{svelte,css}', { cwd: rootDir });

  for (const file of styleFiles.slice(0, 50)) { // Sample first 50
    const content = await fs.readFile(path.join(rootDir, file), 'utf-8');

    if (file.endsWith('.svelte')) {
      // Extract <style> blocks
      const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/);
      if (styleMatch && styleMatch[1].trim().length > 50) {
        patterns.push({
          file,
          style: styleMatch[1].trim(),
          hasScoped: !content.includes('<style global'),
          hasTailwind: styleMatch[1].includes('@apply'),
        });
      }
    }
  }

  return patterns;
}

/**
 * Generate bits-ui training examples
 */
function generateBitsUITraining(patterns) {
  const examples = [];

  for (const pattern of patterns.slice(0, 20)) { // Top 20 examples
    const componentType = pattern.usage[0]?.snippet.match(/<(\w+)\./)?.[1] || 'Component';

    examples.push({
      messages: [
        {
          role: 'system',
          content: 'You are an expert Svelte 5 developer specializing in bits-ui component library integration.',
        },
        {
          role: 'user',
          content: `Show me how to use bits-ui ${componentType} component in a Svelte 5 application with TypeScript.`,
        },
        {
          role: 'assistant',
          content: `Here's how to implement a ${componentType} using bits-ui in Svelte 5:

\`\`\`svelte
<script lang="ts">
${pattern.imports}

// Component setup with Svelte 5 runes
let open = $state(false);
</script>

${pattern.usage[0]?.snippet || ''}
\`\`\`

Key points:
- Import components from bits-ui
- Use Svelte 5 \`$state\` for reactive state
- Destructure sub-components (${componentType}.Root, ${componentType}.Trigger, etc.)
- TypeScript types are included automatically`,
        },
      ],
      metadata: {
        category: 'bits-ui',
        component: componentType,
        tags: ['svelte5', 'bits-ui', 'components', 'typescript'],
        source: pattern.file,
      },
    });
  }

  return examples;
}

/**
 * Generate Svelte 5 runes training examples
 */
function generateSvelte5Training(patterns) {
  const examples = [];

  // Group by dominant rune type
  const statePatterns = patterns.filter(p => p.runes.state > 0).slice(0, 10);
  const derivedPatterns = patterns.filter(p => p.runes.derived > 0).slice(0, 10);
  const effectPatterns = patterns.filter(p => p.runes.effect > 0).slice(0, 10);

  // $state examples
  for (const pattern of statePatterns) {
    examples.push({
      messages: [
        {
          role: 'system',
          content: 'You are an expert in Svelte 5 reactivity using runes.',
        },
        {
          role: 'user',
          content: 'How do I create reactive state in Svelte 5?',
        },
        {
          role: 'assistant',
          content: `Use the \`$state\` rune for reactive state in Svelte 5:

\`\`\`svelte
<script${pattern.hasTypeScript ? ' lang="ts"' : ''}>
${pattern.script.split('\n').filter(line => line.includes('$state')).slice(0, 5).join('\n')}
</script>
\`\`\`

Key differences from Svelte 4:
- No \`let\` keyword needed for reactivity declaration
- Use \`$state()\` to make variables reactive
- Deep reactivity for objects/arrays by default
- Can use \`$state.raw()\` for non-reactive objects`,
        },
      ],
      metadata: {
        category: 'svelte5-runes',
        rune: '$state',
        tags: ['svelte5', 'runes', 'reactivity', 'state'],
        source: pattern.file,
      },
    });
  }

  // $derived examples
  for (const pattern of derivedPatterns) {
    examples.push({
      messages: [
        {
          role: 'system',
          content: 'You are an expert in Svelte 5 computed values using $derived.',
        },
        {
          role: 'user',
          content: 'How do I create computed/derived values in Svelte 5?',
        },
        {
          role: 'assistant',
          content: `Use \`$derived\` for computed values in Svelte 5:

\`\`\`svelte
<script${pattern.hasTypeScript ? ' lang="ts"' : ''}>
${pattern.script.split('\n').filter(line => line.includes('$derived')).slice(0, 5).join('\n')}
</script>
\`\`\`

Key points:
- \`$derived\` creates computed values that update automatically
- Use \`$derived.by(() => { ... })\` for complex computations
- Dependencies are tracked automatically
- More efficient than Svelte 4's \`$:\` reactive statements`,
        },
      ],
      metadata: {
        category: 'svelte5-runes',
        rune: '$derived',
        tags: ['svelte5', 'runes', 'computed', 'derived'],
        source: pattern.file,
      },
    });
  }

  return examples;
}

/**
 * Generate TypeScript pattern training examples
 */
function generateTypeScriptTraining(patterns) {
  const examples = [];

  // Service patterns
  const servicePatterns = patterns.filter(p => p.category === 'service').slice(0, 15);

  for (const pattern of servicePatterns) {
    examples.push({
      messages: [
        {
          role: 'system',
          content: 'You are an expert TypeScript developer building type-safe services.',
        },
        {
          role: 'user',
          content: `Show me TypeScript patterns for ${pattern.file.includes('rag') ? 'RAG/vector search' : pattern.file.includes('llm') ? 'LLM integration' : 'service'} in SvelteKit.`,
        },
        {
          role: 'assistant',
          content: `Here are TypeScript patterns for this service:

**Type Definitions:**
\`\`\`typescript
${pattern.types.join('\n\n')}
\`\`\`

**Generic Usage:**
\`\`\`typescript
${pattern.generics.slice(0, 3).join('\n')}
\`\`\`

**Async Patterns:**
\`\`\`typescript
${pattern.asyncPatterns[0] || 'async function example() { ... }'}
\`\`\`

Best practices:
- Define clear interfaces for service contracts
- Use generics for reusable types
- Handle async/await with proper error handling
- Export types for consumers`,
        },
      ],
      metadata: {
        category: 'typescript-patterns',
        subcategory: pattern.category,
        tags: ['typescript', 'services', 'types', 'generics'],
        source: pattern.file,
      },
    });
  }

  return examples;
}

/**
 * Generate style guide training examples
 */
function generateStyleGuideTraining(patterns) {
  const examples = [];

  const scopedStyles = patterns.filter(p => p.hasScoped).slice(0, 10);
  const tailwindStyles = patterns.filter(p => p.hasTailwind).slice(0, 10);

  // Scoped styles
  for (const pattern of scopedStyles) {
    examples.push({
      messages: [
        {
          role: 'system',
          content: 'You are an expert in Svelte component styling and CSS best practices.',
        },
        {
          role: 'user',
          content: 'How should I style Svelte 5 components?',
        },
        {
          role: 'assistant',
          content: `Use scoped styles in Svelte components:

\`\`\`svelte
<style>
${pattern.style.split('\n').slice(0, 15).join('\n')}
</style>
\`\`\`

Best practices:
- Styles are scoped to component by default
- Use \`<style global>\` for global styles
- Combine with Tailwind's \`@apply\` for utility classes
- CSS variables for theming`,
        },
      ],
      metadata: {
        category: 'style-guide',
        type: 'scoped-css',
        tags: ['css', 'styling', 'svelte', 'scoped'],
        source: pattern.file,
      },
    });
  }

  return examples;
}

/**
 * Generate full-stack integration examples
 */
function generateFullStackTraining() {
  return [
    {
      messages: [
        {
          role: 'system',
          content: 'You are an expert full-stack developer specializing in SvelteKit, PostgreSQL, Redis, and Qdrant.',
        },
        {
          role: 'user',
          content: 'Show me a complete SvelteKit API route with database integration, caching, and error handling.',
        },
        {
          role: 'assistant',
          content: `Here's a complete SvelteKit API route pattern:

\`\`\`typescript
// src/routes/api/cases/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { cacheService } from '$lib/server/cache';
import { cases } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const caseId = url.searchParams.get('id');
    if (!caseId) {
      return json({ error: 'Missing case ID' }, { status: 400 });
    }

    // Check cache first
    const cacheKey = \`case:\${caseId}\`;
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return json(cached);
    }

    // Query database
    const caseData = await db
      .select()
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (!caseData.length) {
      return json({ error: 'Case not found' }, { status: 404 });
    }

    // Cache result
    await cacheService.set(cacheKey, caseData[0], 300);

    return json(caseData[0]);
  } catch (error) {
    console.error('API error:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
\`\`\`

Key patterns:
- Type safety with RequestHandler
- Redis caching layer
- Drizzle ORM for PostgreSQL
- Proper error handling
- RESTful responses`,
        },
      ],
      metadata: {
        category: 'fullstack-integration',
        tags: ['sveltekit', 'api', 'database', 'caching', 'postgresql', 'redis'],
      },
    },
    {
      messages: [
        {
          role: 'system',
          content: 'You are an expert in RAG (Retrieval-Augmented Generation) with Qdrant and Ollama.',
        },
        {
          role: 'user',
          content: 'How do I implement semantic search with Qdrant and embeddings in SvelteKit?',
        },
        {
          role: 'assistant',
          content: `Here's a complete RAG implementation:

\`\`\`typescript
// src/lib/services/rag-search.service.ts
import { QdrantClient } from '@qdrant/js-client-rest';
import type { SearchResult } from '$lib/types';

const client = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333'
});

export class RAGSearchService {
  async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(\`\${process.env.OLLAMA_URL}/api/embeddings\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text',
        prompt: text,
      }),
    });
    const data = await response.json();
    return data.embedding;
  }

  async search(
    query: string,
    collection: string,
    limit = 10
  ): Promise<SearchResult[]> {
    // Generate embedding for query
    const embedding = await this.generateEmbedding(query);

    // Search Qdrant
    const results = await client.search(collection, {
      vector: embedding,
      limit,
      with_payload: true,
    });

    return results.map(r => ({
      id: r.id,
      score: r.score,
      payload: r.payload,
    }));
  }
}
\`\`\`

Usage in API route:
\`\`\`typescript
// src/routes/api/search/+server.ts
import { json } from '@sveltejs/kit';
import { RAGSearchService } from '$lib/services/rag-search.service';

const ragService = new RAGSearchService();

export const POST = async ({ request }) => {
  const { query } = await request.json();
  const results = await ragService.search(query, 'documents');
  return json(results);
};
\`\`\``,
        },
      ],
      metadata: {
        category: 'fullstack-integration',
        tags: ['rag', 'qdrant', 'embeddings', 'ollama', 'semantic-search'],
      },
    },
  ];
}

/**
 * Main execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 77: Generate Full-Stack Training Data                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  console.log('📊 Extracting patterns from codebase...\n');

  // Extract patterns
  console.log('   🔍 Extracting bits-ui patterns...');
  const bitsUIPatterns = await extractBitsUIPatterns();
  console.log(`      ✅ Found ${bitsUIPatterns.length} files with bits-ui usage`);

  console.log('   🔍 Extracting Svelte 5 rune patterns...');
  const svelte5Patterns = await extractSvelte5Patterns();
  console.log(`      ✅ Found ${svelte5Patterns.length} files with rune usage`);

  console.log('   🔍 Extracting TypeScript patterns...');
  const tsPatterns = await extractTypeScriptPatterns();
  console.log(`      ✅ Found ${tsPatterns.length} TypeScript files`);

  console.log('   🔍 Extracting style patterns...');
  const stylePatterns = await extractStylePatterns();
  console.log(`      ✅ Found ${stylePatterns.length} styled components\n`);

  // Generate training data
  console.log('📝 Generating training examples...\n');

  const datasets = {
    'bits-ui-patterns.jsonl': generateBitsUITraining(bitsUIPatterns),
    'svelte5-runes.jsonl': generateSvelte5Training(svelte5Patterns),
    'typescript-patterns.jsonl': generateTypeScriptTraining(tsPatterns),
    'style-guide.jsonl': generateStyleGuideTraining(stylePatterns),
    'fullstack-integration.jsonl': generateFullStackTraining(),
  };

  // Write JSONL files
  let totalExamples = 0;

  for (const [filename, examples] of Object.entries(datasets)) {
    const filePath = path.join(OUTPUT_DIR, filename);
    const jsonl = examples.map(ex => JSON.stringify(ex)).join('\n');
    await fs.writeFile(filePath, jsonl, 'utf-8');

    const fileSize = (jsonl.length / 1024).toFixed(1);
    console.log(`   ✅ ${filename.padEnd(30)} ${examples.length.toString().padStart(3)} examples | ${fileSize.padStart(6)} KB`);
    totalExamples += examples.length;
  }

  // Create combined file
  const allExamples = Object.values(datasets).flat();
  const combinedPath = path.join(OUTPUT_DIR, 'fullstack-training-combined.jsonl');
  const combinedJsonl = allExamples.map(ex => JSON.stringify(ex)).join('\n');
  await fs.writeFile(combinedPath, combinedJsonl, 'utf-8');
  const combinedSize = (combinedJsonl.length / 1024).toFixed(1);
  console.log(`   ✅ ${'fullstack-training-combined.jsonl'.padEnd(30)} ${allExamples.length.toString().padStart(3)} examples | ${combinedSize.padStart(6)} KB`);

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Training Data Generation Complete                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`   📊 Total Examples:        ${totalExamples}`);
  console.log(`   📁 Output Directory:      ${OUTPUT_DIR}`);
  console.log(`   🎯 Ready for fine-tuning!\n`);

  // Generate README
  const readme = `# Full-Stack Training Data

Generated: ${new Date().toISOString()}

## Datasets

| File | Examples | Description |
|------|----------|-------------|
| bits-ui-patterns.jsonl | ${datasets['bits-ui-patterns.jsonl'].length} | bits-ui component usage patterns |
| svelte5-runes.jsonl | ${datasets['svelte5-runes.jsonl'].length} | Svelte 5 runes ($state, $derived, $effect) |
| typescript-patterns.jsonl | ${datasets['typescript-patterns.jsonl'].length} | TypeScript service patterns |
| style-guide.jsonl | ${datasets['style-guide.jsonl'].length} | CSS/styling best practices |
| fullstack-integration.jsonl | ${datasets['fullstack-integration.jsonl'].length} | Complete API/database patterns |
| **fullstack-training-combined.jsonl** | **${allExamples.length}** | **All examples combined** |

## Coverage

- **bits-ui**: ${bitsUIPatterns.length} files analyzed
- **Svelte 5 Runes**: ${svelte5Patterns.length} components with runes
- **TypeScript**: ${tsPatterns.length} service files
- **Styling**: ${stylePatterns.length} components with styles

## Categories

- \`bits-ui\`: Component library integration
- \`svelte5-runes\`: Reactivity patterns
- \`typescript-patterns\`: Type-safe service patterns
- \`style-guide\`: CSS/styling conventions
- \`fullstack-integration\`: Complete API routes with DB/cache

## Usage

### For Fine-Tuning

Upload to Google Colab or your training platform:
\`\`\`python
dataset = load_dataset('json', data_files='fullstack-training-combined.jsonl')
\`\`\`

### For Knowledge Base

Import to Qdrant for RAG/ACE agents:
\`\`\`bash
node scripts/phase77-import-training-to-kb.mjs
\`\`\`

## Example Format

\`\`\`json
{
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "metadata": {
    "category": "bits-ui",
    "tags": ["svelte5", "components"],
    "source": "src/routes/..."
  }
}
\`\`\`
`;

  await fs.writeFile(path.join(OUTPUT_DIR, 'README.md'), readme, 'utf-8');
  console.log(`   📄 README.md created\n`);
}

// Run
main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
