#!/usr/bin/env node
/**
 * Agentic Programming Orchestrator
 *
 * Coordinates:
 * - Multi-process parallelism (16 cores)
 * - GPU-accelerated semantic analysis (RTX 3060)
 * - Tree-sitter AST parsing
 * - LLM-powered code generation (Gemma3:legal-latest)
 *
 * Performance target: Process 1000+ files in <30 seconds
 */

import { readFile, writeFile } from 'fs/promises';
import { glob } from 'glob';
import { cpus } from 'os';
import { performance } from 'perf_hooks';

import { TreeSitterProcessor } from './tree-sitter-processor.mjs';
import { GPUSemanticProcessor } from './gpu-semantic-processor.mjs';

class AgenticOrchestrator {
  constructor(options = {}) {
    this.options = {
      maxWorkers: options.maxWorkers || Math.min(cpus().length, 16),
      gpuBatchSize: options.gpuBatchSize || 128,
      useGPU: options.useGPU ?? true,
      verbose: options.verbose ?? true,
      dryRun: options.dryRun ?? false,
      ...options
    };

    this.treeProcessor = new TreeSitterProcessor();
    this.gpuProcessor = new GPUSemanticProcessor();

    this.stats = {
      startTime: 0,
      endTime: 0,
      filesProcessed: 0,
      issuesFound: 0,
      fixesApplied: 0,
      processingMethods: {
        gpu: 0,
        cpu: 0,
        hybrid: 0
      }
    };

    this.log('🤖 Agentic Programming Orchestrator initialized', {
      maxWorkers: this.options.maxWorkers,
      gpuEnabled: this.options.useGPU,
      batchSize: this.options.gpuBatchSize
    });
  }

  /**
   * Main orchestration pipeline
   */
  async processCodebase(pattern = 'src/**/*.{ts,svelte,js}') {
    this.stats.startTime = performance.now();

    try {
      // Phase 1: Discovery & Planning
      const files = await this.discoverFiles(pattern);
      const processingPlan = await this.createProcessingPlan(files);

      // Phase 2: Parallel Analysis Pipeline
      const analysisResults = await this.executeAnalysisPipeline(processingPlan);

      // Phase 3: LLM-Powered Fix Generation
      const fixes = await this.generateFixes(analysisResults);

      // Phase 4: Application & Validation
      const applicationResults = await this.applyFixes(fixes);

      // Phase 5: Report Generation
      const report = await this.generateReport(applicationResults);

      this.stats.endTime = performance.now();
      return report;

    } catch (error) {
      this.log('❌ Orchestration failed:', error);
      throw error;
    }
  }

  async discoverFiles(pattern) {
    this.log('📁 Discovering files...', { pattern });

    const files = await glob(pattern, {
      ignore: [
        'node_modules/**',
        '.svelte-kit/**',
        'dist/**',
        'build/**',
        '**/*.min.js',
        '**/*.d.ts'
      ]
    });

    const fileData = await Promise.all(files.map(async (filepath) => {
      const content = await readFile(filepath, 'utf-8');
      const stats = {
        size: content.length,
        lines: content.split('\n').length,
        isSvelte: filepath.endsWith('.svelte'),
        isTypeScript: filepath.endsWith('.ts')
      };

      return { filepath, content, stats };
    }));

    this.log(`✅ Discovered ${fileData.length} files`, {
      totalSize: fileData.reduce((sum, f) => sum + f.stats.size, 0),
      svelte: fileData.filter(f => f.stats.isSvelte).length,
      typescript: fileData.filter(f => f.stats.isTypeScript).length
    });

    return fileData;
  }

  async createProcessingPlan(files) {
    this.log('📋 Creating processing plan...');

    // Sort files by complexity/size for optimal batch processing
    const sortedFiles = files.sort((a, b) => b.stats.size - a.stats.size);

    // Create processing strategy based on file characteristics
    const plan = {
      // Large files: Individual GPU processing
      gpuBatch: sortedFiles.filter(f =>
        f.stats.size > 10000 || f.stats.lines > 500
      ).slice(0, this.options.gpuBatchSize),

      // Medium files: Parallel CPU processing
      cpuBatch: sortedFiles.filter(f =>
        f.stats.size > 1000 && f.stats.size <= 10000
      ),

      // Small files: Sequential processing
      sequentialBatch: sortedFiles.filter(f =>
        f.stats.size <= 1000
      )
    };

    this.log('📊 Processing plan created', {
      gpuBatch: plan.gpuBatch.length,
      cpuBatch: plan.cpuBatch.length,
      sequential: plan.sequentialBatch.length
    });

    return plan;
  }

