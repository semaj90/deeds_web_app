#!/usr/bin/env node
/**
 * Phase 10: API Indexing Persistence to tool_registry
 *
 * Wires extracted tool packets into canonical Postgres table.
 * Assumes tool packets already built by phase10-api-indexing.mjs
 *
 * Flow:
 * 1. Read API routes + metadata via phase10-api-indexing
 * 2. INSERT OR UPDATE tool_registry with packet_type='api'
 * 3. Optionally mirror to Qdrant tool_registry collection
 * 4. Return counts for verification
 */

import { Command } from 'commander';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import pg from 'pg';
import fetch from 'node-fetch';

const program = new Command();

program
  .option('--dry-run', 'Show SQL without executing')
  .option('--apply', 'Apply persistence to tool_registry')
  .option('--mirror-qdrant', 'Also mirror to Qdrant (optional)')
  .option('--limit <n>', 'Limit number of API routes to process', '100')
  .option('--verbose', 'Show detailed progress');

program.parse(process.argv);
const options = program.opts();

const DRY_RUN = options.dryRun;
const VERBOSE = options.verbose;
const APPLY = options.apply;
const MIRROR_QDRANT = options.mirrorQdrant;
const LIMIT = parseInt(options.limit, 10);

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_API = 'http://localhost:6333';
const QDRANT_COLLECTION = 'tool_registry'; // Collection for tool metadata

