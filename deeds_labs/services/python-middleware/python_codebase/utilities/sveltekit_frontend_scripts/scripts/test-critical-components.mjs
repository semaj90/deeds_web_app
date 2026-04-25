#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

console.log('🧪 Testing Critical Components');
console.log('===============================\n');

let componentsAnalyzed = 0;
let issuesFound = 0;
let warnings = [];
let errors = [];

function analyzeComponent(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const fileName = filePath.split(/[/\\]/).pop();
    let componentIssues = [];
    let componentWarnings = [];

    // 1. Check for proper Svelte 5 rune usage
    if (content.includes('export let') && !content.includes('$props()')) {
      componentIssues.push('Still using export let instead of $props()');
    }

    if (content.includes('$:') && !content.includes('$derived') && !content.includes('$effect')) {
      componentWarnings.push('Contains $: reactive statements that might need conversion');
    }

    // 2. Check for proper error handling
    if (content.includes('fetch(') && !content.includes('catch')) {
      componentIssues.push('API calls without error handling');
    }

    if (content.includes('$effect(') && !content.includes('try')) {
      componentWarnings.push('Effects without error boundaries');
    }

    // 3. Check for performance issues
    if (content.includes('{#each') && !content.includes('(') && content.includes('items')) {
      componentWarnings.push('Lists without key attributes (performance impact)');
    }

    if (
      content.includes('$derived(') &&
      (content.includes('.map(') || content.includes('.filter('))
    ) {
      componentWarnings.push('Expensive operations in derived state');
    }

    // 4. Check for accessibility issues
    if (content.includes('<button') && !content.includes('aria-')) {
      componentWarnings.push('Buttons without accessibility attributes');
    }

    if (content.includes('<input') && !content.includes('label')) {
      componentWarnings.push('Inputs without associated labels');
    }

    // 5. Check for proper TypeScript usage
    if (content.includes(': any') || content.includes(': unknown')) {
      componentWarnings.push('Contains any/unknown types that could be more specific');
    }

    // 6. Check for potential memory leaks
    if (content.includes('addEventListener') && !content.includes('removeEventListener')) {
      componentIssues.push('Event listeners without cleanup');
    }

    if (content.includes('setInterval') && !content.includes('clearInterval')) {
      componentIssues.push('Intervals without cleanup');
    }

    // 7. Check for proper component structure
    if (!content.includes('<script') || !content.includes('lang="ts"')) {
      componentWarnings.push('Missing TypeScript in script tag');
    }

    // 8. Check for deprecated patterns
    if (content.includes('createEventDispatcher')) {
      componentWarnings.push('Using createEventDispatcher (consider callback props)');
    }

    if (content.includes('$$slots')) {
      componentIssues.push('Using deprecated $$slots (should use snippet props)');
    }

    // 9. Check for Svelte 5 specific issues
    if (content.includes('<slot') && content.includes('{@render')) {
      componentIssues.push('Mixing slot and snippet syntax');
    }

    if (content.includes('bind:this') && content.includes('$state(')) {
      componentWarnings.push('Potential reactivity issues with bind:this and $state');
    }

    // 10. Check for critical component patterns
    const isCritical =
      fileName.includes('Canvas') ||
      fileName.includes('Editor') ||
      fileName.includes('Chat') ||
      fileName.includes('Upload') ||
      fileName.includes('Auth') ||
      fileName.includes('Evidence');

    if (isCritical && componentIssues.length > 0) {
      errors.push({
        file: fileName,
        path: filePath,
        issues: componentIssues,
        warnings: componentWarnings,
        critical: true,
      });
    } else if (componentIssues.length > 0 || componentWarnings.length > 0) {
      warnings.push({
        file: fileName,
        path: filePath,
        issues: componentIssues,
        warnings: componentWarnings,
        critical: isCritical,
      });
    }

    componentsAnalyzed++;
    issuesFound += componentIssues.length;

    if (componentIssues.length > 0 || componentWarnings.length > 0) {
      console.log(`📋 ${fileName}`);
      if (componentIssues.length > 0) {
        console.log(`    ❌ Issues: ${componentIssues.length}`);
        componentIssues.forEach((issue) => console.log(`       • ${issue}`));
      }
      if (componentWarnings.length > 0) {
        console.log(`    ⚠️  Warnings: ${componentWarnings.length}`);
        componentWarnings.forEach((warning) => console.log(`       • ${warning}`));
      }
      console.log('');
    }

    return {
      issues: componentIssues.length,
      warnings: componentWarnings.length,
      critical: isCritical,
    };
  } catch (error) {
    console.error(`❌ Error analyzing ${filePath}:`, error.message);
    return { issues: 0, warnings: 0, critical: false };
  }
}