  async executeAnalysisPipeline(plan) {
    this.log('🔄 Executing analysis pipeline...');

    const results = [];

    // GPU-accelerated batch processing (highest priority)
    if (this.options.useGPU && plan.gpuBatch.length > 0) {
      try {
        this.log('🚀 Starting GPU batch processing...', { count: plan.gpuBatch.length });

        const tensorBatch = await this.gpuProcessor.codeToTensorBatch(plan.gpuBatch);
        const gpuResults = await this.gpuProcessor.processTensorBatch(tensorBatch);

        results.push(...gpuResults.results);
        this.stats.processingMethods.gpu += plan.gpuBatch.length;

        this.log('✅ GPU batch completed', {
          processed: gpuResults.processed_count,
          time: gpuResults.processing_time_ms + 'ms'
        });

      } catch (error) {
        this.log('⚠️ GPU processing failed, falling back to CPU:', error.message);

        // Add GPU batch to CPU batch for fallback
        plan.cpuBatch.push(...plan.gpuBatch);
        this.stats.processingMethods.cpu += plan.gpuBatch.length;
      }
    }

    // Parallel CPU processing (medium files)
    if (plan.cpuBatch.length > 0) {
      this.log('🔄 Starting parallel CPU processing...', { count: plan.cpuBatch.length });

      const cpuResults = await this.treeProcessor.processBatchWithGPU(plan.cpuBatch);
      results.push(...cpuResults);
      this.stats.processingMethods.cpu += plan.cpuBatch.length;

      this.log('✅ CPU parallel processing completed');
    }

    // Sequential processing (small files)
    if (plan.sequentialBatch.length > 0) {
      this.log('🔄 Starting sequential processing...', { count: plan.sequentialBatch.length });

      for (const file of plan.sequentialBatch) {
        const ast = await this.treeProcessor.parseFile(file.filepath, file.content);
        const analysis = this.analyzeAST(ast);

        results.push({
          file: file.filepath,
          analysis,
          confidence: 0.90
        });
      }

      this.stats.processingMethods.hybrid += plan.sequentialBatch.length;
      this.log('✅ Sequential processing completed');
    }

    this.stats.filesProcessed = results.length;
    this.stats.issuesFound = results.reduce((sum, r) => sum + (r.analysis?.issues?.length || 0), 0);

    return results;
  }

  analyzeAST(ast) {
    // Lightweight AST analysis for sequential processing
    const issues = [];
    const suggestions = [];

    if (ast.metadata?.svelteVersion === 4) {
      const migrationCount = (ast.metadata.exports?.length || 0) +
                           (ast.body?.filter(n => n.type === 'ReactiveStatement').length || 0);

      if (migrationCount > 0) {
        issues.push({
          type: 'svelte4_patterns',
          count: migrationCount,
          severity: 'warning',
          fixes: ['migrate_to_svelte5']
        });

        suggestions.push({
          type: 'migration_opportunity',
          message: `Found ${migrationCount} patterns that can be modernized to Svelte 5`,
          priority: 'high'
        });
      }
    }

    return {
      issues,
      suggestions,
      metrics: {
        complexity: ast.metadata?.complexity || 1,
        nodeCount: ast.metadata?.nodeCount || 0
      }
    };
  }

  async generateFixes(analysisResults) {
    this.log('🧠 Generating LLM-powered fixes...', {
      resultsCount: analysisResults.length
    });

    const fixes = [];

    // Process issues in parallel batches
    const issueGroups = this.groupIssuesByType(analysisResults);

    for (const [issueType, group] of Object.entries(issueGroups)) {
      if (group.length === 0) continue;

      this.log(`🔧 Generating fixes for ${issueType}...`, { count: group.length });

      try {
        const batchFixes = await this.generateFixBatch(issueType, group);
        fixes.push(...batchFixes);

      } catch (error) {
        this.log(`⚠️ Fix generation failed for ${issueType}:`, error.message);
      }
    }

    this.stats.fixesApplied = fixes.length;

    return fixes;
  }

