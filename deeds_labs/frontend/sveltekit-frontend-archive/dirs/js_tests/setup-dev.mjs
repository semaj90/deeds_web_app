#!/usr/bin/env node

// Development setup script
// Handles database setup, migration, and development server startup

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, writeFileSync } from 'fs';

const execAsync = promisify(exec);

console.log('🚀 Setting up Deeds Legal AI Assistant for development...\n');

// Check if .env file exists
if (!existsSync('.env')) {
  console.log('📝 Creating .env file from example...');
  if (existsSync('.env.example')) {
    const { readFileSync } = await import('fs');
    writeFileSync('.env', readFileSync('.env.example', 'utf-8'));
    console.log('✅ .env file created - please update with your settings\n');
  }
}

// Check if PostgreSQL is available
async function checkPostgreSQL() {
  try {
    const result = await execAsync('pg_isready -h localhost -p 5432');
    if (result.stdout.includes('accepting connections')) {
      console.log('✅ PostgreSQL is running and accepting connections');
      return true;
    }
  } catch (error) {
    console.log('⚠️  PostgreSQL not available - app will run with limited functionality');
    console.log('   To enable full features, install and start PostgreSQL:');
    console.log('   - Windows: https://www.postgresql.org/download/windows/');
    console.log('   - macOS: brew install postgresql && brew services start postgresql');
    console.log('   - Linux: sudo apt install postgresql && sudo service postgresql start\n');
    return false;
  }
}

// Run database migrations if PostgreSQL is available
async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...');
    await execAsync('npm run db:migrate');
    console.log('✅ Database migrations completed\n');
  } catch (error) {
    console.log('⚠️  Migration failed - this is expected if PostgreSQL is not running');
    console.log('   You can run migrations later with: npm run db:migrate\n');
  }
}

// Start development server
async function startDev() {
  console.log('🎯 Starting development server...');
  console.log('📱 The app will be available at: http://localhost:5173');
  console.log('🔧 Some features require PostgreSQL, Qdrant, and Redis for full functionality\n');

  try {
    const child = exec('npm run dev');

    child.stdout?.on('data', (data) => {
      process.stdout.write(data);
    });

    child.stderr?.on('data', (data) => {
      process.stderr.write(data);
    });

    child.on('close', (code) => {
      console.log(`Development server exited with code ${code}`);
    });
  } catch (error) {
    console.error('❌ Failed to start development server:', error);
    process.exit(1);
  }
}

// Main setup flow
async function main() {
  const isPostgreSQLRunning = await checkPostgreSQL();

  if (isPostgreSQLRunning) {
    await runMigrations();
  }

  console.log('🎉 Setup complete! Starting development server...\n');

  if (process.argv.includes('--migrate-only')) {
    console.log('✅ Migration-only mode - exiting');
    process.exit(0);
  }

  if (!process.argv.includes('--no-dev')) {
    await startDev();
  }
}

main().catch((error) => {
  console.error('❌ Setup failed:', error);
  process.exit(1);
});
