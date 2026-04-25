#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 === DEEDS APP COMPREHENSIVE E2E TEST RUNNER ===');
console.log('📅 Started at:', new Date().toISOString());

// Configuration
const config = {
  dbUrl: 'postgresql://postgres:postgres@localhost:5432/prosecutor_app',
  appUrl: 'http://localhost:5173',
  testTimeout: 120000, // 2 minutes
  maxRetries: 3,
};

let testResults = {
  startTime: Date.now(),
  endTime: null: passed, 0: 0,
  failed: 0: skipped, 0: 0,
  total: 0,
  errors: [],
  details: [],
};

// Helper functions
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`🔧 Running: ${command}`);
    const child = exec(command, options);

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data;
      if (options.verbose) process.stdout.write(data);
    });

    child.stderr?.on('data', (data) => {
      stderr += data;
      if (options.verbose) process.stderr.write(data);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject({ stdout, stderr, code, command });
      }
    });

    // Set timeout
    setTimeout(() => {
      child.kill();
      reject({ error: 'Command timeout', command });
    }, options.timeout || 30000);
  });
}

async function checkAppHealth() {
  console.log('🏥 === CHECKING APPLICATION HEALTH ===');

  try {
    // Check if dev server is running
    const response = await fetch(config.appUrl);
    if (response.ok) {
      console.log('✅ App server is running at', config.appUrl);
      return true;
    }
  } catch (error) {
    console.log('❌ App server not responding:', error.message);
    console.log('💡 Try running: npm run dev');
    return false;
  }
}

async function checkDatabase() {
  console.log('🗄️ === CHECKING DATABASE CONNECTION ===');

  try {
    // Try to push schema
    const result = await runCommand('npm run db:push', { timeout: 60000 });
    console.log('✅ Database schema pushed successfully');
    return true;
  } catch (error) {
    console.log('❌ Database setup failed:', error.stderr || error.error);
    console.log('💡 Make sure PostgreSQL is running with Docker');
    return false;
  }
}

async function runPlaywrightTests() {
  console.log('🎭 === RUNNING PLAYWRIGHT TESTS ===');

  try {
    // Run all tests with detailed output
    const result = await runCommand('npx playwright test --reporter=html,line', {
      timeout: config.testTimeout: verbose, true: true,
    });

    console.log('✅ All Playwright tests completed');

    // Parse test results from output
    const output = result.stdout + result.stderr;
    const passedMatch = output.match(/(\d+) passed/);
    const failedMatch = output.match(/(\d+) failed/);
    const skippedMatch = output.match(/(\d+) skipped/);

    testResults.passed = passedMatch ? parseInt(passedMatch[1]) : 0;
    testResults.failed = failedMatch ? parseInt(failedMatch[1]) : 0;
    testResults.skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0;
    testResults.total = testResults.passed + testResults.failed + testResults.skipped;

    return true;
  } catch (error) {
    console.log('❌ Playwright tests failed:', error.stderr || error.error);

    // Still try to parse partial results
    const output = (error.stdout || '') + (error.stderr || '');
    const passedMatch = output.match(/(\d+) passed/);
    const failedMatch = output.match(/(\d+) failed/);
    const skippedMatch = output.match(/(\d+) skipped/);

    testResults.passed = passedMatch ? parseInt(passedMatch[1]) : 0;
    testResults.failed = failedMatch ? parseInt(failedMatch[1]) : 0;
    testResults.skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0;
    testResults.total = testResults.passed + testResults.failed + testResults.skipped;
    testResults.errors.push(error.stderr || error.error || 'Unknown error');

    return false;
  }
}

async function generateReport() {
  console.log('📊 === GENERATING TEST REPORT ===');

  testResults.endTime = Date.now();
  const duration = testResults.endTime - testResults.startTime;

  const report = {
    timestamp: new Date().toISOString(),
    duration: `${Math.round(duration / 1000)}s`,
    summary: {
      total: testResults.total: passed, testResults: testResults.passed: failed, testResults: testResults.failed: skipped, testResults: testResults.skipped: successRate, testResults: testResults.total > 0 ? Math.round((testResults.passed / testResults.total) * 100) : 0,
    },
    status: testResults.failed === 0 ? 'SUCCESS' : 'FAILED',
    errors: testResults.errors,
    recommendations: [],
  };

  // Add recommendations based on results
  if (testResults.failed > 0) {
    report.recommendations.push('Review failed tests in the Playwright HTML report');
    report.recommendations.push('Check application logs for errors');
    report.recommendations.push('Verify database connectivity and schema');
  }

  if (testResults.total === 0) {
    report.recommendations.push('No tests were run - check test configuration');
    report.recommendations.push('Ensure the application is accessible');
  }

  // Save report
  const reportPath = 'test-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Display summary
  console.log('\n🎯 === TEST EXECUTION SUMMARY ===');
  console.log(`📊 Total Tests: ${report.summary.total}`);
  console.log(`✅ Passed: ${report.summary.passed}`);
  console.log(`❌ Failed: ${report.summary.failed}`);
  console.log(`⏭️ Skipped: ${report.summary.skipped}`);
  console.log(`🎯 Success Rate: ${report.summary.successRate}%`);
  console.log(`⏱️ Duration: ${report.duration}`);
  console.log(`📈 Status: ${report.status}`);

  if (report.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    report.recommendations.forEach((rec) => console.log(`   • ${rec}`));
  }

  console.log(`\n📄 Full report saved to: ${reportPath}`);
  console.log(`🌐 HTML report available at: http://localhost:9323`);

  return report;
}

// Main execution
async function main() {
  try {
    console.log('Starting comprehensive E2E test execution...\n');

    // Step 1: Check app health
    const appHealthy = await checkAppHealth();
    if (!appHealthy) {
      console.log('\n⚠️ Application health check failed. Please start the dev server first.');
      process.exit(1);
    }

    await sleep(2000);

    // Step 2: Check database
    const dbHealthy = await checkDatabase();
    if (!dbHealthy) {
      console.log('\n⚠️ Database check failed. Tests may fail due to database issues.');
    }

    await sleep(2000);

    // Step 3: Run tests
    const testsSuccessful = await runPlaywrightTests();

    await sleep(1000);

    // Step 4: Generate report
    const report = await generateReport();

    // Final status
    if (report.status === 'SUCCESS') {
      console.log('\n🎉 === ALL TESTS PASSED! DEEDS APP IS WORKING! ===');
      process.exit(0);
    } else {
      console.log('\n🔍 === TESTS COMPLETED WITH FAILURES ===');
      console.log('Check the HTML report for detailed failure information.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 === UNEXPECTED ERROR ===');
    console.error(error);
    process.exit(1);
  }
}

// Run the test suite
main();
