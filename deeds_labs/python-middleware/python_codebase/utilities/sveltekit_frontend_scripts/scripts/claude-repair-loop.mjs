#!/usr/bin/env node
/**
 * Claude Code Repair Loop Integration
 *
 * This script enables Claude Code (inside VS Code) to act as an agentic repair loop:
 * 1. Detects errors in the Problems panel
 * 2. Calls the agentic repair scripts
 * 3. Validates via tsc --noEmit
 * 4. Iterates until errors drop significantly
 *
 * Integration points:
 * - VS Code Problems API via language server
 * - TypeScript compiler for validation
 * - Enhanced agentic orchestrator for fixes
 * - Real-time file watching for changes
 */

import { watch } from 'fs';
import { spawn, exec } from 'child_process';
import { readFile, writeFile, stat } from 'fs/promises';
import { join, relative } from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ClaudeRepairLoop {
  constructor(options = {}) {
    this.options = {
      watchMode: options.watch ?? false,
      autoFix: options.autoFix ?? false,
      maxIterations: options.maxIterations ?? 5,
      errorThreshold: options.errorThreshold ?? 10, // Stop when errors < 10
      validationTimeout: options.validationTimeout ?? 30000,
      cooldownMs: options.cooldownMs ?? 2000,
      verbose: options.verbose ?? true,
      ...options
    };

    this.state = {
      isRunning: false,
      currentIteration: 0,
      errorHistory: [],
      lastValidation: null,
      watchedFiles: new Set(),
      repairQueue: new Set()
    };

    this.log('🔧 Claude Code Repair Loop initialized', {
      watchMode: this.options.watchMode,
      autoFix: this.options.autoFix,
      maxIterations: this.options.maxIterations
    });
  }

  /**
   * Start the repair loop
   */
  async start() {
    this.log('[REPAIR-LOOP] Starting watch mode');

    if (this.options.watchMode) {
      await this.startWatchMode();
    } else {
      await this.runSinglePass();
    }
  }

  /**
   * Watch mode: continuously monitor for changes and repair
   */
  async startWatchMode() {
    this.state.isRunning = true;

    // Initial scan
    await this.runRepairIteration();

    // Set up file watchers
    this.setupFileWatchers();

    // Periodic validation
    setInterval(async () => {
      if (this.state.repairQueue.size > 0) {
        await this.runRepairIteration();
      }
    }, this.options.cooldownMs);

    this.log('[REPAIR-LOOP] Watch mode active - monitoring for changes');

    // Keep the process alive
    process.on('SIGINT', () => {
      this.log('[REPAIR-LOOP] Shutting down gracefully');
      this.state.isRunning = false;
      process.exit(0);
    });

    // Infinite loop to keep process alive in watch mode
    while (this.state.isRunning) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Single pass mode: run once then exit
   */
  async runSinglePass() {
    await this.runRepairIteration();
    this.log('[REPAIR-LOOP] Single pass completed');
  }

  /**
   * Set up file system watchers for TypeScript/Svelte files
   */
  setupFileWatchers() {
    const watchPatterns = ['src/**/*.{ts,js,svelte}', '**/*.d.ts'];

    // Watch TypeScript config changes
    watch('tsconfig.json', (eventType) => {
      if (eventType === 'change') {
        this.log('📝 tsconfig.json changed, queuing validation');
        this.state.repairQueue.add('tsconfig');
      }
    });

    // Watch source files
    this.watchDirectory('src', (filepath) => {
      if (filepath.match(/\\.(ts|js|svelte)$/)) {
        this.state.watchedFiles.add(filepath);
        this.state.repairQueue.add(filepath);
        this.log(`📝 File changed: ${relative(process.cwd(), filepath)}`);
      }
    });

    // Watch generated types
    this.watchDirectory('.svelte-kit/types', (filepath) => {
      if (filepath.endsWith('.d.ts')) {
        this.state.repairQueue.add(filepath);
        this.log(`🔄 Generated type changed: ${relative(process.cwd(), filepath)}`);
      }
    });
  }

  /**
   * Watch a directory recursively
   */
  watchDirectory(dirPath, callback) {
    try {
      watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (filename && eventType === 'change') {
          const fullPath = join(dirPath, filename);
          callback(fullPath);
        }
      });
    } catch (error) {
      this.log(`⚠️ Could not watch directory ${dirPath}:`, error.message);
    }
  }

  /**
   * Run a complete repair iteration
   */
  async runRepairIteration() {
    if (!this.state.isRunning && this.options.watchMode) {
      return;
    }

    this.state.currentIteration++;
    this.log(`\\n🔄 Repair Iteration ${this.state.currentIteration}/${this.options.maxIterations}`);

    try {
      // Step 1: Detect current errors
      const currentErrors = await this.detectProblems();
      this.state.errorHistory.push({
        iteration: this.state.currentIteration,
        errorCount: currentErrors.length,
        timestamp: Date.now(),
        errors: currentErrors
      });

      this.log(`📊 Current errors: ${currentErrors.length}`);

      // Step 2: Check if we should stop
      if (this.shouldStopIteration(currentErrors)) {
        this.log('✅ Repair loop stopping - error threshold reached or max iterations');
        this.state.isRunning = false;
        return;
      }

      // Step 3: Generate and apply fixes
      if (this.options.autoFix && currentErrors.length > 0) {
        await this.generateAndApplyFixes(currentErrors);
      }

      // Step 4: Validate fixes
      await this.validateFixes();

      // Step 5: Clear repair queue
      this.state.repairQueue.clear();

      this.log(`[REPAIR-LOOP] Iteration complete`);

    } catch (error) {
      this.log('❌ Repair iteration failed:', error.message);
    }
  }

  /**
   * Detect problems using TypeScript compiler and VS Code language server
   */
  async detectProblems() {
    const problems = [];

    try {
      // Run TypeScript check
      const tscResult = await this.runTypeScriptCheck();
      problems.push(...this.parseTscOutput(tscResult));

      // Run Svelte check if available
      try {
        const svelteResult = await this.runSvelteCheck();
        problems.push(...this.parseSvelteOutput(svelteResult));
      } catch (error) {
        this.log('⚠️ Svelte check not available:', error.message);
      }

    } catch (error) {
      this.log('❌ Problem detection failed:', error.message);
    }

    return problems;
  }

  /**
   * Run TypeScript compiler check
   */
  async runTypeScriptCheck() {
    try {
      const { stdout, stderr } = await execAsync('npx tsc --noEmit --skipLibCheck', {
        timeout: this.options.validationTimeout,
        cwd: process.cwd()
      });

      return { stdout, stderr, success: true };

    } catch (error) {
      // tsc returns non-zero exit code when there are errors
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        success: false,
        code: error.code
      };
    }
  }

  /**
   * Run Svelte check
   */
  async runSvelteCheck() {
    try {
      const { stdout, stderr } = await execAsync('npx svelte-check --output human', {
        timeout: this.options.validationTimeout,
        cwd: process.cwd()
      });

      return { stdout, stderr, success: true };

    } catch (error) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        success: false,
        code: error.code
      };
    }
  }

  /**
   * Parse TypeScript compiler output
   */
  parseTscOutput(result) {
    const problems = [];
    const lines = (result.stdout + result.stderr).split('\\n');

    for (const line of lines) {
      // Parse format: file.ts(line,col): error TS#### message
      const match = line.match(/^(.+?)\\((\\d+),(\\d+)\\):\\s+(error|warning)\\s+TS(\\d+):\\s*(.+)$/);

      if (match) {
        problems.push({
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          severity: match[4],
          code: `TS${match[5]}`,
          message: match[6].trim(),
          source: 'tsc'
        });
      }
    }

    return problems;
  }

  /**
   * Parse Svelte check output
   */
  parseSvelteOutput(result) {
    const problems = [];
    const lines = (result.stdout + result.stderr).split('\\n');

    for (const line of lines) {
      // Parse Svelte error format
      const match = line.match(/^(.+?):(\\d+):(\\d+)\\s+(Error|Warning):\\s*(.+)$/);

      if (match) {
        problems.push({
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          severity: match[4].toLowerCase(),
          message: match[5].trim(),
          source: 'svelte-check'
        });
      }
    }

    return problems;
  }

  /**
   * Check if we should stop the iteration loop
   */
  shouldStopIteration(currentErrors) {
    // Stop if we've hit max iterations
    if (this.state.currentIteration >= this.options.maxIterations) {
      return true;
    }

    // Stop if error count is below threshold
    if (currentErrors.length <= this.options.errorThreshold) {
      return true;
    }

    // Stop if errors aren't decreasing
    if (this.state.errorHistory.length >= 2) {
      const previous = this.state.errorHistory[this.state.errorHistory.length - 2];
      const current = this.state.errorHistory[this.state.errorHistory.length - 1];

      // If errors increased or stayed the same for 2 iterations
      if (current.errorCount >= previous.errorCount) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate and apply fixes using the agentic orchestrator
   */
  async generateAndApplyFixes(problems) {
    this.log('🤖 Generating fixes using agentic orchestrator...');

    try {
      // Group problems by file for efficient processing
      const fileGroups = this.groupProblemsByFile(problems);

      // Process each file group
      for (const [filepath, fileProblems] of Object.entries(fileGroups)) {
        this.log(`🔧 Processing ${fileProblems.length} issues in ${relative(process.cwd(), filepath)}`);

        await this.runAgenticFixer(filepath, fileProblems);
      }

    } catch (error) {
      this.log('❌ Fix generation failed:', error.message);
    }
  }

  /**
   * Group problems by file path
   */
  groupProblemsByFile(problems) {
    const groups = {};

    for (const problem of problems) {
      if (!groups[problem.file]) {
        groups[problem.file] = [];
      }
      groups[problem.file].push(problem);
    }

    return groups;
  }

  /**
   * Run the agentic fixer on a specific file
   */
  async runAgenticFixer(filepath, problems) {
    const args = [
      'scripts/enhanced-agentic-orchestrator.mjs',
      filepath,
      '--single-file',
      '--problems=' + JSON.stringify(problems),
      '--claude-integration'
    ];

    return new Promise((resolve, reject) => {
      const child = spawn('node', args, {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          this.log(`✅ Fixed issues in ${relative(process.cwd(), filepath)}`);
          resolve({ stdout, stderr });
        } else {
          this.log(`❌ Fix failed for ${relative(process.cwd(), filepath)}: ${stderr}`);
          reject(new Error(`Agentic fixer failed with code ${code}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Validate that fixes were applied successfully
   */
  async validateFixes() {
    this.log('🔍 Validating fixes...');

    const validationResult = await this.runTypeScriptCheck();
    const newErrors = this.parseTscOutput(validationResult);

    this.state.lastValidation = {
      timestamp: Date.now(),
      errorCount: newErrors.length,
      success: validationResult.success
    };

    this.log(`📊 Post-fix validation: ${newErrors.length} errors remaining`);

    // Output any remaining errors for VS Code Problems panel
    if (newErrors.length > 0) {
      for (const error of newErrors.slice(0, 5)) { // Show first 5
        this.log(`[REPAIR] ${error.severity}: ${error.message} in ${error.file}:${error.line}`);
      }

      if (newErrors.length > 5) {
        this.log(`[REPAIR] ... and ${newErrors.length - 5} more errors`);
      }
    }
  }

  /**
   * Generate repair report
   */
  generateReport() {
    const report = {
      summary: {
        totalIterations: this.state.currentIteration,
        startingErrors: this.state.errorHistory[0]?.errorCount || 0,
        finalErrors: this.state.errorHistory[this.state.errorHistory.length - 1]?.errorCount || 0,
        errorReduction: 0,
        success: false
      },
      iterations: this.state.errorHistory,
      watchedFiles: Array.from(this.state.watchedFiles),
      lastValidation: this.state.lastValidation
    };

    if (report.summary.startingErrors > 0) {
      report.summary.errorReduction = Math.round(
        ((report.summary.startingErrors - report.summary.finalErrors) / report.summary.startingErrors) * 100
      );
      report.summary.success = report.summary.finalErrors <= this.options.errorThreshold;
    }

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
    watch: args.includes('--watch'),
    autoFix: args.includes('--auto-fix'),
    verbose: !args.includes('--quiet'),
    maxIterations: parseInt(args.find(a => a.startsWith('--max-iterations='))?.split('=')[1]) || 5,
    errorThreshold: parseInt(args.find(a => a.startsWith('--threshold='))?.split('=')[1]) || 10
  };

  const repairLoop = new ClaudeRepairLoop(options);

  try {
    await repairLoop.start();

    if (!options.watch) {
      const report = repairLoop.generateReport();

      console.log('\\n📊 Claude Repair Loop Report:');
      console.log(`🔄 Iterations: ${report.summary.totalIterations}`);
      console.log(`📉 Error reduction: ${report.summary.errorReduction}%`);
      console.log(`✅ Success: ${report.summary.success ? 'Yes' : 'No'}`);

      process.exit(report.summary.success ? 0 : 1);
    }

  } catch (error) {
    console.error('💥 Claude repair loop failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ClaudeRepairLoop };