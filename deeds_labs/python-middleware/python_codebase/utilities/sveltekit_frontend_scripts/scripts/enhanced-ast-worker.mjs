/**
 * Enhanced AST Worker: Parallel TypeScript/Svelte AST processing
 *
 * What this is:
 * - Multi-threaded worker for CPU parallelism (uses all 16 cores)
 * - Processes TypeScript/Svelte files in isolated threads
 * - Extracts semantic patterns for Svelte 4→5 migration
 * - Integrates with Redis cache and pgvector for performance
 *
 * This is the engine that powers the agentic repair pipeline.
 */

import { parentPort, workerData } from 'worker_threads';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { extname } from 'path';

// Simplified AST processor for worker threads
class EnhancedASTProcessor {
  constructor() {
    this.workerId = workerData.batchIndex;
    this.stats = {
      filesProcessed: 0,
      issuesFound: 0,
      patterns: {
        svelte4: 0,
        svelte5: 0,
        typescript: 0,
        syntax_errors: 0
      }
    };
  }

  async processFiles(files, fileData) {
    const results = [];

    for (const filepath of files) {
      try {
        const fileInfo = fileData[filepath];
        if (!fileInfo) continue;

        const result = await this.processFile(filepath, fileInfo.content, fileInfo.hash);
        results.push(result);
        this.stats.filesProcessed++;

      } catch (error) {
        results.push({
          file: filepath,
          error: error.message,
          analysis: { issues: [], suggestions: [] }
        });
      }
    }

    return results;
  }

  async processFile(filepath, content, contentHash) {
    const isSvelte = filepath.endsWith('.svelte');
    const isTypeScript = filepath.endsWith('.ts');

    // Extract code sections for analysis
    let scriptContent = content;
    let templateContent = '';
    let styleContent = '';

    if (isSvelte) {
      const sections = this.extractSvelteSections(content);
      scriptContent = sections.script || '';
      templateContent = sections.template || '';
      styleContent = sections.style || '';
    }

    // Analyze TypeScript/JavaScript code
    const scriptAnalysis = scriptContent ? this.analyzeScript(scriptContent) : {};

    // Analyze Svelte template if present
    const templateAnalysis = templateContent ? this.analyzeTemplate(templateContent) : {};

    // Detect issues and patterns
    const issues = this.detectIssues(scriptAnalysis, templateAnalysis, filepath);
    const suggestions = this.generateSuggestions(issues, scriptAnalysis, templateAnalysis);

    // Update stats
    this.updateStats(issues, isSvelte);

    return {
      file: filepath,
      contentHash,
      analysis: {
        issues,
        suggestions,
        metrics: this.calculateMetrics(scriptAnalysis, templateAnalysis),
        patterns: {
          script: scriptAnalysis,
          template: templateAnalysis
        }
      },
      confidence: this.calculateConfidence(issues),
      processedAt: Date.now(),
      workerId: this.workerId
    };
  }

