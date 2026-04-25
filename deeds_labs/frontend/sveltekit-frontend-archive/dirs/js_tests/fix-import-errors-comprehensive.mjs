#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

console.log('🔧 Comprehensive Import Error Fix for SvelteKit Project');
console.log('=' * 60);

const fixes = [];
const errors = [];

// Define correct import mappings
const importFixes = {
  // Malformed UI component imports
  '"$lib/components/ui/index.js/index"': '"$lib/components/ui"',
  '"$lib/components/ui/ExpandGrid.svelte/index"': '"$lib/components/ui"',
  '"$lib/components/ui/GoldenLayout.svelte/index"': '"$lib/components/ui"',
  '"$lib/components/ui/SmartTextarea.svelte/index"': '"$lib/components/ui"',
  '"$lib/components/ui/Tooltip.svelte/index"': '"$lib/components/ui/tooltip"',

  // Fix component-specific paths
  '"$lib/components/ui/tooltip/index"': '"$lib/components/ui"',
  '"$lib/components/ui/button/index"': '"$lib/components/ui"',
  '"$lib/components/ui/label/index"': '"$lib/components/ui"',
  '"$lib/components/ui/input/index"': '"$lib/components/ui"',

  // Common import corrections
  'from "$lib/components/ui/index.js/index"': 'from "$lib/components/ui"',
  'from "$lib/components/ui/ExpandGrid.svelte/index"': 'from "$lib/components/ui"',
  'from "$lib/components/ui/GoldenLayout.svelte/index"': 'from "$lib/components/ui"',
  'from "$lib/components/ui/SmartTextarea.svelte/index"': 'from "$lib/components/ui"',
  'from "$lib/components/ui/Tooltip.svelte/index"': 'from "$lib/components/ui"',
};

// Component name mappings for import statements
const componentImportFixes = {
  // Fix specific component imports that should come from the main index
  'import { Button } from "$lib/components/ui/index.js/index"':
    'import { Button } from "$lib/components/ui"',
  'import { Tooltip } from "$lib/components/ui/tooltip/index"':
    'import { Tooltip } from "$lib/components/ui"',
  'import { Label } from "$lib/components/ui/label/index"':
    'import { Label } from "$lib/components/ui"',
  'import { Input } from "$lib/components/ui/input/index"':
    'import { Input } from "$lib/components/ui"',

  // Fix component-specific imports
  'import Tooltip from "$lib/components/ui/Tooltip.svelte/index"':
    'import { Tooltip } from "$lib/components/ui"',
  'import ExpandGrid from "$lib/components/ui/ExpandGrid.svelte/index"':
    'import { ExpandGrid } from "$lib/components/ui"',
  'import GoldenLayout from "$lib/components/ui/GoldenLayout.svelte/index"':
    'import { GoldenLayout } from "$lib/components/ui"',
  'import SmartTextarea from "$lib/components/ui/SmartTextarea.svelte/index"':
    'import { SmartTextarea } from "$lib/components/ui"',
};

// Additional common fixes
const additionalFixes = {
  // Fix tabindex attributes
  'tabindex="0"': 'tabindex={0}',
  'tabindex="1"': 'tabindex={1}',
  'tabindex="-1"': 'tabindex={-1}',

  // Fix boolean attributes
  'disabled="true"': 'disabled={true}',
  'disabled="false"': 'disabled={false}',
  'readonly="true"': 'readonly={true}',
  'readonly="false"': 'readonly={false}',
  'checked="true"': 'checked={true}',
  'checked="false"': 'checked={false}',

  // Fix CSS @apply for UnoCSS/Tailwind
  'Unknown at-rule @apply': '', // This will be handled separately
};

async function findSvelteFiles() {
  const patterns = ['src/**/*.svelte', 'src/**/*.ts', 'src/**/*.js'];

  const allFiles = [];
  for (const pattern of patterns) {
    try {
      const files = await glob(pattern, {
        ignore: ['node_modules/**', '.svelte-kit/**'],
      });
      allFiles.push(...files);
    } catch (error) {
      console.warn(`Warning: Could not find files with pattern ${pattern}:`, error.message);
    }
  }

  return [...new Set(allFiles)]; // Remove duplicates
}

