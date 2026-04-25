#!/usr/bin/env node
/**
 * Object Literal Corruption Fixer
 * Fixes patterns like `key: value: key2: value2` → `key: value, key2: value2`
 *
 * Usage:
 *   node scripts/fix-object-corruption.mjs src             # Dry-run
 *   node scripts/fix-object-corruption.mjs src --apply     # Apply fixes
 */

import fs from 'fs/promises';
import path from 'path';

const DRY_RUN = !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const TARGET_DIR = process.argv[2] || 'src';

console.log('🔧 Object Literal Corruption Fixer\n');
console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN (use --apply to fix)' : 'APPLYING FIXES'}`);
console.log(`   Target: ${TARGET_DIR}\n`);

// Stats
const stats = {
  filesScanned: 0,
  filesWithIssues: 0,
  totalFixes: 0,
  byPattern: {}
};

// Corruption patterns to fix
const PATTERNS = [
  {
    name: 'function_param_colon_to_comma',
    // Matches: (param: type: param2: type2) or function(a: string: b: number)
    regex: /\(([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_<>|\s\[\]]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_<>|\s\[\]]*)\s*\)/g,
    replacement: '($1: $2, $3: $4)',
    description: 'function(a: string: b: number) → function(a: string, b: number)'
  },
  {
    name: 'object_value_colon_to_comma_simple',
    // Matches: key: value: key2: value in objects (simple identifiers)
    // Be careful not to match type annotations
    regex: /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
    replacement: '$1: $2, $3:',
    description: 'key: value: key2: → key: value, key2:'
  },
  {
    name: 'double_colon_in_object',
    // Matches: `value:,` or `value:;` or `!!value:,`
    regex: /(\w+(?:\.\w+)*)\s*:\s*,/g,
    replacement: '$1,',
    description: 'value:, → value,'
  },
  {
    name: 'true_false_colon',
    // Matches: `true: true,` or `false: false,`
    regex: /:\s*(true|false)\s*:\s*(true|false)\s*,/g,
    replacement: ': $1,',
    description: ': true: true, → : true,'
  },
  {
    name: 'number_colon',
    // Matches: `0: 0.7` or `512: 512`
    regex: /:\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*,/g,
    replacement: ': $1,',
    description: ': 0: 0.7, → : 0.7,'
  },
  {
    name: 'null_colon',
    // Matches: `null: null,`
    regex: /:\s*null\s*:\s*null\s*,/g,
    replacement: ': null,',
    description: ': null: null, → : null,'
  },
  {
    name: 'pipeline_property_chain',
    // Matches: `pipeline: pipeline.env.xxx`
    regex: /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*\1\s*:\s*\1\./g,
    replacement: '$1: $1.',
    description: 'pipeline: pipeline: pipeline.env → pipeline: pipeline.env'
  },
  {
    name: 'options_colon_chain',
    // Matches: `options: options.xxx`
    regex: /:\s*options\s*:\s*options\./g,
    replacement: ': options.',
    description: ': options: options. → : options.'
  },
  {
    name: 'this_colon_chain',
    // Matches: `this: this.xxx`
    regex: /:\s*this\s*:\s*this\./g,
    replacement: ': this.',
    description: ': this: this. → : this.'
  },
  {
    name: 'result_colon_chain',
    // Matches: `result: result.xxx`
    regex: /:\s*result\s*:\s*result\./g,
    replacement: ': result.',
    description: ': result: result. → : result.'
  },
  {
    name: 'data_colon_chain',
    // Matches: `data: data.xxx`
    regex: /:\s*data\s*:\s*data\./g,
    replacement: ': data.',
    description: ': data: data. → : data.'
  },
  {
    name: 'processingTime_colon',
    // Matches: `processingTime: processingTime: confidence`
    regex: /processingTime\s*:\s*processingTime\s*:\s*confidence/g,
    replacement: 'processingTime, confidence',
    description: 'processingTime: processingTime: confidence → processingTime, confidence'
  }
];

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
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.svelte'))) {
          // Skip backup files
          if (!entry.name.includes('.bak') && !entry.name.includes('.backup')) {
            files.push(fullPath);
          }
        }
      }
    } catch (err) {
      console.warn(`Cannot access ${currentDir}: ${err.message}`);
    }
  }

  await walk(dir);
  return files;
}

async function analyzeFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const fixes = [];
  let newContent = content;

  for (const pattern of PATTERNS) {
    const matches = content.match(pattern.regex);
    if (matches) {
      for (const match of matches) {
        fixes.push({
          pattern: pattern.name,
          original: match.substring(0, 60),
          description: pattern.description
        });
        stats.byPattern[pattern.name] = (stats.byPattern[pattern.name] || 0) + 1;
      }

      if (!DRY_RUN) {
        newContent = newContent.replace(pattern.regex, pattern.replacement);
      }
    }
  }

  return { originalContent: content, newContent, fixes };
}

async function processFile(filePath) {
  stats.filesScanned++;

  try {
    const { originalContent, newContent, fixes } = await analyzeFile(filePath);

    if (fixes.length === 0) return;

    stats.filesWithIssues++;
    stats.totalFixes += fixes.length;

    const relativePath = path.relative(process.cwd(), filePath);

    if (VERBOSE || DRY_RUN) {
      console.log(`\n📄 ${relativePath} (${fixes.length} fixes)`);
      for (const fix of fixes.slice(0, 5)) { // Show first 5
        console.log(`   [${fix.pattern}] ${fix.original}...`);
      }
      if (fixes.length > 5) {
        console.log(`   ... and ${fixes.length - 5} more`);
      }
    } else {
      console.log(`✓ ${relativePath}: ${fixes.length} fixes`);
    }

    if (!DRY_RUN && newContent !== originalContent) {
      await fs.writeFile(filePath, newContent, 'utf-8');
    }

  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

async function main() {
  const targetPath = path.resolve(process.cwd(), TARGET_DIR);
  const files = await findTsFiles(targetPath);

  console.log(`📁 Found ${files.length} TypeScript/Svelte files\n`);

  for (const file of files) {
    await processFile(file);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary');
  console.log('='.repeat(60));
  console.log(`   Files scanned:      ${stats.filesScanned}`);
  console.log(`   Files with issues:  ${stats.filesWithIssues}`);
  console.log(`   Total fixes:        ${stats.totalFixes}`);
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
    console.log(`   node scripts/fix-object-corruption.mjs ${TARGET_DIR} --apply`);
  } else {
    console.log('✅ All fixes applied!');
  }

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'applied',
    stats
  };

  await fs.writeFile('logs/object-corruption-report.json', JSON.stringify(report, null, 2));
  console.log('\n📝 Report saved to: logs/object-corruption-report.json');
}

main().catch(console.error);
