#!/usr/bin/env node
// PostgreSQL Startup Script for dev:full
// Automatically detects and starts PostgreSQL service

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

const POSTGRES_VERSIONS = ['17', '16', '15', '14', '13'];
const DEFAULT_PORT = 5432;

// Colors for console output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}🐘 PostgreSQL: ${message}${colors.reset}`);
}

// Find PostgreSQL installation
async function findPostgreSQLPath() {
  const basePath = 'C:\\Program Files\\PostgreSQL';

  for (const version of POSTGRES_VERSIONS) {
    const versionPath = path.join(basePath, version);
    const binPath = path.join(versionPath, 'bin');
    const dataPath = path.join(versionPath, 'data');

    if (fs.existsSync(binPath) && fs.existsSync(dataPath)) {
      return {
        version,
        binPath,
        dataPath,
        pgCtl: path.join(binPath, 'pg_ctl.exe'),
      };
    }
  }

  return null;
}

// Check if PostgreSQL is already running
async function isPostgreSQLRunning(pgPath) {
  try {
    const { stdout } = await execAsync(`"${pgPath.pgCtl}" -D "${pgPath.dataPath}" status`);
    return stdout.includes('server is running');
  } catch (error) {
    return false;
  }
}

// Start PostgreSQL server
async function startPostgreSQL(pgPath) {
  return new Promise((resolve, reject) => {
    log(`Starting PostgreSQL ${pgPath.version}...`, 'blue');

    const child = spawn(pgPath.pgCtl, ['-D', pgPath.dataPath, 'start'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0 || output.includes('server started')) {
        log('✅ PostgreSQL started successfully', 'green');
        log(`📍 Server running on port ${DEFAULT_PORT}`, 'blue');
        resolve(true);
      } else {
        log(`❌ Failed to start PostgreSQL (code: ${code})`, 'red');
        if (errorOutput) log(`Error: ${errorOutput}`, 'red');
        reject(new Error(`PostgreSQL start failed: ${errorOutput || 'Unknown error'}`));
      }
    });

    child.on('error', (error) => {
      log(`❌ Error starting PostgreSQL: ${error.message}`, 'red');
      reject(error);
    });
  });
}

// Test database connection
async function testConnection() {
  try {
    log('🔍 Testing database connection...', 'yellow');

    const testCommand = `set PGPASSWORD=123456 && psql -h localhost -p ${DEFAULT_PORT} -U legal_admin -d legal_ai_db -c "SELECT version();" -t`;

    const { stdout } = await execAsync(testCommand, { timeout: 10000 });

    if (stdout.includes('PostgreSQL')) {
      log('✅ Database connection successful', 'green');
      log('📊 legal_ai_db is ready for use', 'blue');
      return true;
    } else {
      log('⚠️ Database connected but unexpected response', 'yellow');
      return false;
    }
  } catch (error) {
    log('⚠️ Database connection test failed (this may be normal during startup)', 'yellow');
    log('💡 Database may need initialization or credentials setup', 'blue');
    return false;
  }
}

// Main execution
async function main() {
  try {
    log('🚀 Initializing PostgreSQL startup...', 'bold');

    // Find PostgreSQL installation
    const pgPath = await findPostgreSQLPath();
    if (!pgPath) {
      log('❌ PostgreSQL installation not found', 'red');
      log('💡 Expected location: C:\\Program Files\\PostgreSQL\\[version]', 'yellow');
      process.exit(1);
    }

    log(`📦 Found PostgreSQL ${pgPath.version} at ${pgPath.binPath}`, 'blue');

    // Check if already running
    if (await isPostgreSQLRunning(pgPath)) {
      log('✅ PostgreSQL is already running', 'green');
    } else {
      // Start PostgreSQL
      await startPostgreSQL(pgPath);

      // Wait a moment for startup
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Test connection
    await testConnection();

    log('🎉 PostgreSQL setup complete - ready for dev:full', 'green');
  } catch (error) {
    log(`❌ Startup failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  log('👋 PostgreSQL startup interrupted', 'yellow');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('👋 PostgreSQL startup terminated', 'yellow');
  process.exit(0);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as startPostgreSQL };
