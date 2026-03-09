#!/usr/bin/env node

/**
 * COMPREHENSIVE DEEDS APP MIGRATION AND SETUP SCRIPT
 * ==================================================
 * 
 * This script performs complete setup with proper error handling:
 * 1. Starts Docker PostgreSQL & Qdrant services
 * 2. Waits for PostgreSQL to be fully ready
 * 3. Generates Drizzle migrations from schema
 * 4. Applies all migrations to database
 * 5. Starts development services
 * 6. Runs comprehensive tests
 * 7. Generates detailed reports
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
  timeout: 180000, // 3 minutes for service startup
  retryInterval: 3000 // 3 seconds between health checks
};

// Utility functions
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'ERROR' ? '❌' : type === 'SUCCESS' ? '✅' : type === 'WARNING' ? '⚠️' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function execAsync(command, options = {}) {
  return new Promise((resolve, reject) => {
    log(`Executing: ${command}`);
    exec(command, { 
      cwd: options.cwd || CONFIG.workingDir,
      env: { ...process.env, ...options.env },
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    }, (error, stdout, stderr) => {
      if (error) {
        log(`Command failed: ${command}`, 'ERROR');
        log(`Error: ${error.message}`, 'ERROR');
        if (stderr) log(`Stderr: ${stderr}`, 'ERROR');
        reject({ error, stdout, stderr, command });
      } else {
        log(`Command completed: ${command}`, 'SUCCESS');
        resolve({ stdout, stderr });
      }
    });
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForPort(port, timeout = CONFIG.timeout) {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      await execAsync(`powershell -Command "Test-NetConnection -ComputerName localhost -Port ${port} -InformationLevel Quiet -WarningAction SilentlyContinue"`);
      log(`Port ${port} is ready`, 'SUCCESS');
      return true;
    } catch (e) {
      log(`Waiting for port ${port}...`);
      await sleep(CONFIG.retryInterval);
    }
  }
  
  throw new Error(`Port ${port} not available after ${timeout}ms`);
}

async function startDockerServices() {
  log('🐳 Starting Docker services...');
  
  try {
    // Stop any existing containers
    try {
      await execAsync('docker compose down');
      log('Stopped existing containers');
    } catch (e) {
      log('No existing containers to stop');
    }
    
    // Start services
    await execAsync('docker compose up -d');
    log('Docker services started');
    
    // Wait for PostgreSQL
    log('⏳ Waiting for PostgreSQL to be ready...');
    await waitForPort(CONFIG.postgresPort);
    
    // Additional wait for PostgreSQL to fully initialize
    await sleep(10000);
    
    // Test PostgreSQL connection
    await execAsync('docker exec -i $(docker compose ps -q db) pg_isready -U postgres');
    log('PostgreSQL is ready and accepting connections', 'SUCCESS');
    
    // Wait for Qdrant
    log('⏳ Waiting for Qdrant to be ready...');
    await waitForPort(CONFIG.qdrantPort);
    log('Qdrant is ready', 'SUCCESS');
    
    return true;
  } catch (e) {
    log(`Failed to start Docker services: ${e.message}`, 'ERROR');
    throw e;
  }
}

async function generateMigrations() {
  log('🗄️ Generating database migrations...');
  
  try {
    // First ensure the schema file exists
    const schemaPath = path.join(CONFIG.workingDir, 'web-app', 'sveltekit-frontend', 'src', 'lib', 'server', 'db', 'schema-new.ts');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }
    log(`Schema file found: ${schemaPath}`, 'SUCCESS');
    
    // Navigate to web app directory for migrations
    const result = await execAsync('npm run db:generate', { cwd: CONFIG.webAppDir });
    log('Database migrations generated successfully', 'SUCCESS');
    return result;
  } catch (e) {
    log(`Migration generation failed: ${e.stderr || e.message}`, 'ERROR');
    
    // Try alternative approaches
    log('Attempting alternative migration generation...');
    try {
      await execAsync('npx drizzle-kit generate --config=../../drizzle.config.ts', { cwd: CONFIG.webAppDir });
      log('Alternative migration generation succeeded', 'SUCCESS');
    } catch (e2) {
      log(`Alternative migration also failed: ${e2.message}`, 'ERROR');
      throw e;
    }
  }
}

async function runMigrations() {
  log('🗄️ Running database migrations...');
  
  try {
    const result = await execAsync('npm run db:migrate', { cwd: CONFIG.webAppDir });
    log('Database migrations applied successfully', 'SUCCESS');
    return result;
  } catch (e) {
    log(`Migration failed: ${e.stderr || e.message}`, 'ERROR');
    
    // Try push as alternative
    log('Attempting database push as alternative...');
    try {
      await execAsync('npm run db:push', { cwd: CONFIG.webAppDir });
      log('Database push succeeded', 'SUCCESS');
    } catch (e2) {
      log(`Database push also failed: ${e2.message}`, 'ERROR');
      throw e;
    }
  }
}

async function startDevelopmentServices() {
  log('🚀 Starting development services...');
  
  // Start Drizzle Studio
  log('🎛️ Starting Drizzle Studio...');
  const drizzleChild = spawn('npm', ['run', 'db:studio'], {
    cwd: CONFIG.webAppDir,
    stdio: 'pipe',
    shell: true,
    detached: true
  });
  
  // Start SvelteKit dev server
  log('🚀 Starting SvelteKit dev server...');
  const devChild = spawn('npm', ['run', 'dev'], {
    cwd: CONFIG.webAppDir,
    stdio: 'pipe',
    shell: true,
    detached: true
  });
  
  // Wait for services to start
  await sleep(8000);
  
  try {
    await waitForPort(CONFIG.devServerPort, 30000);
    log('SvelteKit dev server is ready', 'SUCCESS');
  } catch (e) {
    log('SvelteKit dev server may not be ready', 'WARNING');
  }
  
  return { drizzleChild, devChild };
}

async function runTests() {
  log('🎭 Running Playwright tests...');
  
  try {
    // Install Playwright browsers if needed
    await execAsync('npx playwright install', { cwd: CONFIG.webAppDir });
    
    // Run tests with full reporting
    await execAsync('npx playwright test --reporter=html --trace=on', { cwd: CONFIG.webAppDir });
    log('Playwright tests completed', 'SUCCESS');
  } catch (e) {
    log('Some Playwright tests failed, but reports were generated', 'WARNING');
  }
}

async function generateReport() {
  log('📊 Generating comprehensive report...');
  
  const reportData = {
    timestamp: new Date().toISOString(),
    status: 'COMPLETED',
    services: {},
    migrations: {},
    tests: {},
    nextSteps: []
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
      await waitForPort(service.port, 5000);
      reportData.services[service.name] = 'RUNNING';
    } catch (e) {
      reportData.services[service.name] = 'NOT_AVAILABLE';
    }
  }
  
  // Generate text report
  const textReport = generateTextReport(reportData);
  fs.writeFileSync(path.join(CONFIG.workingDir, 'MIGRATION_SETUP_REPORT.txt'), textReport);
  
  log('Comprehensive report generated: MIGRATION_SETUP_REPORT.txt', 'SUCCESS');
  return reportData;
}

function generateTextReport(data) {
  const report = [];
  
  report.push('='.repeat(80));
  report.push('DEEDS APP - COMPLETE MIGRATION & SETUP REPORT');
  report.push('='.repeat(80));
  report.push(`Generated: ${data.timestamp}`);
  report.push(`Status: ${data.status}`);
  report.push('');
  
  // Service Status
  report.push('📋 SERVICE STATUS');
  report.push('-'.repeat(40));
  Object.entries(data.services).forEach(([service, status]) => {
    const statusIcon = status === 'RUNNING' ? '✅' : '❌';
    report.push(`${statusIcon} ${service}: ${status}`);
  });
  report.push('');
  
  // Quick Access
  report.push('🚀 QUICK ACCESS LINKS');
  report.push('-'.repeat(40));
  report.push('• SvelteKit App: http://localhost:5173');
  report.push('• Drizzle Studio: https://local.drizzle.studio');
  report.push('• Playwright Report: web-app/sveltekit-frontend/playwright-report/index.html');
  report.push('• PostgreSQL: localhost:5432 (postgres/postgres)');
  report.push('• Qdrant: http://localhost:6333');
  report.push('');
  
  // Next Steps
  report.push('📋 NEXT STEPS');
  report.push('-'.repeat(40));
  report.push('1. Review Playwright HTML report for test failures');
  report.push('2. Test application manually at http://localhost:5173');
  report.push('3. Use Drizzle Studio for database management');
  report.push('4. Address any failing tests systematically');
  report.push('');
  
  report.push('='.repeat(80));
  report.push('END OF MIGRATION & SETUP REPORT');
  report.push('='.repeat(80));
  
  return report.join('\n');
}

// Main execution
async function main() {
  const startTime = Date.now();
  
  log('🚀 Starting Comprehensive Deeds App Migration & Setup...');
  log('='.repeat(80));
  
  try {
    // Ensure we're in the right directory
    if (!fs.existsSync(path.join(CONFIG.workingDir, 'docker-compose.yml'))) {
      throw new Error('docker-compose.yml not found. Please run this script from the project root.');
    }
    
    // Step 1: Start Docker services
    await startDockerServices();
    
    // Step 2: Install dependencies
    log('📦 Installing dependencies...');
    await execAsync('npm install', { cwd: CONFIG.webAppDir });
    
    // Step 3: Generate migrations
    await generateMigrations();
    
    // Step 4: Run migrations
    await runMigrations();
    
    // Step 5: Start development services
    const { drizzleChild, devChild } = await startDevelopmentServices();
    
    // Step 6: Run tests
    await runTests();
    
    // Step 7: Generate comprehensive report
    const reportData = await generateReport();
    
    // Summary
    const duration = Math.round((Date.now() - startTime) / 1000);
    log(`🎉 Complete setup finished in ${duration} seconds!`, 'SUCCESS');
    
    log('='.repeat(80));
    log('📊 FINAL STATUS');
    log('='.repeat(80));
    
    // Service status
    Object.entries(reportData.services).forEach(([service, status]) => {
      const statusIcon = status === 'RUNNING' ? '✅' : '❌';
      log(`${statusIcon} ${service}: ${status}`);
    });
    
    log('');
    log('📋 WHAT TO DO NEXT:');
    log('1. Review MIGRATION_SETUP_REPORT.txt');
    log('2. Open http://localhost:5173 to test the application');
    log('3. Use https://local.drizzle.studio for database management');
    log('4. Check playwright-report/index.html for test details');
    log('5. Address any failing tests systematically');
    
    log('\n🔧 To stop services: docker compose down');
    
  } catch (e) {
    log(`❌ Setup failed: ${e.message}`, 'ERROR');
    if (e.stdout) log(`STDOUT: ${e.stdout}`, 'ERROR');
    if (e.stderr) log(`STDERR: ${e.stderr}`, 'ERROR');
    process.exit(1);
  }
}

// Run main function
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, CONFIG };
