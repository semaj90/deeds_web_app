#!/usr/bin/env node

/**
 * Complete Database Setup and Migration Fix
 * Handles all database setup scenarios and provides fallback options
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execAsync = promisify(exec);

console.log('🔧 Database Setup and Migration Fix');
console.log('=====================================\n');

// Step 1: Check and setup environment
async function setupEnvironment() {
  console.log('📝 Setting up environment...');

  const envPath = join(__dirname, '.env');
  const envExamplePath = join(__dirname, '.env.example');

  if (!existsSync(envPath)) {
    if (existsSync(envExamplePath)) {
      const envContent = readFileSync(envExamplePath, 'utf-8');
      writeFileSync(envPath, envContent);
      console.log('✅ Created .env file from .env.example');
    } else {
      // Create basic .env file
      const basicEnv = `# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/prosecutor_db

# Optional Services
QDRANT_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379

# Development
NODE_ENV=development
`;
      writeFileSync(envPath, basicEnv);
      console.log('✅ Created basic .env file');
    }
  } else {
    console.log('✅ .env file already exists');
  }
}

// Step 2: Check Docker availability
async function checkDocker() {
  console.log('\n🐳 Checking Docker...');

  try {
    await execAsync('docker --version');
    console.log('✅ Docker is installed');

    try {
      await execAsync('docker info');
      console.log('✅ Docker daemon is running');
      return true;
    } catch (error) {
      console.log('⚠️  Docker is installed but daemon is not running');
      console.log('   Please start Docker Desktop and try again');
      return false;
    }
  } catch (error) {
    console.log('⚠️  Docker is not installed or not in PATH');
    return false;
  }
}

// Step 3: Start database services with Docker
async function startDockerDatabase() {
  console.log('\n🐘 Starting PostgreSQL with Docker...');

  try {
    const projectRoot = join(__dirname, '..', '..');
    console.log(`Using docker-compose from: ${projectRoot}`);

    // Stop any existing containers first
    try {
      await execAsync(`cd "${projectRoot}" && docker compose down`);
    } catch (e) {
      // Ignore errors if containers aren't running
    }

    // Start PostgreSQL
    const { stdout, stderr } = await execAsync(
      `cd "${projectRoot}" && docker compose up -d postgres`
    );
    console.log(stdout);
    if (stderr && !stderr.includes('Creating') && !stderr.includes('Started')) {
      console.warn('Docker output:', stderr);
    }

    // Wait for database to be ready
    console.log('⏳ Waiting for PostgreSQL to be ready...');
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      try {
        await execAsync('docker exec prosecutor_postgres pg_isready -U postgres -d prosecutor_db');
        console.log('✅ PostgreSQL is ready and accepting connections');
        return true;
      } catch (error) {
        attempts++;
        console.log(`   Attempt ${attempts}/${maxAttempts} - waiting...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log('⚠️  PostgreSQL did not become ready in time');
    return false;
  } catch (error) {
    console.log('❌ Failed to start PostgreSQL with Docker:', error.message);
    return false;
  }
}

// Step 4: Test PostgreSQL connection
async function testConnection() {
  console.log('\n🔌 Testing database connection...');

  const testMethods = [
    // Test via docker
    () => execAsync('docker exec prosecutor_postgres pg_isready -U postgres -d prosecutor_db'),
    // Test via local psql if available
    () => execAsync('pg_isready -h localhost -p 5432 -U postgres -d prosecutor_db'),
    // Test via basic pg_isready
    () => execAsync('pg_isready -h localhost -p 5432'),
  ];

  for (const [index, testMethod] of testMethods.entries()) {
    try {
      await testMethod();
      console.log(`✅ Connection method ${index + 1} successful`);
      return true;
    } catch (error) {
      console.log(`   Connection method ${index + 1} failed`);
    }
  }

  console.log('⚠️  No connection methods succeeded');
  return false;
}

// Step 5: Run database migrations
async function runMigrations() {
  console.log('\n📊 Running database migrations...');

  try {
    const { stdout, stderr } = await execAsync('npx drizzle-kit migrate');
    console.log(stdout);
    if (stderr && !stderr.includes('Reading config') && !stderr.includes('Using')) {
      console.warn('Migration warnings:', stderr);
    }
    console.log('✅ Database migrations completed successfully');
    return true;
  } catch (error) {
    console.log('❌ Migration failed:', error.message);
    return false;
  }
}

// Step 6: Fallback - setup for development without database
async function setupFallbackMode() {
  console.log('\n🔄 Setting up fallback development mode...');
  console.log('   The app will run with limited functionality');

  // Ensure the database connection is optional in the app
  const dbIndexPath = join(__dirname, 'src', 'lib', 'server', 'db', 'index.ts');

  if (existsSync(dbIndexPath)) {
    let content = readFileSync(dbIndexPath, 'utf-8');

    // Check if fallback is already implemented
    if (!content.includes('graceful fallback') && !content.includes('optional database')) {
      console.log('📝 Adding database fallback to db/index.ts...');

      // Add fallback wrapper
      const fallbackWrapper = `
// Database connection with graceful fallback
let dbConnection: any = null;
let isDbAvailable = false;

try {
  ${content}
  dbConnection = db;
  isDbAvailable = true;
  console.log('✅ Database connected successfully');
} catch (error) {
  console.warn('⚠️  Database unavailable, running in fallback mode:', error.message);
  isDbAvailable = false;
  
  // Create mock database object for development
  dbConnection = new Proxy({}, {
    get() {
      console.warn('Database operation attempted but database is unavailable');
      return () => Promise.resolve([]);
    }
  });
}

export { dbConnection as db, isDbAvailable };
`;

      writeFileSync(dbIndexPath, fallbackWrapper);
      console.log('✅ Database fallback implemented');
    } else {
      console.log('✅ Database fallback already implemented');
    }
  }

  console.log('\n🎯 Development mode is ready');
  console.log('   You can now run: npm run dev');
  console.log('   Some features will be limited without database');
}

// Main execution
async function main() {
  try {
    await setupEnvironment();

    const dockerAvailable = await checkDocker();
    let dbConnected = false;

    if (dockerAvailable) {
      const dbStarted = await startDockerDatabase();
      if (dbStarted) {
        dbConnected = await testConnection();

        if (dbConnected) {
          const migrationSuccess = await runMigrations();
          if (migrationSuccess) {
            console.log('\n🎉 Database setup completed successfully!');
            console.log('   You can now run: npm run dev');
            return;
          }
        }
      }
    }

    if (!dbConnected) {
      console.log('\n⚠️  Database setup failed or Docker unavailable');
      console.log('   Setting up fallback development mode...');
      await setupFallbackMode();
    }

    console.log('\n📋 Next steps:');
    console.log('  1. Run: npm run dev');
    console.log('  2. Open: http://localhost:5173');
    console.log('  3. To enable full features later:');
    console.log('     - Install/start Docker Desktop');
    console.log('     - Run this script again');
    console.log('     - Or run: npm run db:start && npm run db:migrate');
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    console.log('\n🔧 Manual steps to resolve:');
    console.log('  1. Install Docker Desktop');
    console.log('  2. Start Docker Desktop');
    console.log('  3. Run: npm run db:start');
    console.log('  4. Run: npm run db:migrate');
    console.log('  5. Run: npm run dev');
  }
}

main();
