#!/usr/bin/env node

/**
 * Svelte 5 Compliance Validation Script
 * Validates and optionally fixes Svelte 5 migration compliance issues
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

console.log('🔍 Starting Svelte 5 Compliance Validation...\n');

// Check if --fix flag is provided
const shouldFix = process.argv.includes('--fix');

if (shouldFix) {
  console.log('🔧 Auto-fix mode enabled\n');
}

// Patterns to check for Svelte 5 compliance
const complianceChecks = {
  // Old event handlers (Svelte 4)
  oldEventHandlers: {
    pattern: /on:click|on:change|on:input|on:submit|on:keydown|on:keyup|on:focus|on:blur/g,
    replacement: (match) => {
      const eventMap = {
        'on:click': 'onclick',
        'on:change': 'onchange',
        'on:input': 'oninput',
        'on:submit': 'onsubmit',
        'on:keydown': 'onkeydown',
        'on:keyup': 'onkeyup',
        'on:focus': 'onfocus',
        'on:blur': 'onblur'
      };
      return eventMap[match] || match;
    },
    description: 'Convert old Svelte 4 event handlers to Svelte 5 format'
  },

  // Old createEventDispatcher usage
  createEventDispatcher: {
    pattern: /import\s*{\s*createEventDispatcher[^}]*}\s*from\s*['"]svelte['"]/g,
    replacement: () => '// TODO: Replace createEventDispatcher with callback props',
    description: 'Replace createEventDispatcher imports with callback props pattern'
  },

  // Old export let (should be $props())
  exportLetProps: {
    pattern: /export\s+let\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^;]+);/g,
    replacement: (match, propName, defaultValue) => {
      // This is complex to auto-fix, just flag it
      return match + ' // TODO: Convert to $props() destructuring';
    },
    description: 'Convert export let props to $props() destructuring'
  },

  // Old store subscriptions
  storeSubscriptions: {
    pattern: /\$([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
    replacement: (match) => {
      // This needs manual review, just flag it
      return match + ' // TODO: Verify store subscription is correct for Svelte 5';
    },
    description: 'Review store subscriptions for Svelte 5 compatibility'
  }
};

async function findSvelteFiles() {
  try {
    const files = await glob('src/**/*.{svelte,ts,js}', {
      cwd: process.cwd(),
      absolute: true
    });
    return files;
  } catch (error) {
    console.error('Error finding Svelte files:', error.message);
    return [];
  }
}

async function validateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];
  let fixedContent = content;

  Object.entries(complianceChecks).forEach(([checkName, check]) => {
    const matches = content.match(check.pattern);
    if (matches) {
      issues.push({
        file: path.relative(process.cwd(), filePath),
        check: checkName,
        description: check.description,
        matches: matches.length,
        lines: matches.map(match => {
          const lines = content.split('\n');
          const lineIndex = lines.findIndex(line => line.includes(match));
          return lineIndex + 1;
        })
      });

      if (shouldFix && check.replacement) {
        fixedContent = fixedContent.replace(check.pattern, check.replacement);
      }
    }
  });

  if (shouldFix && fixedContent !== content) {
    fs.writeFileSync(filePath, fixedContent);
  }

  return issues;
}

async function runValidation() {
  console.log('📂 Scanning for Svelte files...\n');

  const files = await findSvelteFiles();
  console.log(`Found ${files.length} files to check\n`);

  const allIssues = [];

  for (const file of files) {
    const issues = await validateFile(file);
    allIssues.push(...issues);
  }

  // Group issues by file
  const issuesByFile = {};
  allIssues.forEach(issue => {
    if (!issuesByFile[issue.file]) {
      issuesByFile[issue.file] = [];
    }
    issuesByFile[issue.file].push(issue);
  });

  // Display results
  console.log('📊 Svelte 5 Compliance Report\n');
  console.log('='.repeat(60));

  if (Object.keys(issuesByFile).length === 0) {
    console.log('✅ No compliance issues found! Your code is Svelte 5 ready.');
  } else {
    console.log(`⚠️  Found ${allIssues.length} compliance issues across ${Object.keys(issuesByFile).length} files:\n`);

    Object.entries(issuesByFile).forEach(([file, issues]) => {
      console.log(`📄 ${file}:`);
      issues.forEach(issue => {
        console.log(`  • ${issue.description} (${issue.matches} instances)`);
        if (issue.lines.length <= 5) {
          console.log(`    Lines: ${issue.lines.join(', ')}`);
        } else {
          console.log(`    Lines: ${issue.lines.slice(0, 5).join(', ')}... (${issue.lines.length} total)`);
        }
      });
      console.log('');
    });

    if (shouldFix) {
      console.log('🔧 Auto-fix applied where possible. Manual review required for complex changes.');
    } else {
      console.log('💡 Run with --fix flag to automatically fix simple issues.');
    }
  }

  // Save detailed report
  const reportPath = path.join(process.cwd(), 'svelte5-compliance-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    totalIssues: allIssues.length,
    filesChecked: files.length,
    issuesByFile,
    autoFixed: shouldFix,
    summary: {
      compliant: Object.keys(issuesByFile).length === 0,
      filesWithIssues: Object.keys(issuesByFile).length,
      totalIssues: allIssues.length
    }
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Detailed report saved to: ${reportPath}`);

  console.log('\n✅ Svelte 5 compliance validation complete!');

  // Exit with error code if issues found
  if (allIssues.length > 0) {
    process.exit(1);
  }
}

// Run the validation
runValidation().catch(error => {
  console.error('❌ Validation failed:', error.message);
  process.exit(1);
});