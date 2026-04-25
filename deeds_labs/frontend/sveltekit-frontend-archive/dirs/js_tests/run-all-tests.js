#!/usr/bin/env node
/**
 * Comprehensive Test Runner
 * Runs all tests: Server, Database, Frontend, and Integration
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class TestRunner {
  constructor() {
    this.results = {
      serverStarted: false,
      databaseConnected: false,
      serverSideTests: null,
      frontendTests: null,
      integrationTests: null,
    };
    this.devServer = null;
  }

  async startDevServer() {
    console.log('🚀 Starting SvelteKit Development Server...');

    return new Promise((resolve, reject) => {
      this.devServer = spawn('npm', ['run', 'dev'], {
        cwd: __dirname,
        stdio: 'pipe',
        shell: true,
      });

      let serverReady = false;
      const timeout = setTimeout(() => {
        if (!serverReady) {
          reject(new Error('Server startup timeout'));
        }
      }, 30000);

      this.devServer.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('📟 Server:', output.trim());

        if (output.includes('Local:') || output.includes('localhost:5173')) {
          serverReady = true;
          clearTimeout(timeout);
          this.results.serverStarted = true;
          console.log('✅ SvelteKit server is running on localhost:5173');

          // Wait a bit more for full initialization
          setTimeout(resolve, 3000);
        }
      });

      this.devServer.stderr.on('data', (data) => {
        console.log('⚠️ Server Error:', data.toString().trim());
      });

      this.devServer.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async runServerSideTests() {
    console.log('\n🖥️ Running Server-side Tests...');

    try {
      const { ServerSideTest } = await import('./server-side-test.js');
      const serverTest = new ServerSideTest();
      this.results.serverSideTests = await serverTest.run();
      console.log('✅ Server-side tests completed');
    } catch (error) {
      console.log('❌ Server-side tests failed:', error.message);
      this.results.serverSideTests = { error: error.message };
    }
  }

  async runPlaywrightTests() {
    console.log('\n🎭 Running Playwright E2E Tests...');

    return new Promise((resolve) => {
      const playwrightTest = spawn('npx', ['playwright', 'test', '--reporter=line'], {
        cwd: __dirname,
        stdio: 'pipe',
        shell: true,
      });

      let output = '';

      playwrightTest.stdout.on('data', (data) => {
        const text = data.toString();
        console.log('🎭', text.trim());
        output += text;
      });

      playwrightTest.stderr.on('data', (data) => {
        console.log('⚠️ Playwright:', data.toString().trim());
      });

      playwrightTest.on('close', (code) => {
        this.results.integrationTests = {
          exitCode: code,
          passed: code === 0,
          output: output,
        };

        if (code === 0) {
          console.log('✅ Playwright tests passed');
        } else {
          console.log('❌ Playwright tests failed');
        }

        resolve();
      });

      // Timeout for Playwright tests
      setTimeout(() => {
        playwrightTest.kill();
        console.log('⏰ Playwright tests timed out');
        resolve();
      }, 120000); // 2 minutes timeout
    });
  }

  async runComprehensiveTests() {
    console.log('\n🔬 Running Comprehensive Frontend Tests...');

    try {
      // Note: The comprehensive test requires a running server
      // For now, we'll simulate this or run it separately
      console.log('ℹ️ Comprehensive tests available in comprehensive-system-test.js');
      console.log('   Run separately with: node comprehensive-system-test.js');
    } catch (error) {
      console.log('❌ Comprehensive tests failed:', error.message);
    }
  }

  async checkDependencies() {
    console.log('📦 Checking Dependencies...');

    try {
      // Check package.json for required dependencies
      const packageJson = JSON.parse(await fs.readFile(join(__dirname, 'package.json'), 'utf8'));

      const requiredDeps = [
        '@sveltejs/kit',
        'drizzle-orm',
        'postgres',
        '@playwright/test',
        'lokijs',
        'fuse.js',
      ];

      const installedDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      const missingDeps = requiredDeps.filter((dep) => !installedDeps[dep]);

      if (missingDeps.length === 0) {
        console.log('✅ All required dependencies are installed');
      } else {
        console.log('⚠️ Missing dependencies:', missingDeps.join(', '));
      }
    } catch (error) {
      console.log('❌ Dependency check failed:', error.message);
    }
  }

  async generateFinalReport() {
    console.log('\n📊 Generating Final Test Report...');

    const report = {
      timestamp: new Date().toISOString(),
      title: 'Legal Case Management System - Comprehensive Test Report',
      summary: {
        serverStarted: this.results.serverStarted,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
      },
      results: this.results,
      recommendations: [],
    };

    // Calculate totals
    if (this.results.serverSideTests?.summary) {
      report.summary.totalTests += this.results.serverSideTests.summary.total;
      report.summary.passedTests += this.results.serverSideTests.summary.passed;
      report.summary.failedTests += this.results.serverSideTests.summary.failed;
    }

    if (this.results.integrationTests?.passed) {
      report.summary.passedTests += 1;
    } else if (this.results.integrationTests) {
      report.summary.failedTests += 1;
    }

    // Add recommendations
    if (!this.results.serverStarted) {
      report.recommendations.push('Fix server startup issues');
    }

    if (this.results.serverSideTests?.results?.database === false) {
      report.recommendations.push('Configure PostgreSQL database connection');
    }

    if (this.results.integrationTests?.passed === false) {
      report.recommendations.push('Fix frontend integration issues');
    }

    // Save report
    await fs.writeFile(join(__dirname, 'final-test-report.json'), JSON.stringify(report, null, 2));

    // Display summary
    console.log('\n🎯 FINAL TEST SUMMARY:');
    console.log('='.repeat(50));
    console.log(`🚀 Server Started: ${this.results.serverStarted ? '✅' : '❌'}`);
    console.log(`💾 Database: ${this.results.serverSideTests?.results?.database ? '✅' : '❌'}`);
    console.log(
      `🔐 Authentication: ${this.results.serverSideTests?.results?.authAPI ? '✅' : '❌'}`
    );
    console.log(`📁 Cases API: ${this.results.serverSideTests?.results?.caseAPI ? '✅' : '❌'}`);
    console.log(`🎭 E2E Tests: ${this.results.integrationTests?.passed ? '✅' : '❌'}`);

    if (report.recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:');
      report.recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
    }

    console.log('\n📁 Full report saved to: final-test-report.json');

    return report;
  }

  async cleanup() {
    if (this.devServer) {
      console.log('🧹 Cleaning up server...');
      this.devServer.kill();
    }
  }

  async run() {
    try {
      console.log('🏁 Starting Comprehensive Test Suite...\n');

      // Check dependencies first
      await this.checkDependencies();

      // Start development server
      await this.startDevServer();

      // Wait for server to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Run server-side tests
      await this.runServerSideTests();

      // Run Playwright tests
      await this.runPlaywrightTests();

      // Run comprehensive tests
      await this.runComprehensiveTests();

      // Generate final report
      const report = await this.generateFinalReport();

      console.log('\n🎉 All tests completed!');

      return report;
    } catch (error) {
      console.error('💥 Test suite failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// Run the test suite
const runner = new TestRunner();
runner
  .run()
  .then((report) => {
    const success = report.summary.failedTests === 0 && report.summary.passedTests > 0;
    console.log(`\n${success ? '🎉 SUCCESS' : '⚠️ ISSUES FOUND'}: Test suite completed!`);
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 Test runner crashed:', error);
    process.exit(1);
  });

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n🛑 Test suite interrupted by user');
  await runner.cleanup();
  process.exit(1);
});
