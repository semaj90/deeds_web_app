/**
 * Phase 42 - AST Validator
 * Validates Svelte component syntax using Svelte compiler before saving fixes
 * Ensures zero regressions in Phase 42 structural repair
 */

import { parse } from 'svelte/compiler';
import fs from 'fs/promises';
import { glob } from 'glob';

interface ValidationResult {
  file: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface RepairStats {
  scanned: number;
  validated: number;
  fixed: number;
  failed: number;
  errors: ValidationResult[];
}

const stats: RepairStats = {
  scanned: 0,
  validated: 0,
  fixed: 0,
  failed: 0,
  errors: []
};

/**
 * Validate Svelte component using compiler AST parser
 */
async function validateSvelteComponent(filePath: string, content: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    file: filePath,
    valid: true,
    errors: [],
    warnings: []
  };

  try {
    // Parse Svelte component
    const ast = parse(content, {
      filename: filePath,
      modern: true // Svelte 5 mode
    });

    // Check for parser errors
    if (ast.instance?.content?.errors?.length > 0) {
      result.valid = false;
      result.errors = ast.instance.content.errors.map((e: any) => e.message);
    }

    // Check for template errors
    if (ast.html?.children) {
      // Validate that we can traverse the AST without errors
      const traverse = (node: any) => {
        if (node.type === 'Error') {
          result.valid = false;
          result.errors.push(node.message || 'Unknown AST error');
        }
        if (node.children) {
          node.children.forEach(traverse);
        }
      };
      traverse(ast.html);
    }

  } catch (error: any) {
    result.valid = false;
    result.errors.push(error.message || String(error));
  }

  return result;
}

/**
 * Apply structural fixes to Svelte component
 */
function applyStructuralFixes(content: string): { fixed: string; changes: number } {
  let fixed = content;
  let changes = 0;

  // Fix 1: Remove commas from tag names (<Button.Root, → <Button.Root)
  const malformedTagPattern = /<([A-Za-z0-9_.]+),/g;
  const tagMatches = fixed.match(malformedTagPattern);
  if (tagMatches) {
    fixed = fixed.replace(malformedTagPattern, '<$1');
    changes += tagMatches.length;
  }

  // Fix 2: Add newlines after </script> and </style>
  if (fixed.includes('</script><')) {
    fixed = fixed.replace(/<\/script></g, '</script>\n<');
    changes++;
  }
  if (fixed.includes('</style><')) {
    fixed = fixed.replace(/<\/style></g, '</style>\n<');
    changes++;
  }

  // Fix 3: Add newlines before blocks
  if (fixed.match(/>(\s*){#/)) {
    fixed = fixed.replace(/>(\s*){#/g, '>\n$1{#');
    changes++;
  }

  // Fix 4: Add newlines after block closings
  if (fixed.match(/}\s*<\//)) {
    fixed = fixed.replace(/}\s*<\//g, '}\n</');
    changes++;
  }

  // Fix 5: Remove invalid commas in attributes
  const invalidAttrPattern = /\s+,\s*(\w+=)/g;
  const attrMatches = fixed.match(invalidAttrPattern);
  if (attrMatches) {
    fixed = fixed.replace(invalidAttrPattern, ' $1');
    changes += attrMatches.length;
  }

  return { fixed, changes };
}

/**
 * Process a single Svelte file
 */
async function processSvelteFile(filePath: string): Promise<boolean> {
  try {
    stats.scanned++;
    
    // Read original content
    const originalContent = await fs.readFile(filePath, 'utf-8');

    // Validate original (to establish baseline)
    const originalValidation = await validateSvelteComponent(filePath, originalContent);
    
    // If already valid, skip
    if (originalValidation.valid) {
      console.log(`  ✅ ${filePath} - already valid`);
      stats.validated++;
      return true;
    }

    console.log(`  🔧 ${filePath} - applying fixes...`);

    // Apply fixes
    const { fixed, changes } = applyStructuralFixes(originalContent);

    // If no changes, skip
    if (changes === 0) {
      console.log(`     ⏭️  No applicable fixes`);
      return false;
    }

    // Validate fixed content
    const fixedValidation = await validateSvelteComponent(filePath, fixed);

    if (fixedValidation.valid) {
      // Create backup
      await fs.writeFile(`${filePath}.phase42-backup`, originalContent, 'utf-8');
      
      // Save fixed content
      await fs.writeFile(filePath, fixed, 'utf-8');
      
      console.log(`     ✅ Fixed ${changes} issues - validated and saved`);
      stats.fixed++;
      return true;
    } else {
      console.log(`     ❌ Fixes failed validation - reverting`);
      console.log(`        Errors: ${fixedValidation.errors.join(', ')}`);
      stats.failed++;
      stats.errors.push(fixedValidation);
      return false;
    }

  } catch (error: any) {
    console.error(`  ❌ Error processing ${filePath}:`, error.message);
    stats.failed++;
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║    PHASE 42 - AST-VALIDATED SVELTE STRUCTURAL REPAIR          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const srcDir = 'src';
  
  console.log('🔍 Scanning for Svelte components...\n');
  
  // Find all Svelte files
  const files = await glob(`${srcDir}/**/*.svelte`, {
    ignore: ['**/node_modules/**', '**/.svelte-kit/**', '**/backup/**']
  });

  console.log(`Found ${files.length} Svelte files\n`);

  // Process each file
  for (const file of files) {
    await processSvelteFile(file);
  }

  // Generate report
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                   REPAIR COMPLETE                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('📊 Statistics:');
  console.log(`   Files scanned:    ${stats.scanned}`);
  console.log(`   Already valid:    ${stats.validated}`);
  console.log(`   Successfully fixed: ${stats.fixed}`);
  console.log(`   Failed:           ${stats.failed}`);

  if (stats.errors.length > 0) {
    console.log('\n❌ Files that failed validation:');
    stats.errors.forEach(err => {
      console.log(`   • ${err.file}`);
      err.errors.forEach(e => console.log(`     - ${e}`));
    });
  }

  console.log('\n🔧 Next Steps:');
  console.log('   1. npx prettier "src/**/*.svelte" --write --parser svelte');
  console.log('   2. npm run check:svelte');
  console.log('   3. npm run build\n');

  // Save JSON report
  const report = {
    timestamp: new Date().toISOString(),
    stats,
    errors: stats.errors
  };

  await fs.writeFile(
    'phase42-ast-validation-report.json',
    JSON.stringify(report, null, 2),
    'utf-8'
  );

  console.log('📄 Report saved: phase42-ast-validation-report.json\n');

  // Exit with error code if any failures
  process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch(console.error);
