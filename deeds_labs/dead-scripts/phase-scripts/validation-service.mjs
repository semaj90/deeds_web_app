#!/usr/bin/env node

/**
 * Validation Service: Runs comprehensive checks and generates
 * pipeline snapshots for the Command Center
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class ValidationService {
  constructor() {
    this.outputDir = path.resolve(__dirname, '..', 'static', 'dev-graphs', 'validation');
    this.ensureOutputDir();
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      console.log(`📁 Created output directory: ${this.outputDir}`);
    }
  }

  runCommand(command, options = {}) {
    try {
      const result = execSync(command, {
        encoding: 'utf8',
        stdio: options.silent ? 'pipe' : 'inherit',
        ...options
      });
      return { success: true, output: result };
    } catch (error) {
      return { success: false, error: error.message, code: error.status };
    }
  }

  async runTscCheck() {
    console.log('🔍 Running TypeScript check...');
    const start = Date.now();
    const result = this.runCommand('npx tsc --noEmit --skipLibCheck', { silent: true });
    const duration = Date.now() - start;

    if (result.success) {
      return { ok: true, errors: 0, duration };
    } else {
      // Parse error count from output
      const errorMatch = result.error.match(/Found (\d+) errors?/);
      const errors = errorMatch ? parseInt(errorMatch[1]) : 1;
      return { ok: false, errors, duration, error: result.error };
    }
  }

  async runSvelteCheck() {
    console.log('🔍 Running Svelte check...');
    const start = Date.now();
    const result = this.runCommand('npx svelte-check --tsconfig ./tsconfig.json', { silent: true });
    const duration = Date.now() - start;

    if (result.success) {
      return { ok: true, errors: 0, warnings: 0, duration };
    } else {
      // Parse errors and warnings from output
      const errorMatch = (result.error || result.output || '').match(/(\d+) errors?/);
      const warningMatch = (result.error || result.output || '').match(/(\d+) warnings?/);
      const errors = errorMatch ? parseInt(errorMatch[1]) : 0;
      const warnings = warningMatch ? parseInt(warningMatch[1]) : 0;
      return { ok: errors === 0, errors, warnings, duration, error: result.error };
    }
  }

  async runBuildCheck() {
    console.log('🔍 Running build check...');
    const start = Date.now();
    const result = this.runCommand('npm run build', { silent: true });
    const duration = Date.now() - start;

    if (result.success) {
      return { ok: true, duration };
    } else {
      return { ok: false, duration, error: result.error };
    }
  }

  async runCoreChecks() {
    console.log('🔍 Running core route checks...');
    const start = Date.now();
    const result = this.runCommand('npm run check:core', { silent: true });
    const duration = Date.now() - start;

    if (result.success) {
      return { ok: true, errors: 0, duration };
    } else {
      const errorMatch = (result.error || result.output || '').match(/(\d+) errors?/);
      const errors = errorMatch ? parseInt(errorMatch[1]) : 1;
      return { ok: false, errors, duration, error: result.error };
    }
  }

  async generateSnapshot() {
    console.log('📊 Generating validation snapshot...');

    const timestamp = new Date().toISOString();
    const checks = {};

    // Run all checks
    checks.tsc = await this.runTscCheck();
    checks.svelteCheck = await this.runSvelteCheck();
    checks.build = await this.runBuildCheck();
    checks.coreRoutes = await this.runCoreChecks();

    const snapshot = {
      timestamp,
      phase: 'svelte5-migration',
      checks,
      summary: {
        totalChecks: Object.keys(checks).length,
        passedChecks: Object.values(checks).filter(c => c.ok).length,
        failedChecks: Object.values(checks).filter(c => !c.ok).length,
        totalErrors: Object.values(checks).reduce((sum, c) => sum + (c.errors || 0), 0)
      }
    };

    // Write latest snapshot
    const latestPath = path.join(this.outputDir, 'latest.json');
    fs.writeFileSync(latestPath, JSON.stringify(snapshot, null, 2));

    // Append to history
    const historyPath = path.join(this.outputDir, 'history.ndjson');
    const historyLine = JSON.stringify(snapshot) + '\n';
    fs.appendFileSync(historyPath, historyLine);

    console.log(`✅ Snapshot saved to ${latestPath}`);
    console.log(`📈 History updated at ${historyPath}`);

    return snapshot;
  }

  async run() {
    try {
      const snapshot = await this.generateSnapshot();

      console.log('\n📊 Validation Results:');
      console.log(`Phase: ${snapshot.phase}`);
      console.log(`Checks: ${snapshot.summary.passedChecks}/${snapshot.summary.totalChecks} passed`);
      console.log(`Total Errors: ${snapshot.summary.totalErrors}`);

      Object.entries(snapshot.checks).forEach(([name, result]) => {
        const status = result.ok ? '✅' : '❌';
        const errorInfo = result.errors ? ` (${result.errors} errors)` : '';
        console.log(`${status} ${name}: ${result.duration}ms${errorInfo}`);
      });

      return snapshot;
    } catch (error) {
      console.error('❌ Validation service failed:', error);
      process.exit(1);
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const service = new ValidationService();
  service.run();
}

export default ValidationService;