#!/usr/bin/env node
/**
 * Phase 10: Regenerate tool embeddings with enriched context
 *
 * Enriched source: ${tool.name} ${tool.description} Input schema: ${JSON.stringify(tool.input_schema)}
 *                  Output schema: ${JSON.stringify(tool.output_schema)} Examples: ${tool.examples.join('; ')}
 *                  Domains: ${tool.domains.join(', ')} Limitations: ${tool.limitations || 'none'}
 *
 * Purpose: Build 384-dimensional embeddings for schema-aware tool discovery
 * Coverage Target: All 6 canonical tools + any new tools added
 * Index: Qdrant 'tool_registry' named vector 'content'
 */

import { Command } from 'commander';
import { pool } from '../lib/db.mjs';

const program = new Command();

program
  .option('--dry-run', 'Show what would be changed without applying')
  .option('--apply', 'Apply changes to the database')
  .option('--limit <n>', 'Limit number of tools to process', '1000')
  .option('--verbose', 'Show detailed progress');

program.parse(process.argv);
const options = program.opts();

const DRY_RUN = options.dryRun;
const VERBOSE = options.verbose;
const LIMIT = parseInt(options.limit, 10);

async function regenerateToolEmbeddings() {
  console.log('🔄 Phase 10: Regenerate tool embeddings with enriched context');
  console.log('Target: 384-dimensional embeddings for schema-aware tool discovery');
  console.log(DRY_RUN ? '(DRY RUN - no changes will be applied)' : '(APPLY mode)');
  console.log('');

  try {
    // Fetch 6 canonical tools + others
    const toolsResult = await pool.query(`
      SELECT
        tool_id,
        tool_name,
        summary,
        tool_capabilities,
        tool_constraints,
        tool_examples,
        tool_tags
      FROM tool_registry
      LIMIT $1;
    `, [LIMIT]);

    const tools = toolsResult.rows;
    console.log(`📊 Found ${tools.length} tools to regenerate embeddings for`);
    console.log('');

    // Build enriched embedding context for each tool
    const enrichedContexts = tools.map(tool => {
      const contexts = [
        tool.tool_name,
        tool.summary,
        tool.tool_capabilities ? JSON.stringify(tool.tool_capabilities) : '',
        tool.tool_constraints ? JSON.stringify(tool.tool_constraints) : '',
        tool.tool_examples ? JSON.stringify(tool.tool_examples) : '',
        (tool.tool_tags || []).join(', ')
      ];

      return {
        tool_id: tool.tool_id,
        context: contexts.filter(c => c).join(' ')
      };
    });

    console.log('📈 Enrichment Summary:');
    const avgContextLen = enrichedContexts.reduce((sum, t) => sum + t.context.length, 0) / enrichedContexts.length;
    console.log(`   • Average context length: ${Math.round(avgContextLen)} chars`);
    console.log(`   • Max tool name length: ${Math.max(...tools.map(t => t.tool_name.length))}`);
    console.log('');

    if (DRY_RUN) {
      console.log('✨ Dry run complete. Use --apply to regenerate embeddings.');
      if (VERBOSE && enrichedContexts.length > 0) {
        console.log('');
        console.log('Sample Tool Contexts (first 500 chars):');
        enrichedContexts.slice(0, 3).forEach(t => {
          console.log(`   Tool: ${t.tool_id}`);
          console.log(`   Context: ${t.context.substring(0, 500)}...`);
          console.log('');
        });
      }
      process.exit(0);
    }

    console.log('⏳ TODO: Wire embedding generation to embeddinggemma:latest service');
    console.log('⏳ TODO: Update Qdrant tool_registry collection with 384-dim vectors');
    console.log('⏳ TODO: Verify HNSW index recomputed');
    console.log('');
    console.log('✨ Phase 10 tool embeddings regeneration prepared (integration pending)');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error regenerating embeddings:', error);
    process.exit(1);
  }
}

regenerateToolEmbeddings();
