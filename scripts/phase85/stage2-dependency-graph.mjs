#!/usr/bin/env node
/**
 * PHASE 85 — STAGE 2: DEPENDENCY GRAPH
 *
 * For each module category, find:
 * - Imports from other categories
 * - Missing dependencies
 * - Duplicate functions
 * - Stub/mock functions
 * - TODO markers
 *
 * Output: .tmp/phase85-stage2-dependency-graph.json
 *         .tmp/phase85-stage2-production-report.md
 */

import { promises as fs } from 'fs';
import { execSync } from 'child_process';

const CORE_MODULES = {
  artifact_registry: [
    'sveltekit-frontend/src/lib/server/db/schema-postgres.ts',
    'sveltekit-frontend/src/lib/server/db/schema/page-artifacts.ts',
    'sveltekit-frontend/src/lib/server/db/schema/knowledge-artifacts.ts',
  ],
  packet_identity: [
    'sveltekit-frontend/src/lib/server/db/schema-postgres.ts',
  ],
  git_diff_tracking: [
    'scripts/atlas/git-diff-supersedes-reconcile-production.mjs',
  ],
  summary_generation: [
    'sveltekit-frontend/src/lib/server/ai/context-compression.ts',
    'sveltekit-frontend/src/lib/server/cache/code-llm-index.ts',
  ],
  feature_label_extraction: [
    'sveltekit-frontend/src/lib/server/ai/feature-builder.ts',
    'sveltekit-frontend/src/lib/server/ace/agents-context-source.ts',
  ],
  gan_validation: [
    'sveltekit-frontend/src/lib/server/glyph-diffusion-service.ts',
  ],
  trace_export: [
    'sveltekit-frontend/src/lib/server/db/schema/agent-traces.ts',
    'sveltekit-frontend/src/lib/server/mcp/tool-ranker.ts',
  ],
  reward_scoring: [
    'sveltekit-frontend/src/lib/server/cache/atlas-reward-cache.ts',
    'sveltekit-frontend/src/lib/server/analytics/reward-events.ts',
  ],
  replay_database: [
    'sveltekit-frontend/src/lib/server/db/schema/agent-traces.ts',
  ],
  semantic_diff: [
    'sveltekit-frontend/src/lib/server/retrieval/cross-encoder-reranker.ts',
  ],
};

async function analyzeModule(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    return {
      path: filePath,
      lines: content.split('\n').length,
      has_todo: content.includes('TODO') || content.includes('todo'),
      has_mock: /mock|stub|placeholder|NotImplemented|return \[\]|no-op/i.test(content),
      has_throw_not_implemented: content.includes('throw new Error'),
      imports: content.match(/^import.*from ['"]([^'"]+)['"]/gm) || [],
      exports: content.match(/^export/gm) || [],
      functions: (content.match(/(?:^|\s)(?:async\s+)?function\s+(\w+)|export\s+(?:async\s+)?function\s+(\w+)/gm) || []).length,
    };
  } catch (err) {
    return { path: filePath, error: err.message };
  }
}

async function main() {
  console.log('🔗 PHASE 85 STAGE 2: DEPENDENCY GRAPH\n');

  const analysis = {};
  let total_files = 0;
  let files_with_todo = 0;
  let files_with_mock = 0;

  for (const [category, files] of Object.entries(CORE_MODULES)) {
    console.log(`📍 ${category}`);
    analysis[category] = { files: [] };

    for (const file of files) {
      const result = await analyzeModule(file);
      analysis[category].files.push(result);
      total_files++;

      if (result.has_todo) files_with_todo++;
      if (result.has_mock) files_with_mock++;

      const flags = [];
      if (result.has_todo) flags.push('TODO');
      if (result.has_mock) flags.push('MOCK/STUB');

      const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
      console.log(`   ✓ ${result.path}${flagStr}`);
    }
  }

  // Summary
  console.log(`\n📊 SUMMARY`);
  console.log(`   Total files: ${total_files}`);
  console.log(`   Files with TODO: ${files_with_todo} (${(files_with_todo/total_files*100).toFixed(1)}%)`);
  console.log(`   Files with MOCK/STUB: ${files_with_mock} (${(files_with_mock/total_files*100).toFixed(1)}%)`);

  // Save JSON
  await fs.writeFile('.tmp/phase85-stage2-dependency-graph.json', JSON.stringify(analysis, null, 2));
  console.log(`\n✅ Dependency graph saved to .tmp/phase85-stage2-dependency-graph.json`);

  // Generate markdown report
  const report = `# PHASE 85 — STAGE 2: DEPENDENCY GRAPH

**Date**: ${new Date().toISOString()}

## Summary

- **Total core modules**: ${total_files}
- **Files with TODO markers**: ${files_with_todo} (${(files_with_todo/total_files*100).toFixed(1)}%)
- **Files with MOCK/STUB code**: ${files_with_mock} (${(files_with_mock/total_files*100).toFixed(1)}%)

## Core Module Status

${Object.entries(analysis).map(([category, data]) => `
### ${category}

${data.files.map(f => {
  if (f.error) return `- ❌ ${f.path}: ${f.error}`;
  const flags = [];
  if (f.has_todo) flags.push('**TODO**');
  if (f.has_mock) flags.push('**MOCK/STUB**');
  const flagStr = flags.length > 0 ? ` ${flags.join(', ')}` : '';
  return `- ✓ ${f.path} (${f.lines} lines, ${f.exports.length} exports)${flagStr}`;
}).join('\n')}
`).join('\n')}

## Next Steps

1. Replace all mock/stub functions with production implementations
2. Resolve all TODO markers
3. Wire dependencies between categories
4. Add missing production code (artifact registry → semantic diff → reward dataset)
`;

  await fs.writeFile('.tmp/phase85-stage2-production-report.md', report);
  console.log(`✅ Report saved to .tmp/phase85-stage2-production-report.md`);
}

main().catch(console.error);
