#!/usr/bin/env node
/**
 * Multi-Pass Colon Chain Fixer
 * Runs iteratively until no more fixes are found
 * Handles deeply nested corruption like `a: b: c: d: e.:` chains
 *
 * Usage:
 *   node scripts/fix-colon-chains.mjs src              # Dry-run
 *   node scripts/fix-colon-chains.mjs src --apply      # Apply fixes
 *   node scripts/fix-colon-chains.mjs --top100         # Only top 100 files
 */

import fs from 'fs/promises';
import path from 'path';

const DRY_RUN = !process.argv.includes('--apply');
const TOP100_ONLY = process.argv.includes('--top100');
const args = process.argv.slice(2);
const TARGET_DIR = args.find(a => !a.startsWith('-')) || 'src';

console.log('🔄 Multi-Pass Colon Chain Fixer\n');
console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN (use --apply to fix)' : 'APPLYING FIXES'}`);
console.log(`   Target: ${TOP100_ONLY ? 'Top 100 files' : TARGET_DIR}\n`);

// Top 100 files from priority-files.json analysis
const TOP_100_FILES = [
  'src/lib/adapters/webasm-ai-adapter.ts',
  'src/lib/memory/nes-memory-architecture.ts',
  'src/lib/webgpu/tensor-acceleration.ts',
  'src/lib/server/services/citation-management.service.ts',
  'src/lib/server/ai/enhanced-orchestrator.ts',
  'src/lib/services/qlora-rl-langextract-integration.ts',
  'src/lib/server/ai/contextual-understanding-service.ts',
  'src/lib/server/webgpu-langchain-bridge.ts',
  'src/lib/services/generative-ui-cache-index.ts',
  'src/lib/services/enhanced-rag-pipeline.ts',
  'src/lib/server/services/citation.service.ts',
  'src/lib/services/llm-router.ts',
  'src/lib/services/error-analysis/DecisionEngine.ts',
  'src/lib/services/error-analysis/knowledge-base-learning.ts',
  'src/lib/services/rag-knowledge-pipeline.ts',
  'src/lib/services/error-analysis/ErrorClustering.ts',
  'src/lib/server/workers/legal-ai-worker.ts',
  'src/lib/database/migrations/migration-system.ts',
  'src/lib/machines/enhanced-legal-upload-analytics-machine.ts',
  'src/lib/services/webgpu-simd-accelerator.ts',
  'src/lib/workers/webgpu-cuda-bridge.ts',
  'src/lib/services/unified-document-processor.ts',
  'src/lib/services/kag-fix-store.ts',
  'src/lib/ui/matrix-compiler.ts',
  'src/lib/server/search/loki.ts',
  'src/lib/server/message-queue.ts',
  'src/lib/workers/rag-ingestion-worker.ts',
  'src/lib/services/error-analysis/GRPOPolicy.ts',
  'src/lib/services/knowledge-search/KnowledgeIndexer.ts',
  'src/lib/server/storage/minio-service.ts',
  'src/lib/services/cognitive-cache-integration.ts',
  'src/lib/services/ollama-service.ts',
  'src/lib/services/gpu-cache-rpc-client.ts',
  'src/lib/services/ace-web/ace-context-service.ts',
  'src/lib/services/ace-web/minio-service.ts',
  'src/lib/cache/glyph-shader-cache-bridge.ts',
  'src/lib/services/webgpu-inference-adapter.ts',
  'src/lib/server/db/schema-postgres.ts',
  'src/lib/services/enhanced-api-client.ts',
  'src/lib/server/ai/rag-pipeline-enhanced.ts',
  'src/lib/types/unified-types.ts',
  'src/lib/services/ollamaService.ts',
  'src/lib/utils/type-guards.ts',
  'src/lib/data/routes-config.ts',
  'src/lib/shims/bits-ui-enhanced.ts',
  'src/lib/command-center-manifest.ts',
  'src/lib/polyfills.ts',
  'src/lib/server/auth.ts',
].map(f => f.replace(/\//g, path.sep));

// Stats
const stats = {
  filesScanned: 0,
  filesWithFixes: 0,
  totalFixes: 0,
  passesRun: 0,
  byPattern: {}
};

// Corruption patterns - order matters! Apply simpler ones first
const PATTERNS = [
  // Pattern 1: Double value in object `value: value,` → `value,`
  {
    name: 'duplicate_value',
    regex: /:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*\1\s*,/g,
    replacement: ': $1,',
  },
  // Pattern 2: Triple chain `a: b: c:` → `a: b, c:`
  {
    name: 'triple_chain',
    regex: /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
    replacement: '$1: $2, $3:',
  },
  // Pattern 3: `key: this.xxx: key2:` → `key: this.xxx, key2:`
  {
    name: 'this_chain',
    regex: /:\s*this\.([a-zA-Z_][a-zA-Z0-9_.]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
    replacement: ': this.$1, $2:',
  },
  // Pattern 4: `key: options.xxx: key2:` → `key: options.xxx, key2:`
  {
    name: 'options_chain',
    regex: /:\s*options\.([a-zA-Z_][a-zA-Z0-9_.]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
    replacement: ': options.$1, $2:',
  },
  // Pattern 5: `key: data.xxx: key2:` → `key: data.xxx, key2:`
  {
    name: 'data_chain',
    regex: /:\s*data\.([a-zA-Z_][a-zA-Z0-9_.]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
    replacement: ': data.$1, $2:',
  },
  // Pattern 6: `key: result.xxx: key2:` → `key: result.xxx, key2:`
  {
    name: 'result_chain',
    regex: /:\s*result\.([a-zA-Z_][a-zA-Z0-9_.]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
    replacement: ': result.$1, $2:',
  },
  // Pattern 7: Number colon chain `0: 0.7:` → `0.7,`
  {
    name: 'number_chain',
    regex: /:\s*(\d+)\s*:\s*(\d+(?:\.\d+)?)\s*:/g,
    replacement: ': $2,',
  },
  // Pattern 8: `true: true,` → `true,`
  {
    name: 'bool_duplicate',
    regex: /:\s*(true|false)\s*:\s*(true|false)\s*,/g,
    replacement: ': $2,',
  },
  // Pattern 9: Function parameter corruption `(a: type: b: type)`
  {
    name: 'param_corruption',
    regex: /\(([a-zA-Z_]\w*)\s*:\s*([a-zA-Z_][\w<>|&\s\[\]]*?)\s*:\s*([a-zA-Z_]\w*)\s*:\s*([a-zA-Z_][\w<>|&\s\[\]]*?)\)/g,
    replacement: '($1: $2, $3: $4)',
  },
  // Pattern 10: Trailing colon before comma `value:,` → `value,`
  {
    name: 'trailing_colon',
    regex: /([a-zA-Z_][a-zA-Z0-9_.]*)\s*:\s*,/g,
    replacement: '$1,',
  },
  // Pattern 11: `null: null,` → `null,`
  {
    name: 'null_duplicate',
    regex: /:\s*null\s*:\s*null\s*,/g,
    replacement: ': null,',
  },
  // Pattern 12: String literal corruption
  {
    name: 'string_chain',
    regex: /:\s*'([^']+)'\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
    replacement: ": '$1', $2:",
  },
  // Pattern 13: property.property chain `x.y: x.y.z` → `x.y.z`
  {
    name: 'property_chain',
    regex: /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*\1\s*:\s*\1\./g,
    replacement: '$1: $1.',
  },
  // Pattern 14: `processingTime: 0: confidence: 0` → `processingTime: 0, confidence: 0`
  {
    name: 'metric_chain',
    regex: /(processingTime|confidence|tokensGenerated)\s*:\s*(\d+(?:\.\d+)?)\s*:\s*(processingTime|confidence|tokensGenerated)\s*:/g,
    replacement: '$1: $2, $3:',
  },
  // Pattern 15: Complex object spread corruption `...route: errorState`
  {
    name: 'spread_corruption',
    regex: /\.\.\.([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,/g,
    replacement: '...$1, $2,',
  },
  // Pattern 16: SQL Param Array Corruption `[userId: request.caseId]` -> `[userId, request.caseId]`
  {
    name: 'array_colon_to_comma',
    regex: /([a-zA-Z0-9_]+)\s*:\s*([a-zA-Z0-9_.]+\s*(?:\|\||&&)\s*[a-zA-Z0-9_.]+)/g,
    replacement: '$1, $2',
  },
  {
    name: 'simple_colon_to_comma_in_array',
    regex: /([a-zA-Z0-9_]+)\s*:\s*request\.([a-zA-Z0-9_]+)/g,
    replacement: '$1, request.$2',
  },
  // Pattern 17: Bad function arg separator `(arg: type), Name:` -> `(arg: type, Name:`
  {
    name: 'bad_arg_separator',
    regex: /\)\s*,\s*([a-zA-Z_]\w*)\s*:/g,
    replacement: ', $1:',
  },
  // Pattern 18: Double comma
  {
    name: 'double_comma',
    regex: /,\s*,/g,
    replacement: ',',
  },
  // Pattern 19: Return type separator `), string: Promise<` -> `): Promise<`
  {
    name: 'return_type_corruption',
    regex: /\)\s*,\s*[a-zA-Z_0-9]+\s*:\s*Promise</g,
    replacement: '): Promise<',
  }
];

async function applyPatterns(content) {
  let newContent = content;
  let totalFixes = 0;
  let fixesThisPass = 0;

  do {
    fixesThisPass = 0;
    stats.passesRun++;

    for (const pattern of PATTERNS) {
      const matches = newContent.match(pattern.regex);
      if (matches) {
        const count = matches.length;
        fixesThisPass += count;
        totalFixes += count;
        stats.byPattern[pattern.name] = (stats.byPattern[pattern.name] || 0) + count;

        if (!DRY_RUN) {
          newContent = newContent.replace(pattern.regex, pattern.replacement);
        }
      }
    }

  } while (fixesThisPass > 0 && !DRY_RUN && stats.passesRun < 10); // Max 10 passes

  return { content: newContent, fixes: totalFixes };
}

async function processFile(filePath) {
  stats.filesScanned++;

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { content: newContent, fixes } = await applyPatterns(content);

    if (fixes === 0) return;

    stats.filesWithFixes++;
    stats.totalFixes += fixes;

    const relativePath = path.relative(process.cwd(), filePath);
    console.log(`✓ ${relativePath}: ${fixes} fixes`);

    if (!DRY_RUN && newContent !== content) {
      await fs.writeFile(filePath, newContent, 'utf-8');
    }

  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`❌ Error: ${error.message}`);
    }
  }
}

async function findTsFiles(dir) {
  const files = [];

  async function walk(currentDir) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (!['node_modules', '.svelte-kit', 'dist', '.git', 'build'].includes(entry.name)) {
            await walk(fullPath);
          }
        } else if (entry.isFile()) {
          if ((entry.name.endsWith('.ts') || entry.name.endsWith('.svelte')) &&
              !entry.name.includes('.bak') && !entry.name.includes('.backup')) {
            files.push(fullPath);
          }
        }
      }
    } catch (err) {
      // Skip inaccessible directories
    }
  }

  await walk(dir);
  return files;
}