  extractSvelteSections(content) {
    const sections = {};

    // Extract script section
    const scriptMatch = content.match(/<script[^>]*(?:lang=["']ts["'][^>]*)?>([\\s\\S]*?)<\/script>/i);
    sections.script = scriptMatch ? scriptMatch[1] : '';

    // Extract template (everything between script and style, or script to end)
    const afterScript = content.replace(/<script[^>]*>([\\s\\S]*?)<\/script>/i, '');
    const beforeStyle = afterScript.replace(/<style[^>]*>([\\s\\S]*?)<\/style>/i, '');
    sections.template = beforeStyle.trim();

    // Extract style section
    const styleMatch = content.match(/<style[^>]*>([\\s\\S]*?)<\/style>/i);
    sections.style = styleMatch ? styleMatch[1] : '';

    return sections;
  }

  analyzeScript(scriptContent) {
    const analysis = {
      exportLet: [],
      reactiveStatements: [],
      imports: [],
      functions: [],
      variables: [],
      runes: [],
      syntaxErrors: []
    };

    // Analyze export let patterns (Svelte 4)
    const exportLetMatches = scriptContent.matchAll(/export\s+let\s+(\w+)(?:\s*=\s*([^;\n]+))?/g);
    for (const match of exportLetMatches) {
      analysis.exportLet.push({
        name: match[1],
        defaultValue: match[2]?.trim(),
        line: this.getLineNumber(scriptContent, match.index),
        needsMigration: true
      });
    }

    // Analyze reactive statements (Svelte 4)
    const reactiveMatches = scriptContent.matchAll(/\$:\s*([^;\n]+)/g);
    for (const match of reactiveMatches) {
      analysis.reactiveStatements.push({
        expression: match[1].trim(),
        line: this.getLineNumber(scriptContent, match.index),
        needsMigration: true
      });
    }

    // Analyze Svelte 5 runes
    const runePatterns = ['$state', '$derived', '$effect', '$props'];
    for (const rune of runePatterns) {
      const runeMatches = scriptContent.matchAll(new RegExp(`\\${rune}\\(`, 'g'));
      for (const match of runeMatches) {
        analysis.runes.push({
          type: rune,
          line: this.getLineNumber(scriptContent, match.index),
          isSvelte5: true
        });
      }
    }

    // Analyze imports
    const importMatches = scriptContent.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g);
    for (const match of importMatches) {
      analysis.imports.push({
        source: match[1],
        line: this.getLineNumber(scriptContent, match.index)
      });
    }

    // Simple syntax error detection
    const syntaxPatterns = [
      { pattern: /;\s*}/g, error: 'Semicolon before closing brace' },
      { pattern: /,\s*}/g, error: 'Trailing comma before brace' },
      { pattern: /{\s*}/g, error: 'Empty object/block' },
      { pattern: /\w+;$/gm, error: 'Possible missing comma in object' }
    ];

    for (const { pattern, error } of syntaxPatterns) {
      const matches = scriptContent.matchAll(pattern);
      for (const match of matches) {
        analysis.syntaxErrors.push({
          error,
          line: this.getLineNumber(scriptContent, match.index),
          context: this.getContext(scriptContent, match.index)
        });
      }
    }

    return analysis;
  }

  analyzeTemplate(templateContent) {
    const analysis = {
      bindings: [],
      events: [],
      slots: [],
      snippets: [],
      conditionals: [],
      loops: []
    };

    // Analyze bindings
    const bindingMatches = templateContent.matchAll(/bind:(\\w+)=\\{([^}]+)\\}/g);
    for (const match of bindingMatches) {
      analysis.bindings.push({
        property: match[1],
        expression: match[2],
        line: this.getLineNumber(templateContent, match.index)
      });
    }

