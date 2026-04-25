#!/usr/bin/env node

/**
 * Fast Adaptive Error Analyzer - Limited Scope Version
 * Runs on src/ and routes/ directories only for quick results
 */

import fs from 'fs/promises';
import path from 'path';
import { AdaptiveErrorAnalyzer } from './adaptive-error-analyzer.mjs';

async function fastAnalysis() {
  console.log('⚡ Fast Adaptive Error Analysis');
  console.log('=' .repeat(40));

  const analyzer = new AdaptiveErrorAnalyzer();

  // Import patterns from existing analyzer
  const { ERROR_PATTERNS } = await import('./redis-error-analyzer-simple.mjs');

  // Limit to src and routes directories
  const limitedPatterns = { ...ERROR_PATTERNS };
  Object.keys(limitedPatterns).forEach(key => {
    limitedPatterns[key].fileTypes = limitedPatterns[key].fileTypes?.filter(ext =>
      ['.js', '.ts', '.jsx', '.tsx', '.svelte', '.css', '.scss'].includes(ext)
    );
  });

  // Create limited scanner that only scans src/ and routes/
  const originalScanDirectory = analyzer.scanner.scanDirectory.bind(analyzer.scanner);
  analyzer.scanner.scanDirectory = async function(dirPath, patterns) {
    console.log('🔍 Fast scan - Limited to src/ and routes/ directories');

    // Override glob to limit scope
    const { glob } = await import('glob');
    const files = glob.sync('{src,routes}/**/*.{js,ts,jsx,tsx,svelte,css,scss}', {
      cwd: dirPath,
      absolute: true,
      ignore: ['node_modules/**', '.svelte-kit/**', 'build/**', 'dist/**']
    });

    console.log(`📁 Found ${files.length} files in src/ and routes/`);

    // Process in smaller batches
    const batchSize = 200;
    const batches = [];
    for (let i = 0; i < files.length; i += batchSize) {
      batches.push(files.slice(i, i + batchSize));
    }

    console.log(`📦 Processing ${batches.length} batches of ${batchSize} files each`);

    let totalErrors = 0;
    let processedFiles = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`📊 Batch ${batchIndex + 1}/${batches.length}: Processing ${batch.length} files`);

      const batchPromises = batch.map(file => this.scanFile(file));
      const batchResults = await Promise.all(batchPromises);

      const batchErrors = batchResults
        .filter(result => result && result.errors.length > 0)
        .reduce((sum, result) => sum + result.errors.length, 0);

      totalErrors += batchErrors;
      processedFiles += batch.length;

      console.log(`   ✅ Found ${batchErrors} errors in ${batch.length} files`);
    }

    console.log(`\n🎯 Fast Scan Complete:`);
    console.log(`   📁 Files processed: ${processedFiles}`);
    console.log(`   🔴 Total errors: ${totalErrors}`);
    console.log(`   📈 Files with errors: ${this.results.size}`);

    return this.generateAdvancedReport();
  };

  const results = await analyzer.analyzeWithLearning(process.cwd(), limitedPatterns);

  // Save results
  await fs.mkdir('analysis', { recursive: true });
  await fs.writeFile(
    'analysis/fast-adaptive-analysis.json',
    JSON.stringify(results, null, 2)
  );

  console.log('\n💾 Fast analysis saved to: analysis/fast-adaptive-analysis.json');

  // Print key insights
  console.log('\n🎯 Key Insights:');
  console.log(`   📈 Confidence improvement: ${(results.learningMetrics.confidenceImprovement * 100).toFixed(1)}%`);
  console.log(`   🔄 Learning iterations: ${results.learningMetrics.learningIterations}`);
  console.log(`   🎖️  Final confidence threshold: ${results.learningMetrics.finalConfidenceThreshold.toFixed(2)}`);

  if (results.recommendations && results.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    results.recommendations.slice(0, 3).forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec.action}`);
    });
  }

  return results;
}

// Run fast analysis
fastAnalysis().catch(console.error);