// Reuse extraction logic from phase10-api-indexing.mjs
function extractApiMetadata(filePath, content) {
  try {
    const routePath = filePath
      .replace(/^.*\/src\/routes/, '')
      .replace(/\/\+server\.ts$/, '');

    const handlers = new Set();
    const handlerRegex = /export\s+(?:const\s+([A-Z]+)\s*(?::[^=]+)?=|async\s+function\s+([A-Z]+)\s*\()/g;
    let match;
    while ((match = handlerRegex.exec(content)) !== null) {
      handlers.add(match[1] || match[2]);
    }

    const inputSchema = extractZodSchema(content, 'input');
    const outputSchema = extractZodSchema(content, 'output|return');
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

function extractZodSchema(content, schemaName) {
  const regex = new RegExp(`const\\s+${schemaName}\\s*=\\s*(z\\.\\w+\\([^)]*\\)|\\{[^}]*\\})`, 's');
  const match = content.match(regex);
  if (match) {
    return { type: 'zod', expression: match[1].substring(0, 200) };
  }
  return { type: 'unknown', expression: null };
}

function extractDescription(content) {
  const docMatch = content.match(/\/\*\*\n\s*\*\s*([^\n]+)/);
  if (docMatch) return docMatch[1];
  const inlineMatch = content.match(/\/\/\s*(.+?)\n/);
  if (inlineMatch) return inlineMatch[1];
  return 'Auto-discovered API endpoint';
}

function estimateComplexity(content) {
  const hasDb = content.includes('pool.query') || content.includes('db.');
  const hasGpu = content.includes('gpu') || content.includes('tensor') || content.includes('embedding');
  const hasGraph = content.includes('neo4j') || content.includes('cypher');
  const hasAsync = content.includes('await');

  if (hasGpu || hasGraph) return 'advanced';
  if (hasDb || hasAsync) return 'medium';
  return 'simple';
}

async function persistApis() {
  console.log('💾 Phase 10: API Indexing Persistence');
  console.log(`Database: ${DATABASE_URL.replace(/:[^@]+@/, ':***@')}`);
  console.log(DRY_RUN ? '(DRY RUN - no writes)' : '(APPLY mode)');
  console.log('');

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

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

    // Prepare INSERT statements
    console.log('📋 Preparing tool_registry inserts...');
    let insertCount = 0;

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would insert ${apiMetadata.length} tool packets into tool_registry:`);
      apiMetadata.slice(0, 3).forEach(api => {
        console.log(`   • ${api.tool_id} (${api.route_path}) [${api.handlers.join(',')}]`);
      });
      if (apiMetadata.length > 3) {
        console.log(`   ... and ${apiMetadata.length - 3} more`);
      }
      console.log('');
      await pool.end();
      return;
    }

    // Execute persistence
    console.log('💾 Persisting to tool_registry...');
    for (const api of apiMetadata) {
      try {
        const result = await pool.query(
          `INSERT INTO tool_registry (
             tool_id, tool_name, summary, packet_type,
             tool_capabilities, tool_constraints, tool_examples, tool_tags,
             embedding, indexed_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
           ON CONFLICT (tool_id) DO UPDATE SET
             tool_name = EXCLUDED.tool_name,
             summary = EXCLUDED.summary,
             tool_capabilities = EXCLUDED.tool_capabilities,
             tool_constraints = EXCLUDED.tool_constraints,
             tool_examples = EXCLUDED.tool_examples,
             tool_tags = EXCLUDED.tool_tags,
             updated_at = NOW()
           RETURNING tool_id`,
          [
            api.tool_id,
            `API: ${api.route_path}`,
            api.description,
            'api', // packet_type
            JSON.stringify(api.handlers), // tool_capabilities
            JSON.stringify({
              auth_required: api.auth_required,
              rate_limit: '1000/hour',
              complexity: api.complexity
            }), // tool_constraints
            JSON.stringify({
              route_path: api.route_path,
              methods: api.handlers,
              input_schema: api.input_schema,
              output_schema: api.output_schema
            }), // tool_examples
            JSON.stringify(['auto-indexed', api.complexity, ...api.handlers.map(h => h.toLowerCase())]), // tool_tags
            null // embedding (would be populated by separate phase10-api-indexing.mjs --embed)
          ]
        );

        if (result.rows[0]) {
          insertCount++;
          if (insertCount % 10 === 0) {
            console.log(`   Persisted ${insertCount}/${apiMetadata.length}...`);
          }
        }
      } catch (error) {
        console.error(`   ⚠️  Failed to insert ${api.tool_id}:`, error.message);
      }
    }

    console.log(`✅ Persisted ${insertCount}/${apiMetadata.length} tool packets`);
    console.log('');

    // Optionally mirror to Qdrant
    if (MIRROR_QDRANT && insertCount > 0) {
      console.log('🪞 Mirroring to Qdrant tool_registry collection...');
      try {
        // Fetch inserted packets from Postgres
        const packets = await pool.query(
          `SELECT tool_id, tool_name, summary, tool_capabilities, tool_tags
           FROM tool_registry
           WHERE packet_type = 'api' AND indexed_at > NOW() - INTERVAL '1 minute'
           LIMIT $1`,
          [insertCount]
        );

        for (const packet of packets.rows) {
          // Create Qdrant point with tool metadata as payload
          const qdrantPoint = {
            id: parseInt(packet.tool_id.replace(/\D/g, '')) || Math.floor(Math.random() * 1e9),
            vector: new Array(384).fill(0), // Placeholder; would be populated by embedding service
            payload: {
              tool_id: packet.tool_id,
              tool_name: packet.tool_name,
              summary: packet.summary,
              capabilities: packet.tool_capabilities,
              tags: packet.tool_tags,
              packet_type: 'api'
            }
          };

          try {
            await fetch(`${QDRANT_API}/collections/${QDRANT_COLLECTION}/points`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                points: [qdrantPoint]
              }),
              timeout: 5000
            });
          } catch (error) {
            console.error(`   ⚠️  Failed to mirror ${packet.tool_id} to Qdrant:`, error.message);
          }
        }
        console.log(`✅ Mirrored ${packets.rows.length} points to Qdrant`);
      } catch (error) {
        console.error('❌ Qdrant mirror failed:', error.message);
      }
      console.log('');
    }

    console.log('📌 Next Steps:');
    console.log('  1. Run: npm run atlas:phase10:stats:refresh');
    console.log('  2. Verify tool_registry rows: SELECT COUNT(*), COUNT(CASE WHEN packet_type=\'api\' THEN 1 END) FROM tool_registry;');
    console.log('  3. Test search via go-retrieval: /api/retrieval/search?q=your-query');
    console.log('');

    console.log('✨ API persistence complete');

  } finally {
    await pool.end();
  }
}

persistApis().catch(error => {
  console.error('❌ Persistence failed:', error.message);
  process.exit(1);
});