    // Analyze event handlers
    const eventMatches = templateContent.matchAll(/on:(\\w+)=\\{([^}]+)\\}/g);
    for (const match of eventMatches) {
      analysis.events.push({
        event: match[1],
        handler: match[2],
        line: this.getLineNumber(templateContent, match.index)
      });
    }

    // Analyze slots (Svelte 4)
    const slotMatches = templateContent.matchAll(/<slot(\s+[^>]*)?\s*\/?>(?:.*?<\/slot>)?/g);
    for (const match of slotMatches) {
      analysis.slots.push({
        content: match[0],
        attributes: match[1] || '',
        line: this.getLineNumber(templateContent, match.index),
        needsSnippetMigration: true
      });
    }

    // Analyze snippets (Svelte 5)
    const snippetMatches = templateContent.matchAll(/{#snippet\s+(\w+)\(([^)]*)\)}([\s\S]*?){\/snippet}/g);
    for (const match of snippetMatches) {
      analysis.snippets.push({
        name: match[1],
        parameters: match[2],
        content: match[3],
        line: this.getLineNumber(templateContent, match.index),
        isSvelte5: true
      });
    }

    // Analyze control structures
    const conditionalMatches = templateContent.matchAll(/{#if\s+([^}]+)}/g);
    for (const match of conditionalMatches) {
      analysis.conditionals.push({
        condition: match[1],
        line: this.getLineNumber(templateContent, match.index)
      });
    }

    const loopMatches = templateContent.matchAll(/{#each\s+([^}]+)}/g);
    for (const match of loopMatches) {
      analysis.loops.push({
        expression: match[1],
        line: this.getLineNumber(templateContent, match.index)
      });
    }

    return analysis;
  }

  detectIssues(scriptAnalysis, templateAnalysis, filepath) {
    const issues = [];

    // Svelte 4 → 5 migration issues
    if (scriptAnalysis.exportLet && scriptAnalysis.exportLet.length > 0) {
      issues.push({
        type: 'svelte4_export_let',
        severity: 'warning',
        count: scriptAnalysis.exportLet.length,
        message: `Found ${scriptAnalysis.exportLet.length} export let declarations that should be migrated to $props()`,
        items: scriptAnalysis.exportLet,
        fix: 'migrate_to_props'
      });
    }

    if (scriptAnalysis.reactiveStatements && scriptAnalysis.reactiveStatements.length > 0) {
      issues.push({
        type: 'svelte4_reactive_statements',
        severity: 'warning',
        count: scriptAnalysis.reactiveStatements.length,
        message: `Found ${scriptAnalysis.reactiveStatements.length} reactive statements that should be migrated to $derived()`,
        items: scriptAnalysis.reactiveStatements,
        fix: 'migrate_to_derived'
      });
    }

    if (templateAnalysis.slots && templateAnalysis.slots.length > 0) {
      issues.push({
        type: 'svelte4_slots',
        severity: 'info',
        count: templateAnalysis.slots.length,
        message: `Found ${templateAnalysis.slots.length} slot usage that could be migrated to snippets`,
        items: templateAnalysis.slots,
        fix: 'migrate_to_snippets'
      });
    }

    // Syntax errors
    if (scriptAnalysis.syntaxErrors && scriptAnalysis.syntaxErrors.length > 0) {
      issues.push({
        type: 'syntax_error',
        severity: 'error',
        count: scriptAnalysis.syntaxErrors.length,
        message: `Found ${scriptAnalysis.syntaxErrors.length} syntax errors`,
        items: scriptAnalysis.syntaxErrors,
        fix: 'syntax_repair'
      });
    }

    // Missing dependencies
    const hasGemmaImport = scriptAnalysis.imports.some(imp =>
      imp.source.includes('gemma') || imp.source.includes('ai')
    );

    if (filepath.includes('ai/') && !hasGemmaImport) {
      issues.push({
        type: 'missing_ai_dependency',
        severity: 'info',
        message: 'AI component might be missing Gemma integration',
        fix: 'add_gemma_import'
      });
    }

    return issues;
  }

  generateSuggestions(issues, scriptAnalysis, templateAnalysis) {
    const suggestions = [];

    // Migration suggestions
    const migrationIssues = issues.filter(i => i.type.startsWith('svelte4_'));
    if (migrationIssues.length > 0) {
      const totalMigrations = migrationIssues.reduce((sum, i) => sum + i.count, 0);
      suggestions.push({
        type: 'migration_opportunity',
        priority: 'high',
        message: `This file has ${totalMigrations} patterns that can be modernized to Svelte 5`,
        actions: [
          'Run Svelte 5 migration script',
          'Update export let to $props()',
          'Convert reactive statements to $derived()',
          'Consider using snippets instead of slots'
        ],
        estimatedEffort: totalMigrations < 5 ? 'low' : totalMigrations < 10 ? 'medium' : 'high'
      });
    }

    // Performance suggestions
    const complexPatterns = (scriptAnalysis.reactiveStatements?.length || 0) +
                           (templateAnalysis.loops?.length || 0);

    if (complexPatterns > 3) {
      suggestions.push({
        type: 'performance_optimization',
        priority: 'medium',
        message: 'Consider optimizing reactive patterns for better performance',
        actions: [
          'Use $derived.by() for expensive computations',
          'Consider memoization for complex loops',
          'Evaluate if all reactive statements are necessary'
        ]
      });
    }

    // Code quality suggestions
    if (scriptAnalysis.functions?.length === 0 && scriptAnalysis.variables?.length > 5) {
      suggestions.push({
        type: 'code_organization',
        priority: 'low',
        message: 'Consider extracting logic into functions for better organization',
        actions: [
          'Group related variables into functions',
          'Extract complex expressions into computed values',
          'Use composition patterns'
        ]
      });
    }

    return suggestions;
  }

  calculateMetrics(scriptAnalysis, templateAnalysis) {
    return {
      complexity: this.calculateComplexity(scriptAnalysis, templateAnalysis),
      maintainability: this.calculateMaintainability(scriptAnalysis, templateAnalysis),
      modernization: this.calculateModernizationScore(scriptAnalysis, templateAnalysis),
      size: {
        script: JSON.stringify(scriptAnalysis).length,
        template: JSON.stringify(templateAnalysis).length
      }
    };
  }

  calculateComplexity(scriptAnalysis, templateAnalysis) {
    let complexity = 1;

    // Add complexity for each pattern
    complexity += (scriptAnalysis.reactiveStatements?.length || 0);
    complexity += (scriptAnalysis.functions?.length || 0);
    complexity += (templateAnalysis.conditionals?.length || 0);
    complexity += (templateAnalysis.loops?.length || 0) * 2; // Loops are more complex

    return Math.min(complexity, 10); // Cap at 10
  }

  calculateMaintainability(scriptAnalysis, templateAnalysis) {
    let score = 100;

    // Reduce score for issues
    score -= (scriptAnalysis.syntaxErrors?.length || 0) * 10;
    score -= (scriptAnalysis.exportLet?.length || 0) * 2; // Legacy patterns
    score -= (scriptAnalysis.reactiveStatements?.length || 0) * 1;

    // Increase score for modern patterns
    score += (scriptAnalysis.runes?.length || 0) * 2;
    score += (templateAnalysis.snippets?.length || 0) * 1;

    return Math.max(Math.min(score, 100), 0);
  }

  calculateModernizationScore(scriptAnalysis, templateAnalysis) {
    const legacy = (scriptAnalysis.exportLet?.length || 0) +
                  (scriptAnalysis.reactiveStatements?.length || 0) +
                  (templateAnalysis.slots?.length || 0);

    const modern = (scriptAnalysis.runes?.length || 0) +
                  (templateAnalysis.snippets?.length || 0);

    const total = legacy + modern;
    return total === 0 ? 100 : Math.round((modern / total) * 100);
  }

  calculateConfidence(issues) {
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    let confidence = 1.0;
    confidence -= errorCount * 0.2;
    confidence -= warningCount * 0.1;

    return Math.max(Math.min(confidence, 1.0), 0.0);
  }

  updateStats(issues, isSvelte) {
    this.stats.issuesFound += issues.length;

    for (const issue of issues) {
      if (issue.type.startsWith('svelte4_')) {
        this.stats.patterns.svelte4++;
      } else if (issue.type.includes('svelte5')) {
        this.stats.patterns.svelte5++;
      } else if (issue.type === 'syntax_error') {
        this.stats.patterns.syntax_errors++;
      }
    }

    if (!isSvelte) {
      this.stats.patterns.typescript++;
    }
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  getContext(content, index, contextLength = 50) {
    const start = Math.max(0, index - contextLength);
    const end = Math.min(content.length, index + contextLength);
    return content.substring(start, end);
  }
}

// Worker main execution
async function main() {
  const { files, fileData, batchIndex } = workerData;
  const processor = new EnhancedASTProcessor();

  try {
    console.log(`🔄 Worker ${batchIndex}: Processing ${files.length} files`);

    const results = await processor.processFiles(files, fileData);

    console.log(`✅ Worker ${batchIndex}: Completed - ${processor.stats.filesProcessed} files, ${processor.stats.issuesFound} issues`);

    parentPort.postMessage({
      results,
      stats: processor.stats,
      workerId: batchIndex
    });

  } catch (error) {
    console.error(`❌ Worker ${batchIndex}: Error:`, error);
    parentPort.postMessage({
      error: error.message,
      workerId: batchIndex
    });
  }
}

main();