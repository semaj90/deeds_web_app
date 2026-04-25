#!/usr/bin/env node

/**
 * TypeScript Error Categorization Script
 * Analyzes and categorizes TypeScript compilation errors
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Starting TypeScript Error Analysis...\n');

// Run TypeScript check and capture output
let tscOutput = '';
try {
  tscOutput = execSync('npx tsc --noEmit --skipLibCheck 2>&1', {
    encoding: 'utf8',
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024 // 10MB buffer
  });
} catch (error) {
  tscOutput = error.stdout || error.stderr || '';
}

console.log('📊 Processing TypeScript errors...\n');

// Parse and categorize errors
const errorCategories = {
  missingImports: [],
  typeMismatches: [],
  missingImplementations: [],
  moduleResolution: [],
  interfaceMismatches: [],
  other: []
};

const lines = tscOutput.split('\n').filter(line => line.trim());
let currentError = null;

for (const line of lines) {
  if (line.includes('error TS')) {
    if (currentError) {
      // Process previous error
      categorizeError(currentError);
    }
    currentError = { message: line, details: [] };
  } else if (currentError && line.trim()) {
    currentError.details.push(line);
  }
}

// Process last error
if (currentError) {
  categorizeError(currentError);
}

function categorizeError(error) {
  const fullText = [error.message, ...error.details].join(' ').toLowerCase();

  if (fullText.includes('cannot find name') || fullText.includes('is not defined')) {
    errorCategories.missingImports.push(error);
  } else if (fullText.includes('type') && (fullText.includes('is not assignable') || fullText.includes('expected'))) {
    errorCategories.typeMismatches.push(error);
  } else if (fullText.includes('does not implement') || fullText.includes('abstract member')) {
    errorCategories.missingImplementations.push(error);
  } else if (fullText.includes('module') && (fullText.includes('not found') || fullText.includes('cannot resolve'))) {
    errorCategories.moduleResolution.push(error);
  } else if (fullText.includes('property') && (fullText.includes('does not exist') || fullText.includes('missing'))) {
    errorCategories.interfaceMismatches.push(error);
  } else {
    errorCategories.other.push(error);
  }
}

// Generate report
console.log('📈 Error Analysis Report\n');
console.log('=' .repeat(50));

Object.entries(errorCategories).forEach(([category, errors]) => {
  console.log(`\n${category.toUpperCase()}: ${errors.length} errors`);

  if (errors.length > 0 && errors.length <= 10) {
    errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error.message.split('error TS')[1]?.split(':')[0] || 'Unknown'}`);
    });
  } else if (errors.length > 10) {
    console.log(`  (Showing first 10 of ${errors.length})`);
    errors.slice(0, 10).forEach((error, index) => {
      console.log(`  ${index + 1}. ${error.message.split('error TS')[1]?.split(':')[0] || 'Unknown'}`);
    });
  }
});

console.log('\n' + '=' .repeat(50));
console.log(`\n🎯 Total Errors: ${Object.values(errorCategories).reduce((sum, arr) => sum + arr.length, 0)}`);

// Save detailed report
const reportPath = path.join(process.cwd(), 'ts-error-analysis.json');
const detailedReport = {
  timestamp: new Date().toISOString(),
  totalErrors: Object.values(errorCategories).reduce((sum, arr) => sum + arr.length, 0),
  categories: errorCategories,
  rawOutput: tscOutput
};

fs.writeFileSync(reportPath, JSON.stringify(detailedReport, null, 2));
console.log(`\n💾 Detailed report saved to: ${reportPath}`);

console.log('\n✅ Error analysis complete!');