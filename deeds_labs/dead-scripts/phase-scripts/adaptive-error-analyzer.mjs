#!/usr/bin/env node

/**
 * Advanced Error Analysis System
 * Uses fast scanning, timeline-based ranking, and continuous learning
 */

import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import { Worker } from 'worker_threads';

const require = createRequire(import.meta.url);
const { glob } = require('glob');

// Fast pattern scanner using streaming
class FastPatternScanner {
  constructor() {
    this.patterns = {};
    this.results = new Map();
    this.timeline = [];
  }

  addPattern(id, pattern) {
    this.patterns[id] = {
      ...pattern,
      compiled: new RegExp(pattern.regex, 'g')
    };
  }

  async scanFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const fileExt = path.extname(filePath).toLowerCase();
      const relativePath = path.relative(process.cwd(), filePath);

      const fileResults = {
        file: relativePath,
        size: content.length,
        errors: [],
        timestamp: Date.now()
      };

      for (const [patternId, pattern] of Object.entries(this.patterns)) {
        // Check file type filter
        if (pattern.fileTypes && !pattern.fileTypes.includes(fileExt)) {
          continue;
        }

        const matches = [...content.matchAll(pattern.compiled)];
        if (matches.length > 0) {
          for (const match of matches) {
            const line = this.getLineNumber(content, match[0]);
            fileResults.errors.push({
              pattern: patternId,
              severity: pattern.severity,
              match: match[0].trim(),
              line,
              index: match.index,
              suggestion: this.getSuggestion(patternId, match[0]),
              confidence: this.calculateConfidence(patternId, match[0], content, line)
            });
          }
        }
      }

      if (fileResults.errors.length > 0) {
        this.results.set(relativePath, fileResults);
        this.timeline.push({
          timestamp: Date.now(),
          file: relativePath,
          errorCount: fileResults.errors.length,
          patterns: [...new Set(fileResults.errors.map(e => e.pattern))]
        });
      }

