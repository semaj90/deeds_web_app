#!/usr/bin/env node
/**
 * Phase 10: API Indexing & Discovery Integration
 *
 * Canonical flow:
 * 1. Scan SvelteKit API routes (src/routes/api/**\/+server.ts)
 * 2. Extract handlers (GET, POST, etc.), Zod schemas, JSDoc
 * 3. Build tool packets with input_schema/output_schema JSONB
 * 4. Call legal-ai-go-embedding:8097 for 384-dim vectors
 * 5. Insert into tool_registry with packet_type='api'
 * 6. Mirrors available to Qdrant + go-retrieval for search
 *
 * Truth layer: tool_registry (Postgres)
 * Embedding: legal-ai-go-embedding:8097 (embeddinggemma, 384-dim)
 * Search: legal-ai-go-retrieval:8100 or legal-ai-go-search:8096
 * HMM selector: uses tool_registry for allow/block/recommend
 */

import { Command } from 'commander';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import fetch from 'node-fetch';

const program = new Command();

program
  .option('--dry-run', 'Show what would be indexed without applying')
  .option('--apply', 'Apply API indexing to tool_registry')
  .option('--limit <n>', 'Limit number of API routes to process', '100')
  .option('--embed', 'Call go-embedding-service to generate vectors')
  .option('--verbose', 'Show detailed progress');

program.parse(process.argv);
const options = program.opts();

const DRY_RUN = options.dryRun;
const VERBOSE = options.verbose;
const APPLY = options.apply;
const DO_EMBED = options.embed;
const LIMIT = parseInt(options.limit, 10);

const EMBEDDING_SERVICE = 'http://localhost:8097';

/**
 * Extract API metadata from +server.ts files
 * Handles both `export const GET: RequestHandler = ...` and `export async function GET(...)`
 */