function fixFileContent(content, filePath) {
  let fixedContent = content;
  let fileFixCount = 0;
  const appliedFixes = [];

  // Apply import fixes
  for (const [badImport, goodImport] of Object.entries(importFixes)) {
    if (fixedContent.includes(badImport)) {
      fixedContent = fixedContent.replace(
        new RegExp(badImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        goodImport
      );
      fileFixCount++;
      appliedFixes.push(`Import: ${badImport} → ${goodImport}`);
    }
  }

  // Apply component import fixes
  for (const [badImport, goodImport] of Object.entries(componentImportFixes)) {
    if (fixedContent.includes(badImport)) {
      fixedContent = fixedContent.replace(
        new RegExp(badImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        goodImport
      );
      fileFixCount++;
      appliedFixes.push(`Component: ${badImport} → ${goodImport}`);
    }
  }

  // Apply additional fixes
  for (const [badPattern, goodPattern] of Object.entries(additionalFixes)) {
    if (goodPattern && fixedContent.includes(badPattern)) {
      fixedContent = fixedContent.replace(
        new RegExp(badPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        goodPattern
      );
      fileFixCount++;
      appliedFixes.push(`Attribute: ${badPattern} → ${goodPattern}`);
    }
  }

  // Fix common malformed imports with regex patterns
  const regexFixes = [
    // Fix any remaining /index imports
    {
      pattern: /from\s+["'](\$lib\/components\/ui\/[^"']+)\/index["']/g,
      replacement: 'from "$1"',
      description: 'Remove /index from imports',
    },

    // Fix .svelte/index imports
    {
      pattern: /from\s+["'](\$lib\/components\/ui\/[^"']+)\.svelte\/index["']/g,
      replacement: 'from "$lib/components/ui"',
      description: 'Fix .svelte/index imports',
    },

    // Fix duplicate .js extensions
    {
      pattern: /from\s+["'](\$lib\/[^"']+)\.js\.js["']/g,
      replacement: 'from "$1.js"',
      description: 'Fix duplicate .js extensions',
    },
  ];

  for (const fix of regexFixes) {
    const matches = fixedContent.match(fix.pattern);
    if (matches) {
      fixedContent = fixedContent.replace(fix.pattern, fix.replacement);
      fileFixCount += matches.length;
      appliedFixes.push(`Regex: ${fix.description} (${matches.length} matches)`);
    }
  }

  return { fixedContent, fileFixCount, appliedFixes };
}

async function fixImportsInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const { fixedContent, fileFixCount, appliedFixes } = fixFileContent(content, filePath);

    if (fileFixCount > 0) {
      fs.writeFileSync(filePath, fixedContent);
      fixes.push({
        file: filePath,
        fixCount: fileFixCount,
        fixes: appliedFixes,
      });
      console.log(`✅ Fixed ${fileFixCount} issues in: ${filePath}`);
      if (appliedFixes.length > 0 && process.env.VERBOSE) {
        appliedFixes.forEach((fix) => console.log(`    ${fix}`));
      }
    }

    return fileFixCount;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    errors.push({ file: filePath, error: error.message });
    return 0;
  }
}

async function fixAllImports() {
  console.log('🔍 Finding Svelte/TS/JS files...');

  const files = await findSvelteFiles();
  console.log(`📁 Found ${files.length} files to process`);

  let totalFixes = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`[${i + 1}/${files.length}] Processing: ${file}`);

    const fixCount = await fixImportsInFile(file);
    totalFixes += fixCount;
  }

  return { totalFixes, processedFiles: files.length };
}

// Additional function to fix CSS @apply issues
async function fixCSSIssues() {
  console.log('\n🎨 Fixing CSS @apply issues...');

  const svelteFiles = await glob('src/**/*.svelte');
  let cssFixCount = 0;

  for (const file of svelteFiles) {
    try {
      let content = fs.readFileSync(file, 'utf8');
      let modified = false;

      // Replace @apply with individual Tailwind classes for better compatibility
      const applyFixes = {
        '@apply bg-blue-100 px-2 py-1 rounded text-sm font-mono;':
          'background-color: rgb(219 234 254); padding: 0.5rem; border-radius: 0.25rem; font-size: 0.875rem; font-family: ui-monospace;',
        '@apply text-gray-600 hover:text-gray-800;':
          'color: rgb(75 85 99); &:hover { color: rgb(31 41 55); }',
      };

      for (const [applyRule, replacement] of Object.entries(applyFixes)) {
        if (content.includes(applyRule)) {
          content = content.replace(applyRule, replacement);
          modified = true;
          cssFixCount++;
        }
      }

      if (modified) {
        fs.writeFileSync(file, content);
        console.log(`✅ Fixed CSS @apply in: ${file}`);
      }
    } catch (error) {
      console.warn(`⚠️ Could not fix CSS in ${file}:`, error.message);
    }
  }

  return cssFixCount;
}

// Main execution
async function main() {
  try {
    const startTime = Date.now();

    // Step 1: Fix import errors
    const { totalFixes, processedFiles } = await fixAllImports();

    // Step 2: Fix CSS issues
    const cssFixCount = await fixCSSIssues();

    // Generate detailed report
    console.log('\n📊 COMPREHENSIVE REPORT');
    console.log('=' * 50);
    console.log(`✅ Total import fixes applied: ${totalFixes}`);
    console.log(`✅ CSS fixes applied: ${cssFixCount}`);
    console.log(`📁 Files processed: ${processedFiles}`);
    console.log(`❌ Files with errors: ${errors.length}`);
    console.log(`⏱️ Processing time: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalImportFixes: totalFixes,
        cssFixCount,
        processedFiles,
        errorCount: errors.length,
        processingTimeMs: Date.now() - startTime,
      },
      fixes: fixes,
      errors: errors,
      fixTypes: {
        importPaths: Object.keys(importFixes).length,
        componentImports: Object.keys(componentImportFixes).length,
        attributeFixes: Object.keys(additionalFixes).length,
        cssApplyFixes: cssFixCount,
      },
    };

    fs.writeFileSync('import-fix-report.json', JSON.stringify(report, null, 2));
    console.log('\n📄 Detailed report saved to: import-fix-report.json');

    // Show next steps
    console.log('\n🎯 NEXT STEPS:');
    console.log('1. Run: npm run check');
    console.log('2. Test the application: npm run dev');
    console.log('3. Review remaining errors in the TypeScript check');
    console.log('4. Consider running the PowerShell script for additional fixes');

    if (totalFixes > 0 || cssFixCount > 0) {
      console.log('\n🎉 Import fixes completed successfully!');
      process.exit(0);
    } else {
      console.log('\n💡 No fixes were needed - imports appear to be correct');
      process.exit(0);
    }
  } catch (error) {
    console.error('💥 Critical error during fix process:', error);
    process.exit(1);
  }
}

// Execute if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { fixFileContent, fixAllImports, fixCSSIssues };