function walkDirectory(dir, extension = '.svelte') {
  const files = [];

  function walk(currentDir) {
    const items = readdirSync(currentDir);

    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        if (!['node_modules', '.svelte-kit', 'build', 'dist'].includes(item)) {
          walk(fullPath);
        }
      } else if (stat.isFile() && fullPath.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function generateReport() {
  console.log('📊 Component Analysis Report');
  console.log('=============================\n');

  console.log(`📈 Summary:`);
  console.log(`   Components analyzed: ${componentsAnalyzed}`);
  console.log(`   Total issues found: ${issuesFound}`);
  console.log(`   Critical errors: ${errors.length}`);
  console.log(`   Components with warnings: ${warnings.length}\n`);

  if (errors.length > 0) {
    console.log('🚨 Critical Issues (Require Immediate Attention):');
    console.log('================================================\n');

    errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.file} ${error.critical ? '(CRITICAL)' : ''}`);
      error.issues.forEach((issue) => console.log(`   ❌ ${issue}`));
      if (error.warnings.length > 0) {
        error.warnings.forEach((warning) => console.log(`   ⚠️  ${warning}`));
      }
      console.log('');
    });
  }

  if (warnings.length > 5) {
    console.log('⚠️  Top Warnings (First 5):');
    console.log('===========================\n');

    warnings.slice(0, 5).forEach((warning, index) => {
      console.log(`${index + 1}. ${warning.file}`);
      if (warning.issues.length > 0) {
        warning.issues.forEach((issue) => console.log(`   ❌ ${issue}`));
      }
      warning.warnings.slice(0, 3).forEach((warn) => console.log(`   ⚠️  ${warn}`));
      console.log('');
    });
  }

  // Recommendations
  console.log('💡 Recommendations:');
  console.log('===================\n');

  if (errors.length > 0) {
    console.log('1. 🔥 Fix critical errors first (mixing slot/snippet syntax, memory leaks)');
  }

  if (issuesFound > 50) {
    console.log('2. 📝 Run the migration scripts again to catch remaining patterns');
  }

  console.log('3. ⚡ Add proper error boundaries to components with API calls');
  console.log('4. 🎯 Add key attributes to large lists for better performance');
  console.log('5. ♿ Improve accessibility with proper ARIA attributes');
  console.log('6. 🧹 Clean up any/unknown types with more specific types');

  // Generate action items
  const actionItems = [];

  if (errors.length > 0) {
    actionItems.push(`Fix ${errors.length} critical component errors`);
  }

  const memoryLeaks = warnings.filter((w) =>
    w.issues.some((i) => i.includes('Event listeners') || i.includes('Intervals'))
  ).length;

  if (memoryLeaks > 0) {
    actionItems.push(`Fix ${memoryLeaks} potential memory leaks`);
  }

  const accessibilityIssues = warnings.filter((w) =>
    w.warnings.some(
      (w) => w.includes('accessibility') || w.includes('aria-') || w.includes('label')
    )
  ).length;

  if (accessibilityIssues > 0) {
    actionItems.push(`Improve accessibility in ${accessibilityIssues} components`);
  }

  if (actionItems.length > 0) {
    console.log('\n📋 Action Items:');
    actionItems.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item}`);
    });
  }

  return {
    componentsAnalyzed,
    issuesFound,
    criticalErrors: errors.length,
    warningsCount: warnings.length,
    actionItems,
  };
}

function main() {
  console.log('1️⃣ Finding Svelte components to analyze...\n');

  const srcDir = 'src';
  const svelteFiles = walkDirectory(srcDir, '.svelte');

  console.log(`Found ${svelteFiles.length} components\n`);

  console.log('2️⃣ Analyzing components...\n');

  // Focus on critical components first
  const criticalComponents = svelteFiles.filter((file) => {
    const fileName = file.split(/[/\\]/).pop();
    return (
      fileName.includes('Canvas') ||
      fileName.includes('Editor') ||
      fileName.includes('Chat') ||
      fileName.includes('Upload') ||
      fileName.includes('Auth') ||
      fileName.includes('Evidence')
    );
  });

  // Then analyze a sample of other components
  const otherComponents = svelteFiles
    .filter((file) => !criticalComponents.includes(file))
    .slice(0, 50); // Sample for performance

  const allToAnalyze = [...criticalComponents, ...otherComponents];

  console.log(
    `Analyzing ${allToAnalyze.length} components (${criticalComponents.length} critical)...\n`
  );

  for (const file of allToAnalyze) {
    analyzeComponent(file);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  const report = generateReport();

  // Write summary to file
  const summary = {
    timestamp: new Date().toISOString(),
    ...report,
    errors: errors.map((e) => ({ file: e.file, issues: e.issues.length, critical: e.critical })),
    topWarnings: warnings.slice(0, 10).map((w) => ({ file: w.file, warnings: w.warnings.length })),
  };

  writeFileSync('component-analysis-report.json', JSON.stringify(summary, null, 2));
  console.log('\n📄 Detailed report saved to: component-analysis-report.json');

  const success = errors.length === 0 && issuesFound < 10;
  console.log(`\n${success ? '✅' : '⚠️'} Analysis complete!`);

  return success;
}

main();