function extractApiMetadata(filePath, content) {
  try {
    // Extract route path from file path
    // e.g., "src/routes/api/retrieval/unified/+server.ts" → "/api/retrieval/unified"
    const routePath = filePath
      .replace(/^.*\/src\/routes/, '')
      .replace(/\/\+server\.ts$/, '');

    // Extract handlers (GET, POST, etc.)
    // Matches both:
    //   export const GET: RequestHandler = ...
    //   export async function POST(...)
    const handlers = new Set();
    const handlerRegex = /export\s+(?:const\s+([A-Z]+)\s*(?::[^=]+)?=|async\s+function\s+([A-Z]+)\s*\()/g;
    let match;
    while ((match = handlerRegex.exec(content)) !== null) {
      handlers.add(match[1] || match[2]);
    }

    // Extract Zod schemas more thoroughly
    const inputSchema = extractZodSchema(content, 'input');
    const outputSchema = extractZodSchema(content, 'output|return');

    // Extract JSDoc + first comment
    const description = extractDescription(content);

    return {
      route_path: routePath,
      tool_id: `api:${routePath.replace(/^\/+/, '').replace(/\//g, '.')}`,
      handlers: Array.from(handlers).length > 0 ? Array.from(handlers) : ['GET'],
      input_schema: inputSchema,
      output_schema: outputSchema,
      description,
      complexity: estimateComplexity(content),
      auth_required: content.includes('requireAuth') || routePath.includes('/admin'),
      file_path: filePath
    };
  } catch (error) {
    if (VERBOSE) console.error(`  [extraction error in ${filePath}]:`, error.message);
    return null;
  }
}

/**
 * Extract Zod schema definition from content
 */
function extractZodSchema(content, schemaName) {
  // Look for const inputSchema = z.object({ ... })
  const regex = new RegExp(`const\\s+${schemaName}\\s*=\\s*(z\\.\\w+\\([^)]*\\)|\\{[^}]*\\})`, 's');
  const match = content.match(regex);

  if (match) {
    // Return the schema expression (simplified JSONB representation)
    return { type: 'zod', expression: match[1].substring(0, 200) };
  }

  // Fallback: extract from function parameters or return type hints
  return { type: 'unknown', expression: null };
}

/**
 * Extract JSDoc description from file
 */
function extractDescription(content) {
  // Look for JSDoc comment
  const docMatch = content.match(/\/\*\*\n\s*\*\s*([^\n]+)/);
  if (docMatch) return docMatch[1];

  // Look for inline comment
  const inlineMatch = content.match(/\/\/\s*(.+?)\n/);
  if (inlineMatch) return inlineMatch[1];

  return 'Auto-discovered API endpoint';
}

/**
 * Estimate API complexity (simple, medium, advanced)
 */
function estimateComplexity(content) {
  const hasDb = content.includes('pool.query') || content.includes('db.');
  const hasGpu = content.includes('gpu') || content.includes('tensor') || content.includes('embedding');
  const hasGraph = content.includes('neo4j') || content.includes('cypher');
  const hasAsync = content.includes('await');

  if (hasGpu || hasGraph) return 'advanced';
  if (hasDb || hasAsync) return 'medium';
  return 'simple';
}

/**
 * Call embedding service to generate 384-dim vector for tool summary
 */
async function generateEmbedding(summary) {
  try {
    const response = await fetch(`${EMBEDDING_SERVICE}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: summary }),
      timeout: 10000
    });

    if (!response.ok) {
      console.error(`  ⚠️  Embedding service HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.embedding; // Should be float32[384]
  } catch (error) {
    if (VERBOSE) console.error(`  [embedding error]:`, error.message);
    return null;
  }
}

async function indexApis() {
  console.log('🔍 Phase 10: API Indexing & Discovery Integration');
  console.log(`Target: Index SvelteKit API routes as tool packets`);
  console.log(`Embedding: ${DO_EMBED ? 'YES (legal-ai-go-embedding:8097)' : 'NO (dry extraction only)'}`);
  console.log(DRY_RUN ? '(DRY RUN - no database writes)' : '(APPLY mode)');
  console.log('');

  try {
    // Find all API route files
    console.log('📚 Scanning API routes...');
    const apiFiles = await glob('src/routes/api/**/*.ts', {
      ignore: ['**/node_modules/**', '**/.next/**', '**/.claude/**']
    });

    const apiRoutes = apiFiles
      .filter(f => f.endsWith('+server.ts'))
      .slice(0, LIMIT);

    console.log(`Found ${apiRoutes.length} API route files`);
    console.log('');

    // Extract metadata
    console.log('📋 Extracting metadata...');
    const apiMetadata = [];
    for (const file of apiRoutes) {
      const content = readFileSync(file, 'utf8');
      const metadata = extractApiMetadata(file, content);
      if (metadata) {
        apiMetadata.push(metadata);
      }
    }

    console.log(`✅ Extracted ${apiMetadata.length} routes`);
    console.log('');

    // Group by complexity
    const byComplexity = {};
    apiMetadata.forEach(api => {
      if (!byComplexity[api.complexity]) byComplexity[api.complexity] = 0;
      byComplexity[api.complexity]++;
    });

    console.log('📈 API Complexity Distribution:');
    Object.entries(byComplexity).forEach(([complexity, count]) => {
      console.log(`   • ${complexity}: ${count} endpoints`);
    });
    console.log('');

    if (DRY_RUN && !DO_EMBED) {
      console.log('✨ Dry run complete. Use --apply to persist, --embed to generate vectors.');
      if (VERBOSE && apiMetadata.length > 0) {
        console.log('');
        console.log('Sample API Routes:');
        apiMetadata.slice(0, 5).forEach(api => {
          console.log(`   ${api.route_path.padEnd(40)} [${api.handlers.join(',')}]`);
        });
      }
      return;
    }

    // Optionally embed summaries
    if (DO_EMBED && !DRY_RUN) {
      console.log('🔄 Generating embeddings via legal-ai-go-embedding:8097...');

      let embeddedCount = 0;
      for (const api of apiMetadata) {
        const summary = `${api.description} Methods: ${api.handlers.join(', ')}`;
        const embedding = await generateEmbedding(summary);

        if (embedding) {
          api.embedding = embedding;
          embeddedCount++;

          if (embeddedCount % 10 === 0) {
            console.log(`   Embedded ${embeddedCount}/${apiMetadata.length}...`);
          }
        }
      }

      console.log(`✅ Embedded ${embeddedCount}/${apiMetadata.length} routes`);
      console.log('');
    }

    // Build tool packets
    console.log('📦 Building tool packets...');

    const toolPackets = apiMetadata.map(api => ({
      tool_id: api.tool_id,
      tool_name: `API: ${api.route_path}`,
      summary: api.description,
      packet_type: 'api',
      tool_capabilities: api.handlers,
      tool_constraints: {
        auth_required: api.auth_required,
        rate_limit: '1000/hour',
        complexity: api.complexity
      },
      tool_examples: {
        route_path: api.route_path,
        methods: api.handlers,
        input_schema: api.input_schema,
        output_schema: api.output_schema
      },
      tool_tags: ['auto-indexed', api.complexity, ...api.handlers.map(h => h.toLowerCase())],
      embedding: api.embedding || null, // 384-dim vector if embedded
      indexed_at: new Date().toISOString()
    }));

    console.log(`✅ Built ${toolPackets.length} tool packets`);
    console.log('');

    if (APPLY && !DRY_RUN) {
      console.log('⏳ Persisting to tool_registry (TODO: wire Postgres)...');
      console.log(`   Would insert ${toolPackets.length} tool packets`);
      console.log('   Columns: tool_id, tool_name, summary, packet_type, tool_capabilities,');
      console.log('            tool_constraints, tool_examples, tool_tags, embedding');
      console.log('');
    }

    console.log('📌 Next Steps:');
    console.log('  1. Wire Postgres INSERT into tool_registry');
    console.log('  2. Mirror to Qdrant tool_registry collection (384-dim vectors)');
    console.log('  3. Sync to go-retrieval for search + ranking');
    console.log('  4. Use packet_type="api" filter in HMM tool selector');
    console.log('');

    console.log('✨ API indexing complete');

  } catch (error) {
    console.error('❌ API indexing failed:', error.message);
    if (VERBOSE) console.error(error.stack);
    process.exit(1);
  }
}

indexApis();
