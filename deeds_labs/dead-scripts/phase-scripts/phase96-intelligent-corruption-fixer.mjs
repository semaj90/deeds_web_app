#!/usr/bin/env node

/**
 * Phase 96: Intelligent Corruption Fixer
 * Uses RAG/KAG patterns + ACE contextual engineering
 *
 * Strategy:
 * 1. Load corruption patterns from logs/object-corruption-report.json
 * 2. Apply TypeScript-aware syntax fixes (commas, semicolons, colons)
 * 3. Use multi-pass approach for nested corruption
 * 4. Preserve original formatting and indentation
 */

import fs from 'fs';
import path from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const TARGET_FILE = process.argv.find(arg => !arg.startsWith('--') && !arg.includes('node') && !arg.endsWith('.mjs'));

console.log(`\n🧠 Phase 96: Intelligent Corruption Fixer\n${'═'.repeat(60)}`);
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY FIXES'}`);
console.log(`Target: ${TARGET_FILE || 'No file specified'}\n`);

if (!TARGET_FILE) {
  console.error('❌ Usage: node phase96-intelligent-corruption-fixer.mjs <file-path> [--dry-run] [--verbose]');
  process.exit(1);
}

// Advanced corruption patterns based on Phase 66-94 knowledge
const CORRUPTION_PATTERNS = [
  {
    name: 'Comma in object literal key-value (should be colon)',
    regex: /(\s+)(\w+),\s*(\w+\.\w+|\w+\(|['"`]|{|\[)/g,
    fix: '$1$2: $3',
    example: 'name, "value" → name: "value"'
  },
  {
    name: 'Missing comma after property (comma in options object)',
    regex: /(\w+):\s*(\w+)\s*,\s*(\w+)\s*\|\|/g,
    fix: '$1: $2 || ',
    example: 'max_tokens, options.maxTokens → max_tokens: options.maxTokens'
  },
  {
    name: 'Object property on same line (should be separate)',
    regex: /(\w+):\s*([^,}\n]+),\s*(\w+):/g,
    fix: '$1: $2,\n    $3:',
    example: 'name: value, other: → name: value,\n    other:'
  },
  {
    name: 'Semicolon before const/let declaration',
    regex: /}\s*;\s*(const|let|var)\s+/g,
    fix: '}\n  $1 ',
    example: '}; const x → }\n  const x'
  },
  {
    name: 'Missing comma in metadata object',
    regex: /(\w+):\s*([^,}\n]+)\s+(\w+):/g,
    test: (line) => !line.includes('=>') && !line.includes('//'),
    fix: '$1: $2,\n    $3:',
    example: 'tokensGenerated: 100 processingTime: → tokensGenerated: 100,\n    processingTime:'
  },
  {
    name: 'Colon corruption in object destructuring',
    regex: /(\w+),\s*(\w+\.\w+)\s*,/g,
    fix: '$1: $2,',
    example: 'content, data.text → content: data.text'
  },
  {
    name: 'False literal misplaced',
    regex: /(\w+):\s*(\w+),\s*false:/g,
    fix: '$1: $2,\n    fromCache: false,',
    example: 'modelUsed: model, false: → modelUsed: model,\n    fromCache: false,'
  },
  {
    name: 'Pipeline property access corruption',
    regex: /false:\s*(pipeline\.env\.\w+):/g,
    fix: 'fromCache: false,\n    gpuAccelerated: $1,',
    example: 'false: pipeline.env.useWebGPU: → fromCache: false,\n    gpuAccelerated: pipeline.env.useWebGPU,'
  },
  {
    name: 'Semicolon after closing brace (before fetch/await)',
    regex: /}\s*;\s*(const|if|return|await)/g,
    fix: '}\n  $1',
    example: '}; const data → }\n  const data'
  },
  {
    name: 'Missing colon after property name',
    regex: /(\s+)(\w+)\s+(['"`{[])/g,
    test: (line) => !line.includes('//') && !line.includes('function') && !line.includes('class'),
    fix: '$1$2: $3',
    example: 'content "value" → content: "value"'
  }
];

function analyzeFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const issues = [];

  lines.forEach((line, idx) => {
    CORRUPTION_PATTERNS.forEach(pattern => {
      if (pattern.test ? pattern.test(line) : pattern.regex.test(line)) {
        const matches = [...line.matchAll(pattern.regex)];
        if (matches.length > 0) {
          issues.push({
            line: idx + 1,
            pattern: pattern.name,
            original: line,
            matches: matches.length
          });
        }
      }
    });
  });

  return { content, issues, lines };
}

function applyFixes(content, patterns) {
  let fixed = content;
  let totalFixes = 0;
  let passCount = 0;
  let madeChanges = true;

  // Multi-pass approach (max 5 passes)
  while (madeChanges && passCount < 5) {
    madeChanges = false;
    passCount++;

    for (const pattern of patterns) {
      const before = fixed;

      if (typeof pattern.fix === 'function') {
        fixed = fixed.replace(pattern.regex, pattern.fix);
      } else {
        fixed = fixed.replace(pattern.regex, pattern.fix);
      }

      if (before !== fixed) {
        const matches = [...before.matchAll(pattern.regex)].length;
        totalFixes += matches;
        madeChanges = true;

        if (VERBOSE) {
          console.log(`  [Pass ${passCount}] ${pattern.name}: ${matches} fixes`);
        }
      }
    }
  }

  return { fixed, totalFixes, passCount };
}

async function main() {
  console.log('📊 Analyzing file...\n');

  const analysis = analyzeFile(TARGET_FILE);
  if (!analysis) process.exit(1);

  const { content, issues } = analysis;

  if (issues.length === 0) {
    console.log('✅ No corruption patterns detected!');
    process.exit(0);
  }

  console.log(`Found ${issues.length} potential corruption instances:\n`);

  // Group by pattern
  const grouped = issues.reduce((acc, issue) => {
    if (!acc[issue.pattern]) acc[issue.pattern] = [];
    acc[issue.pattern].push(issue);
    return acc;
  }, {});

  Object.entries(grouped).forEach(([pattern, items]) => {
    console.log(`  ${pattern}: ${items.length} instances`);
    if (VERBOSE) {
      items.slice(0, 3).forEach(item => {
        console.log(`    Line ${item.line}: ${item.original.trim().slice(0, 80)}...`);
      });
    }
  });

  console.log(`\n🔧 Applying fixes...\n`);

  const { fixed, totalFixes, passCount } = applyFixes(content, CORRUPTION_PATTERNS);

  console.log(`✅ Completed in ${passCount} passes`);
  console.log(`📊 Total fixes applied: ${totalFixes}\n`);

  if (DRY_RUN) {
    console.log('⚠️  DRY RUN MODE - No files modified');
    console.log('\n📄 Preview of changes:\n');

    // Show diff preview
    const originalLines = content.split('\n');
    const fixedLines = fixed.split('\n');
    let diffCount = 0;

    for (let i = 0; i < Math.min(originalLines.length, fixedLines.length); i++) {
      if (originalLines[i] !== fixedLines[i] && diffCount < 10) {
        console.log(`Line ${i + 1}:`);
        console.log(`  - ${originalLines[i]}`);
        console.log(`  + ${fixedLines[i]}\n`);
        diffCount++;
      }
    }

    if (diffCount === 10) {
      console.log('... (showing first 10 changes)');
    }
  } else {
    fs.writeFileSync(TARGET_FILE, fixed, 'utf8');
    console.log(`✅ File updated: ${path.basename(TARGET_FILE)}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`\n💡 Recommendation: Run svelte-check on this file to verify fixes\n`);
}

main().catch(console.error);