  groupIssuesByType(results) {
    const groups = {};

    for (const result of results) {
      for (const issue of result.analysis?.issues || []) {
        if (!groups[issue.type]) {
          groups[issue.type] = [];
        }

        groups[issue.type].push({
          file: result.file,
          issue,
          confidence: result.confidence
        });
      }
    }

    return groups;
  }

  async generateFixBatch(issueType, issueGroup) {
    // LLM-powered fix generation using Gemma3:legal-latest
    const prompt = this.createFixPrompt(issueType, issueGroup);

    try {
      // Integration with your existing Gemma3 model
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma3:legal-latest',
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.1, // Low temperature for precise code generation
            top_p: 0.9,
            max_tokens: 2048
          }
        })
      });

      const llmResult = await response.json();
      const fixes = this.parseLLMFixes(llmResult.response, issueGroup);

      return fixes;

    } catch (error) {
      this.log('❌ LLM fix generation failed:', error.message);

      // Fallback to rule-based fixes
      return this.generateRuleBasedFixes(issueType, issueGroup);
    }
  }

  createFixPrompt(issueType, issueGroup) {
    const examples = issueGroup.slice(0, 3); // Include a few examples

    return `
You are an expert TypeScript and Svelte developer. Generate precise code fixes for the following ${issueType} issues:

Issue Type: ${issueType}
Count: ${issueGroup.length}

Examples:
${examples.map(item => `
File: ${item.file}
Issue: ${JSON.stringify(item.issue, null, 2)}
`).join('\n')}

Generate specific, applicable fixes that:
1. Preserve existing functionality
2. Follow Svelte 5 best practices
3. Maintain type safety
4. Are production-ready

Return fixes in JSON format:
{
  "fixes": [
    {
      "file": "path/to/file",
      "type": "replace",
      "old": "code to replace",
      "new": "replacement code",
      "line": 123,
      "confidence": 0.95
    }
  ]
}
`;
  }

  parseLLMFixes(llmResponse, issueGroup) {
    try {
      // Extract JSON from LLM response
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.fixes || [];

    } catch (error) {
      this.log('⚠️ Failed to parse LLM fixes:', error.message);
      return this.generateRuleBasedFixes('fallback', issueGroup);
    }
  }

  generateRuleBasedFixes(issueType, issueGroup) {
    // Rule-based fallback fixes
    const fixes = [];

    for (const item of issueGroup) {
      switch (issueType) {
        case 'svelte4_patterns':
        case 'svelte4_export_let':
          fixes.push({
            file: item.file,
            type: 'migrate_export_let',
            message: 'Convert export let to $props()',
            confidence: 0.85
          });
          break;

        case 'svelte4_reactive_statements':
          fixes.push({
            file: item.file,
            type: 'migrate_reactive',
            message: 'Convert $: to $derived()',
            confidence: 0.85
          });
          break;

        default:
          fixes.push({
            file: item.file,
            type: 'generic_fix',
            message: `Apply fix for ${issueType}`,
            confidence: 0.70
          });
      }
    }

    return fixes;
  }

  async applyFixes(fixes) {
    if (this.options.dryRun) {
      this.log('🔍 DRY RUN: Would apply fixes:', { count: fixes.length });
      return fixes.map(fix => ({ ...fix, applied: false, dryRun: true }));
    }

    this.log('✏️ Applying fixes...', { count: fixes.length });

    const results = [];

    for (const fix of fixes) {
      try {
        const result = await this.applyFix(fix);
        results.push(result);

        if (result.applied) {
          this.log(`✅ Applied fix to ${fix.file}`);
        }

      } catch (error) {
        this.log(`❌ Failed to apply fix to ${fix.file}:`, error.message);
        results.push({ ...fix, applied: false, error: error.message });
      }
    }

    const appliedCount = results.filter(r => r.applied).length;
    this.log(`🎯 Applied ${appliedCount}/${fixes.length} fixes`);

    return results;
  }

  async applyFix(fix) {
    // Apply individual fix to file
    const content = await readFile(fix.file, 'utf-8');
    let modifiedContent = content;
    let applied = false;

    switch (fix.type) {
      case 'replace':
        if (content.includes(fix.old)) {
          modifiedContent = content.replace(fix.old, fix.new);
          applied = true;
        }
        break;

      case 'migrate_export_let':
        // Apply Svelte 5 migration patterns
        modifiedContent = this.applyExportLetMigration(content);
        applied = modifiedContent !== content;
        break;

      case 'migrate_reactive':
        modifiedContent = this.applyReactiveMigration(content);
        applied = modifiedContent !== content;
        break;

      default:
        this.log(`⚠️ Unknown fix type: ${fix.type}`);
    }

    if (applied) {
      await writeFile(fix.file, modifiedContent);
    }

    return { ...fix, applied, originalSize: content.length, newSize: modifiedContent.length };
  }

  applyExportLetMigration(content) {
    // Convert: export let prop = default;
    // To: let { prop = default } = $props();

    return content.replace(
      /export\s+let\s+(\w+)(?:\s*=\s*([^;]+))?\s*;/g,
      (match, propName, defaultValue) => {
        const defaultPart = defaultValue ? ` = ${defaultValue}` : '';
        return `let { ${propName}${defaultPart} } = $props();`;
      }
    );
  }

  applyReactiveMigration(content) {
    // Convert: $: reactive = expression;
    // To: let reactive = $derived(expression);

    return content.replace(
      /\$:\s*(\w+)\s*=\s*([^;]+);/g,
      (match, varName, expression) => {
        return `let ${varName} = $derived(${expression});`;
      }
    );
  }

  async generateReport(results) {
    const report = {
      summary: {
        totalTime: (this.stats.endTime - this.stats.startTime) / 1000,
        filesProcessed: this.stats.filesProcessed,
        issuesFound: this.stats.issuesFound,
        fixesApplied: this.stats.fixesApplied,
        processingMethods: this.stats.processingMethods
      },
      performance: {
        filesPerSecond: this.stats.filesProcessed / ((this.stats.endTime - this.stats.startTime) / 1000),
        avgTimePerFile: (this.stats.endTime - this.stats.startTime) / this.stats.filesProcessed,
        gpuAcceleration: this.stats.processingMethods.gpu > 0
      },
      results: results.filter(r => r.applied).map(r => ({
        file: r.file,
        type: r.type,
        confidence: r.confidence
      }))
    };

    // Save detailed report
    const reportPath = 'agentic-processing-report.json';
    await writeFile(reportPath, JSON.stringify(report, null, 2));

    this.log('📊 Processing completed!', report.summary);
    this.log(`📄 Detailed report saved to: ${reportPath}`);

    return report;
  }

  log(message, data = {}) {
    if (!this.options.verbose) return;

    const timestamp = new Date().toISOString().substring(11, 23);
    console.log(`[${timestamp}] ${message}`);

    if (Object.keys(data).length > 0) {
      console.log('  ', JSON.stringify(data, null, 2));
    }
  }
}

// CLI Usage
async function main() {
  const args = process.argv.slice(2);
  const options = {
    pattern: args[0] || 'src/**/*.{ts,svelte}',
    useGPU: !args.includes('--no-gpu'),
    dryRun: args.includes('--dry-run'),
    verbose: !args.includes('--quiet'),
    maxWorkers: parseInt(args.find(a => a.startsWith('--workers='))?.split('=')[1]) || 16
  };

  const orchestrator = new AgenticOrchestrator(options);

  try {
    const report = await orchestrator.processCodebase(options.pattern);

    console.log('\n🎉 Agentic Processing Complete!');
    console.log(`⚡ Processed ${report.summary.filesProcessed} files in ${report.summary.totalTime.toFixed(2)}s`);
    console.log(`🔧 Applied ${report.summary.fixesApplied} fixes`);
    console.log(`🚀 Performance: ${report.performance.filesPerSecond.toFixed(1)} files/sec`);

    process.exit(0);

  } catch (error) {
    console.error('💥 Agentic processing failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { AgenticOrchestrator };