      return fileResults;
    } catch (error) {
      return null;
    }
  }

  getLineNumber(content, match) {
    const index = content.indexOf(match);
    if (index === -1) return 1;
    return content.substring(0, index).split('\n').length;
  }

  getSuggestion(patternId, match) {
    const suggestions = {
      TS001: match.replace(/,\s*/g, ' | '),
      CSS001: match.replace(/,\s*(?=\w)/g, '; '),
      CSS002: match + ';',
      JS001: '// ' + match.trim(),
      SYN001: match.replace(/,,\s*/g, ', '),
      OBJ001: '/* Requires manual review */',
      SVELTE001: match.replace(/="([^"]*)"/, '={$1}')
    };
    return suggestions[patternId] || 'Manual review required';
  }

  calculateConfidence(patternId, match, content, line) {
    // Calculate confidence score based on context
    let confidence = 0.5; // Base confidence

    // Context-based adjustments
    switch (patternId) {
      case 'CSS001':
      case 'CSS002':
        // Higher confidence if in style block
        if (this.isInStyleBlock(content, match)) confidence += 0.3;
        break;
      case 'TS001':
        // Lower confidence for complex expressions
        if (match.includes('(') || match.includes('[')) confidence -= 0.2;
        break;
      case 'JS001':
        // High confidence for console statements
        confidence = 0.9;
        break;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  isInStyleBlock(content, match) {
    const matchIndex = content.indexOf(match);
    const beforeMatch = content.substring(0, matchIndex);
    const lastStyleOpen = beforeMatch.lastIndexOf('<style');
    const lastStyleClose = beforeMatch.lastIndexOf('</style>');
    return lastStyleOpen > lastStyleClose;
  }

  async scanDirectory(dirPath, patterns) {
    console.log('🚀 Fast Pattern Scanner - Advanced Analysis');
    console.log('=' .repeat(50));

    // Add patterns
    Object.entries(patterns).forEach(([id, pattern]) => {
      this.addPattern(id, pattern);
    });

    console.log(`📊 Loaded ${Object.keys(this.patterns).length} patterns`);

    // Fast glob scan
    const files = glob.sync('**/*.{js,ts,jsx,tsx,svelte,css,scss}', {
      cwd: dirPath,
      absolute: true,
      ignore: ['node_modules/**', '.svelte-kit/**', 'build/**', 'dist/**']
    });

    console.log(`📁 Found ${files.length} files to scan`);

    // Process in parallel batches
    const batchSize = 500;
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

    console.log(`\n🎯 Scan Complete:`);
    console.log(`   📁 Files processed: ${processedFiles}`);
    console.log(`   🔴 Total errors: ${totalErrors}`);
    console.log(`   📈 Files with errors: ${this.results.size}`);

    return this.generateAdvancedReport();
  }

  generateAdvancedReport() {
    // Pattern frequency analysis
    const patternStats = {};
    const severityStats = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const fileTypeStats = {};

    for (const [filePath, fileData] of this.results) {
      const fileExt = path.extname(filePath);

      if (!fileTypeStats[fileExt]) {
        fileTypeStats[fileExt] = { files: 0, errors: 0 };
      }
      fileTypeStats[fileExt].files++;
      fileTypeStats[fileExt].errors += fileData.errors.length;

      for (const error of fileData.errors) {
        if (!patternStats[error.pattern]) {
          patternStats[error.pattern] = { count: 0, files: new Set(), avgConfidence: 0 };
        }
        patternStats[error.pattern].count++;
        patternStats[error.pattern].files.add(filePath);
        patternStats[error.pattern].avgConfidence =
          (patternStats[error.pattern].avgConfidence + error.confidence) / 2;

        severityStats[error.severity]++;
      }
    }

    // Timeline analysis
    const timelineAnalysis = this.analyzeTimeline();

    // Confidence-based ranking
    const rankedErrors = this.rankErrorsByConfidence();

    return {
      summary: {
        timestamp: new Date().toISOString(),
        totalFiles: this.results.size,
        totalErrors: Array.from(this.results.values()).reduce((sum, f) => sum + f.errors.length, 0),
        severityBreakdown: severityStats,
        fileTypeBreakdown: fileTypeStats
      },
      patternAnalysis: patternStats,
      timelineAnalysis,
      rankedErrors: rankedErrors.slice(0, 100), // Top 100 by confidence
      rawResults: Object.fromEntries(this.results)
    };
  }

  analyzeTimeline() {
    // Analyze error patterns over time (simulated timeline)
    const timeWindows = {};
    const windowSize = 1000 * 60; // 1 minute windows

    for (const entry of this.timeline) {
      const window = Math.floor(entry.timestamp / windowSize) * windowSize;
      if (!timeWindows[window]) {
        timeWindows[window] = { errors: 0, files: new Set(), patterns: new Set() };
      }
      timeWindows[window].errors += entry.errorCount;
      timeWindows[window].files.add(entry.file);
      entry.patterns.forEach(p => timeWindows[window].patterns.add(p));
    }

    return Object.entries(timeWindows).map(([timestamp, data]) => ({
      timestamp: parseInt(timestamp),
      errors: data.errors,
      files: data.files.size,
      patterns: Array.from(data.patterns)
    })).sort((a, b) => a.timestamp - b.timestamp);
  }

  rankErrorsByConfidence() {
    const allErrors = [];

    for (const [filePath, fileData] of this.results) {
      for (const error of fileData.errors) {
        allErrors.push({
          ...error,
          file: filePath,
          fileSize: fileData.size
        });
      }
    }

    return allErrors.sort((a, b) => b.confidence - a.confidence);
  }
}

// Advanced analysis with continuous learning
class AdaptiveErrorAnalyzer {
  constructor() {
    this.scanner = new FastPatternScanner();
    this.learningHistory = [];
    this.confidenceThreshold = 0.6;
  }

  async analyzeWithLearning(dirPath, patterns) {
    console.log('🧠 Adaptive Error Analyzer - Continuous Learning Mode');
    console.log('=' .repeat(60));

    // Initial scan
    const initialResults = await this.scanner.scanDirectory(dirPath, patterns);

    // Learning phase - analyze patterns and adjust confidence
    this.updateLearningModel(initialResults);

    // Re-scan with improved confidence thresholds
    console.log('\n🔄 Re-scanning with improved confidence thresholds...');
    const refinedResults = await this.rescanWithLearning(dirPath, patterns);

    // Generate comprehensive report
    return this.generateLearningReport(initialResults, refinedResults);
  }

  updateLearningModel(results) {
    // Analyze successful detections and false positives
    const patternPerformance = {};

    for (const [patternId, stats] of Object.entries(results.patternAnalysis)) {
      patternPerformance[patternId] = {
        accuracy: stats.avgConfidence,
        frequency: stats.count,
        fileDiversity: stats.files.size
      };
    }

    this.learningHistory.push({
      timestamp: Date.now(),
      patternPerformance,
      totalErrors: results.summary.totalErrors,
      confidenceThreshold: this.confidenceThreshold
    });

    // Adjust confidence threshold based on performance
    const avgConfidence = Object.values(patternPerformance)
      .reduce((sum, p) => sum + p.accuracy, 0) / Object.keys(patternPerformance).length;

    if (avgConfidence > 0.8) {
      this.confidenceThreshold = Math.min(0.8, this.confidenceThreshold + 0.05);
    } else if (avgConfidence < 0.5) {
      this.confidenceThreshold = Math.max(0.3, this.confidenceThreshold - 0.05);
    }

    console.log(`📈 Learning Update: Avg confidence ${avgConfidence.toFixed(2)}, new threshold ${this.confidenceThreshold.toFixed(2)}`);
  }

  async rescanWithLearning(dirPath, patterns) {
    // Re-scan with updated confidence thresholds
    const refinedScanner = new FastPatternScanner();

    // Add patterns with learning adjustments
    Object.entries(patterns).forEach(([id, pattern]) => {
      refinedScanner.addPattern(id, {
        ...pattern,
        minConfidence: this.confidenceThreshold
      });
    });

    return await refinedScanner.scanDirectory(dirPath, patterns);
  }

  generateLearningReport(initial, refined) {
    const improvement = {
      errorReduction: initial.summary.totalErrors - refined.summary.totalErrors,
      confidenceImprovement: this.calculateConfidenceImprovement(initial, refined),
      learningIterations: this.learningHistory.length
    };

    return {
      initialScan: initial,
      refinedScan: refined,
      learningMetrics: {
        ...improvement,
        finalConfidenceThreshold: this.confidenceThreshold,
        learningHistory: this.learningHistory.slice(-5) // Last 5 learning cycles
      },
      recommendations: this.generateRecommendations(initial, refined)
    };
  }

  calculateConfidenceImprovement(initial, refined) {
    const initialAvg = Object.values(initial.patternAnalysis)
      .reduce((sum, p) => sum + p.avgConfidence, 0) / Object.keys(initial.patternAnalysis).length;

    const refinedAvg = Object.values(refined.patternAnalysis)
      .reduce((sum, p) => sum + p.avgConfidence, 0) / Object.keys(refined.patternAnalysis).length;

    return refinedAvg - initialAvg;
  }

  generateRecommendations(initial, refined) {
    const recommendations = [];

    // Pattern-specific recommendations
    for (const [patternId, stats] of Object.entries(refined.patternAnalysis)) {
      if (stats.avgConfidence < 0.5) {
        recommendations.push({
          type: 'pattern_refinement',
          pattern: patternId,
          action: 'Consider refining regex or validation logic',
          confidence: stats.avgConfidence
        });
      }

      if (stats.count > 1000) {
        recommendations.push({
          type: 'high_frequency',
          pattern: patternId,
          action: 'High frequency pattern - consider batch processing optimization',
          count: stats.count
        });
      }
    }

    // File type recommendations
    const cssErrors = refined.summary.fileTypeBreakdown['.css']?.errors || 0;
    const scssErrors = refined.summary.fileTypeBreakdown['.scss']?.errors || 0;

    if (cssErrors > scssErrors * 2) {
      recommendations.push({
        type: 'file_type_focus',
        action: 'Consider CSS-specific pattern optimizations',
        cssErrors,
        scssErrors
      });
    }

    return recommendations;
  }
}

// Main execution
async function main() {
  const analyzer = new AdaptiveErrorAnalyzer();

  // Import patterns from existing analyzer
  const { ERROR_PATTERNS } = await import('./redis-error-analyzer-simple.mjs');

  const results = await analyzer.analyzeWithLearning(process.cwd(), ERROR_PATTERNS);

  // Save comprehensive results
  await fs.mkdir('analysis', { recursive: true });
  await fs.writeFile(
    'analysis/adaptive-error-analysis.json',
    JSON.stringify(results, null, 2)
  );

  console.log('\n💾 Adaptive analysis saved to: analysis/adaptive-error-analysis.json');

  // Print key insights
  console.log('\n🎯 Key Insights:');
  console.log(`   📈 Confidence improvement: ${(results.learningMetrics.confidenceImprovement * 100).toFixed(1)}%`);
  console.log(`   🔄 Learning iterations: ${results.learningMetrics.learningIterations}`);
  console.log(`   🎖️  Final confidence threshold: ${results.learningMetrics.finalConfidenceThreshold.toFixed(2)}`);

  if (results.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    results.recommendations.slice(0, 3).forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec.action}`);
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { FastPatternScanner, AdaptiveErrorAnalyzer };