#!/usr/bin/env node

/**
 * Quick Test for Advanced Error Analysis System
 */

import fs from 'fs/promises';
import path from 'path';
import { FastPatternScanner } from './adaptive-error-analyzer.mjs';

async function quickTest() {
  console.log('🧪 Quick Test - Advanced Error Analysis System');
  console.log('=' .repeat(50));

  const scanner = new FastPatternScanner();

  // Import patterns from existing analyzer
  const { ERROR_PATTERNS } = await import('./redis-error-analyzer-simple.mjs');

  // Add patterns
  Object.entries(ERROR_PATTERNS).forEach(([id, pattern]) => {
    scanner.addPattern(id, pattern);
  });

  console.log(`📊 Loaded ${Object.keys(ERROR_PATTERNS).length} patterns`);

  // Test on the validation file
  const testFile = 'test-errors-validation.svelte';
  const testFilePath = path.join(process.cwd(), testFile);

  try {
    const result = await scanner.scanFile(testFilePath);

    if (result) {
      console.log(`✅ Test file scanned: ${result.file}`);
      console.log(`🔴 Errors found: ${result.errors.length}`);

      // Show top errors
      result.errors.slice(0, 10).forEach((error, i) => {
        console.log(`   ${i + 1}. ${error.pattern} (${error.severity}) - Line ${error.line}: ${error.match.substring(0, 50)}...`);
      });

      // Pattern breakdown
      const patternBreakdown = {};
      result.errors.forEach(error => {
        patternBreakdown[error.pattern] = (patternBreakdown[error.pattern] || 0) + 1;
      });

      console.log('\n📈 Pattern Breakdown:');
      Object.entries(patternBreakdown)
        .sort(([,a], [,b]) => b - a)
        .forEach(([pattern, count]) => {
          console.log(`   ${pattern}: ${count}`);
        });

      return result.errors.length > 0;
    } else {
      console.log('❌ Failed to scan test file');
      return false;
    }
  } catch (error) {
    console.log(`❌ Error during test: ${error.message}`);
    return false;
  }
}

// Run test
quickTest().then(success => {
  console.log(`\n${success ? '✅' : '❌'} Test ${success ? 'PASSED' : 'FAILED'}`);
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
});