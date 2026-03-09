#!/usr/bin/env node

/**
 * ULTIMATE DEEDS APP SETUP AND TEST AUTOMATION SCRIPT
 * ===================================================
 * 
 * This script performs a complete end-to-end setup and testing of the Deeds App:
 * 1. Starts Docker PostgreSQL & Qdrant services
 * 2. Waits for services to be healthy
 * 3. Runs database migrations
 * 4. Starts Drizzle Studio in background
 * 5. Starts SvelteKit dev server in background  
 * 6. Runs all Node.js unit tests
 * 7. Runs all Playwright E2E tests with traces
 * 8. Generates comprehensive HTML and text reports
 * 9. Provides service status and troubleshooting info
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  workingDir: process.cwd(),
  webAppDir: path.join(process.cwd(), 'web-app', 'sveltekit-frontend'),
  devServerPort: 5173,
  drizzleStudioPort: 4983,
  postgresPort: 5432,
  qdrantPort: 6333,
  timeout: 120000, // 2 minutes for service startup
  retryInterval: 2000 // 2 seconds between health checks
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Utility functions
function log(message, color = colors.reset) {
  console.log(`${color}${new Date().toISOString()} - ${message}${colors.reset}`);
}

function success(message) {
  log(message, colors.green);
}

function error(message) {
  log(message, colors.red);
}

function info(message) {
  log(message, colors.blue);
}

function warning(message) {
  log(message, colors.yellow);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function execAsync(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, { 
      cwd: options.cwd || CONFIG.workingDir,
      env: { ...process.env, ...options.env },
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function waitForPort(port, host = 'localhost', timeout = CONFIG.timeout) {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      await execAsync(`powershell -Command "Test-NetConnection -ComputerName ${host} -Port ${port} -InformationLevel Quiet"`);
      return true;
    } catch (e) {
      await sleep(CONFIG.retryInterval);
    }
  }
  
  throw new Error(`Port ${port} not available after ${timeout}ms`);
}

async function waitForUrl(url, timeout = CONFIG.timeout) {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      await execAsync(`powershell -Command "try { Invoke-WebRequest -Uri '${url}' -Method HEAD -TimeoutSec 5 | Out-Null; exit 0 } catch { exit 1 }"`);
      return true;
    } catch (e) {
      await sleep(CONFIG.retryInterval);
    }
  }
  
  throw new Error(`URL ${url} not responding after ${timeout}ms`);
}

// Background process management
const backgroundProcesses = [];

function addBackgroundProcess(name, child) {
  backgroundProcesses.push({ name, child });
  
  child.on('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGTERM') {
      warning(`Background process ${name} exited with code ${code}, signal ${signal}`);
    }
  });
}

function cleanupBackgroundProcesses() {
  log('Cleaning up background processes...');
  backgroundProcesses.forEach(({ name, child }) => {
    try {
      if (child.pid) {
        process.kill(child.pid, 'SIGTERM');
        log(`Terminated ${name} (PID: ${child.pid})`);
      }
    } catch (e) {
      warning(`Failed to terminate ${name}: ${e.message}`);
    }
  });
}

// Main setup and test functions
async function startDockerServices() {
  info('🐳 Starting Docker services (PostgreSQL + Qdrant)...');
  
  try {
    // Stop any existing containers
    try {
      await execAsync('docker compose down', { cwd: CONFIG.workingDir });
    } catch (e) {
      // Ignore errors if containers aren't running
    }
    
    // Start services
    await execAsync('docker compose up -d', { cwd: CONFIG.workingDir });
    
    // Wait for PostgreSQL
    info('⏳ Waiting for PostgreSQL to be ready...');
    await waitForPort(CONFIG.postgresPort);
    
    // Additional wait for PostgreSQL to fully initialize
    await sleep(5000);
    
    // Wait for Qdrant
    info('⏳ Waiting for Qdrant to be ready...');
    await waitForPort(CONFIG.qdrantPort);
    
    success('✅ Docker services are running and healthy');
    return true;
  } catch (e) {
    error(`❌ Failed to start Docker services: ${e.message}`);
    throw e;
  }
}

async function runMigrations() {
  info('🗄️ Running database migrations...');
  
  try {
    const result = await execAsync('npm run db:migrate', { cwd: CONFIG.webAppDir });
    success('✅ Database migrations completed');
    return result;
  } catch (e) {
    error(`❌ Migration failed: ${e.stderr || e.message}`);
    throw e;
  }
}

async function startDrizzleStudio() {
  info('🎛️ Starting Drizzle Studio...');
  
  try {
    const child = spawn('npm', ['run', 'db:studio'], {
      cwd: CONFIG.webAppDir,
      stdio: 'pipe',
      shell: true,
      detached: true
    });
    
    addBackgroundProcess('Drizzle Studio', child);
    
    // Wait for Drizzle Studio to start
    await sleep(5000);
    
    success(`✅ Drizzle Studio started at http://localhost:${CONFIG.drizzleStudioPort}`);
    return child;
  } catch (e) {
    warning(`⚠️ Drizzle Studio may not be available: ${e.message}`);
    return null;
  }
}

async function startDevServer() {
  info('🚀 Starting SvelteKit dev server...');
  
  try {
    const child = spawn('npm', ['run', 'dev'], {
      cwd: CONFIG.webAppDir,
      stdio: 'pipe',
      shell: true,
      env: { 
        ...process.env, 
        PORT: CONFIG.devServerPort.toString(),
        NODE_ENV: 'development'
      }
    });
    
    addBackgroundProcess('SvelteKit Dev Server', child);
    
    // Wait for dev server to start
    await sleep(8000);
    
    success(`✅ SvelteKit dev server started at http://localhost:${CONFIG.devServerPort}`);
    return child;
  } catch (e) {
    error(`❌ Failed to start dev server: ${e.message}`);
    throw e;
  }
}

async function runNodeTests() {
  info('🧪 Running Node.js unit tests...');
  
  const testFiles = [
    'test-password.js',
    'test-auth.js',
    'test-database.js',
    'test-api.js'
  ];
  
  const results = [];
  
  for (const testFile of testFiles) {
    const testPath = path.join(CONFIG.workingDir, 'Deeds-App-doesn-t-work--main', testFile);
    
    if (fs.existsSync(testPath)) {
      try {
        info(`Running ${testFile}...`);
        const result = await execAsync(`node "${testPath}"`, { cwd: CONFIG.workingDir });
        results.push({
          test: testFile,
          status: 'PASSED',
          output: result.stdout,
          error: null
        });
        success(`✅ ${testFile} passed`);
      } catch (e) {
        results.push({
          test: testFile,
          status: 'FAILED',
          output: e.stdout || '',
          error: e.stderr || e.message
        });
        error(`❌ ${testFile} failed: ${e.stderr || e.message}`);
      }
    } else {
      warning(`⚠️ Test file not found: ${testFile}`);
    }
  }
  
  return results;
}

async function runPlaywrightTests() {
  info('🎭 Running Playwright E2E tests with traces...');
  
  try {
    // Install Playwright browsers if needed
    try {
      await execAsync('npx playwright install', { cwd: CONFIG.webAppDir });
    } catch (e) {
      warning('Playwright install may have issues, continuing...');
    }
    
    // Run tests with full tracing and reporting
    const result = await execAsync(
      'npx playwright test --reporter=html --trace=on --video=on --screenshot=on',
      { cwd: CONFIG.webAppDir }
    );
    
    success('✅ Playwright tests completed');
    return result;
  } catch (e) {
    // Playwright tests may fail, but we still want the report
    warning(`⚠️ Some Playwright tests failed, but reports were generated`);
    return {
      stdout: e.stdout || '',
      stderr: e.stderr || '',
      failed: true
    };
  }
}

async function generateReport() {
  info('📊 Generating comprehensive test report...');
  
  const reportData = {
    timestamp: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd()
    },
    services: {},
    tests: {
      node: [],
      playwright: {}
    },
    recommendations: []
  };
  
  // Check service status
  const services = [
    { name: 'PostgreSQL', port: CONFIG.postgresPort },
    { name: 'Qdrant', port: CONFIG.qdrantPort },
    { name: 'SvelteKit Dev Server', port: CONFIG.devServerPort },
    { name: 'Drizzle Studio', port: CONFIG.drizzleStudioPort }
  ];
  
  for (const service of services) {
    try {
      await waitForPort(service.port, 'localhost', 5000);
      reportData.services[service.name] = 'RUNNING';
    } catch (e) {
      reportData.services[service.name] = 'NOT_AVAILABLE';
    }
  }
  
  // Collect test results
  try {
    const nodeResults = await runNodeTests();
    reportData.tests.node = nodeResults;
  } catch (e) {
    error(`Failed to run Node tests: ${e.message}`);
  }
  
  try {
    const playwrightResult = await runPlaywrightTests();
    reportData.tests.playwright = playwrightResult;
  } catch (e) {
    error(`Failed to run Playwright tests: ${e.message}`);
  }
  
  // Generate recommendations
  const failedServices = Object.entries(reportData.services)
    .filter(([name, status]) => status !== 'RUNNING')
    .map(([name]) => name);
  
  if (failedServices.length > 0) {
    reportData.recommendations.push(`🔧 Services not running: ${failedServices.join(', ')}. Check Docker and service logs.`);
  }
  
  const failedNodeTests = reportData.tests.node.filter(test => test.status === 'FAILED');
  if (failedNodeTests.length > 0) {
    reportData.recommendations.push(`🧪 ${failedNodeTests.length} Node.js tests failed. Check database connections and API endpoints.`);
  }
  
  if (reportData.tests.playwright.failed) {
    reportData.recommendations.push(`🎭 Playwright tests have failures. Check HTML report for detailed information.`);
  }
  
  // Write text report
  const textReport = generateTextReport(reportData);
  fs.writeFileSync(path.join(CONFIG.workingDir, 'ULTIMATE_TEST_REPORT.txt'), textReport);
  
  // Write JSON report
  fs.writeFileSync(path.join(CONFIG.workingDir, 'ULTIMATE_TEST_REPORT.json'), JSON.stringify(reportData, null, 2));
  
  success('✅ Reports generated: ULTIMATE_TEST_REPORT.txt and ULTIMATE_TEST_REPORT.json');
  
  return reportData;
}

function generateTextReport(data) {
  const report = [];
  
  report.push('='.repeat(80));
  report.push('DEEDS APP - ULTIMATE COMPLETE TEST REPORT');
  report.push('='.repeat(80));
  report.push(`Generated: ${data.timestamp}`);
  report.push(`Environment: Node ${data.environment.node} on ${data.environment.platform}`);
  report.push('');
  
  // Service Status
  report.push('📋 SERVICE STATUS');
  report.push('-'.repeat(40));
  Object.entries(data.services).forEach(([service, status]) => {
    const statusIcon = status === 'RUNNING' ? '✅' : '❌';
    report.push(`${statusIcon} ${service}: ${status}`);
  });
  report.push('');
  
  // Node.js Tests
  report.push('🧪 NODE.JS UNIT TESTS');
  report.push('-'.repeat(40));
  if (data.tests.node.length === 0) {
    report.push('⚠️ No Node.js tests found or executed');
  } else {
    data.tests.node.forEach(test => {
      const statusIcon = test.status === 'PASSED' ? '✅' : '❌';
      report.push(`${statusIcon} ${test.test}: ${test.status}`);
      if (test.error) {
        report.push(`   Error: ${test.error}`);
      }
    });
  }
  report.push('');
  
  // Playwright Tests
  report.push('🎭 PLAYWRIGHT E2E TESTS');
  report.push('-'.repeat(40));
  if (data.tests.playwright.failed) {
    report.push('❌ Some Playwright tests failed');
    report.push('📊 Check HTML report: web-app/sveltekit-frontend/playwright-report/index.html');
  } else {
    report.push('✅ Playwright tests completed successfully');
  }
  report.push('');
  
  // Recommendations
  if (data.recommendations.length > 0) {
    report.push('💡 RECOMMENDATIONS');
    report.push('-'.repeat(40));
    data.recommendations.forEach(rec => report.push(rec));
    report.push('');
  }
  
  // Quick Access
  report.push('🚀 QUICK ACCESS LINKS');
  report.push('-'.repeat(40));
  report.push('• SvelteKit App: http://localhost:5173');
  report.push('• Drizzle Studio: http://localhost:4983');
  report.push('• Playwright Report: web-app/sveltekit-frontend/playwright-report/index.html');
  report.push('• PostgreSQL: localhost:5432 (postgres/postgres)');
  report.push('• Qdrant: http://localhost:6333');
  report.push('');
  
  // Build Status
  report.push('🏗️ BUILD STATUS');
  report.push('-'.repeat(40));
  report.push('• Check if production build works: cd web-app/sveltekit-frontend && npm run build');
  report.push('• Verify TypeScript compilation: cd web-app/sveltekit-frontend && npm run check');
  report.push('');
  
  // Troubleshooting
  report.push('🔧 TROUBLESHOOTING');
  report.push('-'.repeat(40));
  report.push('• Docker issues: docker compose logs');
  report.push('• Database connection: Check DATABASE_URL environment variable');
  report.push('• Port conflicts: Use netstat -an | findstr "5173\\|5432\\|6333\\|4983"');
  report.push('• Migration issues: npm run db:reset && npm run db:migrate');
  report.push('• Test failures: Check individual test files for detailed errors');
  report.push('• Svelte errors: cd web-app/sveltekit-frontend && npm run check');
  report.push('• TypeScript errors: Check VS Code Problems panel');
  report.push('');
  
  // Production Readiness
  report.push('🚀 PRODUCTION READINESS CHECKLIST');
  report.push('-'.repeat(40));
  report.push('□ All services running without errors');
  report.push('□ Database migrations applied successfully');
  report.push('□ All Node.js unit tests passing');
  report.push('□ All Playwright E2E tests passing');
  report.push('□ Production build completes without errors');
  report.push('□ No TypeScript compilation errors');
  report.push('□ No Svelte check errors');
  report.push('□ Error handling works correctly');
  report.push('□ Environment variables configured');
  report.push('□ Docker services healthy');
  report.push('');
  
  report.push('='.repeat(80));
  report.push('END OF ULTIMATE TEST REPORT');
  report.push('='.repeat(80));
  
  return report.join('\n');
}

// Main execution
async function main() {
  const startTime = Date.now();
  
  log('🚀 Starting Ultimate Deeds App Setup and Testing...', colors.bright);
  log('='.repeat(80), colors.bright);
  
  try {
    // Ensure we're in the right directory
    if (!fs.existsSync(path.join(CONFIG.workingDir, 'docker-compose.yml'))) {
      throw new Error('docker-compose.yml not found. Please run this script from the project root.');
    }
    
    // Install dependencies
    info('📦 Installing dependencies...');
    await execAsync('npm install', { cwd: CONFIG.webAppDir });
    
    // Step 1: Start Docker services
    await startDockerServices();
    
    // Step 2: Run migrations
    await runMigrations();
    
    // Step 3: Start background services
    await startDrizzleStudio();
    await startDevServer();
    
    // Step 4: Generate comprehensive report with all tests
    const reportData = await generateReport();
    
    // Summary
    const duration = Math.round((Date.now() - startTime) / 1000);
    success(`🎉 Setup and testing completed in ${duration} seconds!`);
    
    log('='.repeat(80), colors.bright);
    log('📊 SUMMARY', colors.bright);
    log('='.repeat(80), colors.bright);
    
    // Service status
    Object.entries(reportData.services).forEach(([service, status]) => {
      const statusIcon = status === 'RUNNING' ? '✅' : '❌';
      log(`${statusIcon} ${service}: ${status}`);
    });
    
    // Test summary
    const nodeTestCount = reportData.tests.node.length;
    const nodeFailures = reportData.tests.node.filter(t => t.status === 'FAILED').length;
    log(`🧪 Node.js Tests: ${nodeTestCount - nodeFailures}/${nodeTestCount} passed`);
    
    if (reportData.tests.playwright.failed) {
      log('🎭 Playwright Tests: Some failures (check HTML report)');
    } else {
      log('🎭 Playwright Tests: Completed successfully');
    }
    
    log('='.repeat(80), colors.bright);
    log('📋 NEXT STEPS', colors.bright);
    log('='.repeat(80), colors.bright);
    log('1. Review ULTIMATE_TEST_REPORT.txt for detailed results');
    log('2. Open http://localhost:5173 to test the application');
    log('3. Use http://localhost:4983 for database management');
    log('4. Check playwright-report/index.html for E2E test details');
    log('5. Run production build: cd web-app/sveltekit-frontend && npm run build');
    
    if (reportData.recommendations.length > 0) {
      log('\n💡 Recommendations:');
      reportData.recommendations.forEach(rec => log(`   ${rec}`));
    }
    
    log('\n🔧 To stop services: docker compose down');
    log('📊 Full reports saved as ULTIMATE_TEST_REPORT.txt and ULTIMATE_TEST_REPORT.json');
    
  } catch (e) {
    error(`❌ Setup failed: ${e.message}`);
    if (e.stdout) console.log('STDOUT:', e.stdout);
    if (e.stderr) console.log('STDERR:', e.stderr);
    process.exit(1);
  }
}

// Handle cleanup on exit
process.on('SIGINT', () => {
  log('\n🛑 Received interrupt signal, cleaning up...');
  cleanupBackgroundProcesses();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('\n🛑 Received termination signal, cleaning up...');
  cleanupBackgroundProcesses();
  process.exit(0);
});

// Run main function
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  main,
  CONFIG,
  startDockerServices,
  runMigrations,
  startDrizzleStudio,
  startDevServer,
  runNodeTests,
  runPlaywrightTests,
  generateReport
};
