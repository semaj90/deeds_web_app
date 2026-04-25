#!/usr/bin/env node

/**
 * AWK-Style Post-Processor for Error Analysis Results
 * Processes JSON results with awk-like patterns and aggregations
 */

import fs from 'fs/promises';
import path from 'path';

class AWKStyleProcessor {
  constructor() {
    this.processors = new Map();
    this.setupDefaultProcessors();
  }

  setupDefaultProcessors() {
    // Error count by file type
    this.processors.set('file-type-summary', {
      pattern: /.*/,
      action: (record, accum) => {
        const ext = path.extname(record.file || '');
        if (!accum[ext]) accum[ext] = { files: 0, errors: 0 };
        accum[ext].files++;
        accum[ext].errors += record.errors?.length || 0;
      }
    });

    // Pattern frequency analysis
    this.processors.set('pattern-frequency', {
      pattern: /.*/,
      action: (record, accum) => {
        if (record.errors) {
          record.errors.forEach(error => {
            if (!accum[error.pattern]) accum[error.pattern] = 0;
            accum[error.pattern]++;
          });
        }
      }
    });

    // Severity distribution
    this.processors.set('severity-distribution', {
      pattern: /.*/,
      action: (record, accum) => {
        if (record.errors) {
          record.errors.forEach(error => {
            if (!accum[error.severity]) accum[error.severity] = 0;
            accum[error.severity]++;
          });
        }
      }
    });

    // High-confidence errors only
    this.processors.set('high-confidence', {
      pattern: (record) => record.errors?.some(e => e.confidence > 0.8),
      action: (record, accum) => {
        accum.push({
          file: record.file,
          highConfidenceErrors: record.errors.filter(e => e.confidence > 0.8)
        });
      }
    });

    // Files with most errors
    this.processors.set('error-hotspots', {
      pattern: /.*/,
      action: (record, accum) => {
        if (record.errors && record.errors.length > 0) {
          accum.push({
            file: record.file,
            errorCount: record.errors.length,
            size: record.size
          });
        }
      }
    });
  }

  async processFile(inputFile, outputPattern = null) {
    const data = JSON.parse(await fs.readFile(inputFile, 'utf-8'));

    // Extract raw results
    const rawResults = data.rawResults || data.refinedScan?.rawResults || {};

    const results = {
      timestamp: new Date().toISOString(),
      processors: {}
    };

    // Run each processor
    for (const [name, processor] of this.processors) {
      const accumulator = this.getAccumulatorType(name);

      for (const [filePath, record] of Object.entries(rawResults)) {
        if (processor.pattern === /.*/ || processor.pattern(record)) {
          processor.action({ ...record, file: filePath }, accumulator);
        }
      }

      results.processors[name] = this.finalizeAccumulator(name, accumulator);
    }

    // Apply output pattern if specified
    if (outputPattern) {
      results.filtered = this.applyOutputPattern(results, outputPattern);
    }

    return results;
  }

  getAccumulatorType(processorName) {
    switch (processorName) {
      case 'file-type-summary':
      case 'pattern-frequency':
      case 'severity-distribution':
        return {};
      case 'high-confidence':
      case 'error-hotspots':
        return [];
      default:
        return {};
    }
  }

  finalizeAccumulator(processorName, accumulator) {
    switch (processorName) {
      case 'error-hotspots':
        return accumulator
          .sort((a, b) => b.errorCount - a.errorCount)
          .slice(0, 20); // Top 20 hotspots
      case 'high-confidence':
        return accumulator.slice(0, 50); // Top 50 high-confidence files
      default:
        return accumulator;
    }
  }

  applyOutputPattern(results, pattern) {
    // AWK-style pattern matching on results
    const filtered = {};

    for (const [processorName, data] of Object.entries(results.processors)) {
      if (pattern.test(processorName)) {
        filtered[processorName] = data;
      }
    }

    return filtered;
  }

  // Custom processor registration
  registerProcessor(name, pattern, action) {
    this.processors.set(name, { pattern, action });
  }

  // Generate summary report
  generateSummary(processedResults) {
    const summary = {
      overview: {
        processedAt: processedResults.timestamp,
        processorsRun: Object.keys(processedResults.processors).length
      },
      insights: []
    };

    // Extract key insights
    const processors = processedResults.processors;

    // File type insights
    if (processors['file-type-summary']) {
      const fileTypes = processors['file-type-summary'];
      const totalFiles = Object.values(fileTypes).reduce((sum, ft) => sum + ft.files, 0);
      const totalErrors = Object.values(fileTypes).reduce((sum, ft) => sum + ft.errors, 0);

      summary.insights.push({
        type: 'file-type-distribution',
        message: `Found ${totalErrors} errors across ${totalFiles} files in ${Object.keys(fileTypes).length} file types`,
        breakdown: fileTypes
      });
    }

    // Pattern insights
    if (processors['pattern-frequency']) {
      const patterns = processors['pattern-frequency'];
      const topPatterns = Object.entries(patterns)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5);

      summary.insights.push({
        type: 'top-error-patterns',
        message: `Top 5 error patterns: ${topPatterns.map(([p, c]) => `${p}(${c})`).join(', ')}`,
        details: topPatterns
      });
    }

    // Severity insights
    if (processors['severity-distribution']) {
      const severity = processors['severity-distribution'];
      const criticalCount = severity.CRITICAL || 0;
      const highCount = severity.HIGH || 0;

      if (criticalCount > 0 || highCount > 0) {
        summary.insights.push({
          type: 'severity-alert',
          message: `Found ${criticalCount} critical and ${highCount} high severity errors`,
          severity
        });
      }
    }

    // Hotspot insights
    if (processors['error-hotspots'] && processors['error-hotspots'].length > 0) {
      const hotspots = processors['error-hotspots'];
      summary.insights.push({
        type: 'error-hotspots',
        message: `Top error hotspot: ${hotspots[0].file} (${hotspots[0].errorCount} errors)`,
        top5: hotspots.slice(0, 5)
      });
    }

    return summary;
  }
}

// Command-line interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: node awk-post-processor.mjs <input-file> [output-pattern]');
    console.log('Example: node awk-post-processor.mjs analysis/adaptive-error-analysis.json');
    process.exit(1);
  }

  const inputFile = args[0];
  const outputPattern = args[1] ? new RegExp(args[1]) : null;

  console.log('🔧 AWK-Style Post-Processor');
  console.log('=' .repeat(40));

  const processor = new AWKStyleProcessor();
  const results = await processor.processFile(inputFile, outputPattern);
  const summary = processor.generateSummary(results);

  // Save processed results
  const outputFile = inputFile.replace('.json', '-processed.json');
  await fs.writeFile(outputFile, JSON.stringify(results, null, 2));

  console.log(`💾 Processed results saved to: ${outputFile}`);

  // Print summary
  console.log('\n📊 Summary:');
  summary.insights.forEach((insight, i) => {
    console.log(`   ${i + 1}. ${insight.message}`);
  });

  // Save summary
  const summaryFile = inputFile.replace('.json', '-summary.json');
  await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));
  console.log(`💾 Summary saved to: ${summaryFile}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { AWKStyleProcessor };