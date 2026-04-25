#!/usr/bin/env node

/**
 * SvelteKit Web App - Quick Fix Validation Script
 * Validates all the fixes applied to resolve critical errors
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_PATH = 'C:\\Users\\james\\Desktop\\web-app\\sveltekit-frontend';

console.log('🔍 SvelteKit Web App - Error Fix Validation');
console.log('='.repeat(50));

// Check if files exist and are properly formatted
const filesToCheck = [
  {
    path: 'src/routes/cases/+page.svelte',
    description: 'Cases page component',
    checks: [
      { pattern: /<script lang="ts">/, description: 'TypeScript script tag' },
      {
        pattern: /let focusManager = {/,
        description: 'FocusManager object defined',
      },
      { pattern: /<\/script>/, description: 'Script tag properly closed' },
      {
        pattern: /<style lang="ts">/,
        description: 'Style tag with lang attribute',
      },
      {
        pattern: /^\s*let/,
        description: 'No loose variables outside script',
        shouldNotMatch: true,
      },
    ],
  },
  {
    path: 'src/routes/cases/+layout.svelte',
    description: 'Cases layout component',
    checks: [
      { pattern: /<script lang="ts">/, description: 'TypeScript script tag' },
      {
        pattern: /<main class="flex-1 flex flex-col">/,
        description: 'Main content area',
      },
      {
        pattern: /<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/,
        description: 'No excessive closing divs',
        shouldNotMatch: true,
      },
    ],
  },
  {
    path: 'src/routes/cases/+layout.server.ts',
    description: 'Cases layout server file',
    checks: [
      {
        pattern: /const session = locals\.session/,
        description: 'Proper session handling',
      },
      {
        pattern: /\.validate\(\)/,
        description: 'Old validate method removed',
        shouldNotMatch: true,
      },
    ],
  },
  {
    path: 'src/routes/api/analytics/+server.ts',
    description: 'Analytics API server',
    checks: [
      {
        pattern: /EXTRACT\(EPOCH FROM/,
        description: 'PostgreSQL compatible date functions',
      },
      {
        pattern: /JULIANDAY/,
        description: 'SQLite JULIANDAY function removed',
        shouldNotMatch: true,
      },
    ],
  },
  {
    path: 'src/routes/api/citations/+server.ts',
    description: 'Citations API server',
    checks: [
      {
        pattern: /function isValidUUID/,
        description: 'UUID validation function',
      },
      {
        pattern: /function isDemoCase/,
        description: 'Demo case handling function',
      },
      { pattern: /UUID_REGEX/, description: 'UUID regex validation' },
    ],
  },
];

let allPassed = true;
let totalChecks = 0;
let passedChecks = 0;

for (const file of filesToCheck) {
  const filePath = path.join(FRONTEND_PATH, file.path);

  console.log(`\n📁 ${file.description}`);
  console.log(`   ${file.path}`);

  if (!fs.existsSync(filePath)) {
    console.log(`   ❌ File does not exist!`);
    allPassed = false;
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  for (const check of file.checks) {
    totalChecks++;
    const matches = check.pattern.test(content);
    const passed = check.shouldNotMatch ? !matches : matches;

    if (passed) {
      console.log(`   ✅ ${check.description}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.description}`);
      allPassed = false;
    }
  }
}

// Additional checks
console.log('\n🔧 Additional Validation Checks');

// Check for common Svelte errors
const casePagePath = path.join(FRONTEND_PATH, 'src/routes/cases/+page.svelte');
if (fs.existsSync(casePagePath)) {
  const content = fs.readFileSync(casePagePath, 'utf8');

  totalChecks++;
  // Check if there's any JavaScript outside script tags
  const scriptSections = content.match(/<script[^>]*>[\s\S]*?<\/script>/g) || [];
  const allScriptContent = scriptSections.join('');
  const nonScriptContent = content.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');

  if (!nonScriptContent.match(/^\s*let|^\s*const|^\s*var|^\s*function/m)) {
    console.log('   ✅ No loose JavaScript outside script tags');
    passedChecks++;
  } else {
    console.log('   ❌ Found JavaScript code outside script tags');
    allPassed = false;
  }
}

// Performance summary
console.log('\n📊 Validation Summary');
console.log('='.repeat(30));
console.log(`Total checks: ${totalChecks}`);
console.log(`Passed: ${passedChecks}`);
console.log(`Failed: ${totalChecks - passedChecks}`);
console.log(`Success rate: ${Math.round((passedChecks / totalChecks) * 100)}%`);

if (allPassed) {
  console.log('\n🎉 All fixes validated successfully!');
  console.log('\nNext steps:');
  console.log('1. Run: npm run check');
  console.log('2. Run: npm run dev');
  console.log('3. Test the /cases route');
  console.log('4. Check browser console for errors');
} else {
  console.log('\n⚠️  Some issues found. Please review the failed checks above.');
  console.log('\nTroubleshooting:');
  console.log('- Check file paths and ensure files exist');
  console.log('- Verify syntax and structure in failed files');
  console.log('- Run manual fixes as needed');
}

console.log('\n🔗 Quick commands:');
console.log(`cd "${FRONTEND_PATH}"`);
console.log('npm run check    # TypeScript validation');
console.log('npm run dev      # Start development server');
console.log('npm run build    # Test production build');

// Export results for potential CI/CD integration
const results = {
  timestamp: new Date().toISOString(),
  totalChecks,
  passedChecks: failedChecks, totalChecks: totalChecks - passedChecks: success, allPassed: allPassed,
  details: filesToCheck,
};

fs.writeFileSync(
  path.join(FRONTEND_PATH, 'fix-validation-results.json'),
  JSON.stringify(results, null, 2)
);

console.log('\n📄 Results saved to: fix-validation-results.json');