async function main() {
  let filesToProcess;

  if (TOP100_ONLY) {
    filesToProcess = TOP_100_FILES.map(f => path.resolve(process.cwd(), f));
    console.log(`📁 Processing top ${filesToProcess.length} priority files\n`);
  } else {
    const targetPath = path.resolve(process.cwd(), TARGET_DIR);
    filesToProcess = await findTsFiles(targetPath);
    console.log(`📁 Found ${filesToProcess.length} TypeScript/Svelte files\n`);
  }

  for (const file of filesToProcess) {
    await processFile(file);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary');
  console.log('='.repeat(60));
  console.log(`   Files scanned:      ${stats.filesScanned}`);
  console.log(`   Files with fixes:   ${stats.filesWithFixes}`);
  console.log(`   Total fixes:        ${stats.totalFixes}`);
  console.log(`   Passes run:         ${stats.passesRun}`);
  console.log('');
  console.log('   Fixes by pattern:');
  Object.entries(stats.byPattern)
    .sort((a, b) => b[1] - a[1])
    .forEach(([pattern, count]) => {
      console.log(`     ${pattern}: ${count}`);
    });
  console.log('');

  if (DRY_RUN) {
    console.log('💡 This was a DRY-RUN. To apply fixes, run:');
    console.log(`   node scripts/fix-colon-chains.mjs ${TOP100_ONLY ? '--top100' : TARGET_DIR} --apply`);
  } else {
    console.log('✅ All fixes applied!');
  }

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'applied',
    target: TOP100_ONLY ? 'top100' : TARGET_DIR,
    stats
  };

  await fs.writeFile('logs/colon-chains-report.json', JSON.stringify(report, null, 2));
  console.log('\n📝 Report saved to: logs/colon-chains-report.json');
}

main().catch(console.error);
