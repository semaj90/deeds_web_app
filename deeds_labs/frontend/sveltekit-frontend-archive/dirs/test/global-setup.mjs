#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

const TEST_DB_CONFIG = {
  host: 'localhost',
  port: 5434,
  user: 'legal_admin',
  password: 'testpass123',
  database: 'legal_ai_test',
};

async function waitForDatabase(maxRetries = 60, delay = 2000) {
  console.log('🔄 Waiting for test database to be ready...');

  for (let i = 0; i < maxRetries; i++) {
    try {
      // Test database readiness via direct connection
      await execAsync(
        'PGPASSWORD=testpass123 pg_isready -h localhost -p 5434 -U legal_admin -d legal_ai_test'
      );
      console.log('✅ Test database is ready');
      return;
    } catch (error) {
      console.log(`⏳ Database not ready yet (attempt ${i + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('❌ Test database failed to become ready within timeout');
}

async function setupDatabase() {
  console.log('🛠️  Setting up test database schema...');

  try {
    const schemaPath = path.resolve('../test_db_setup.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }

    // Execute schema via direct psql connection
    await execAsync(
      `PGPASSWORD=testpass123 psql -h localhost -p 5434 -U legal_admin -d legal_ai_test -f ${schemaPath}`
    );

    console.log('✅ Database schema created');
  } catch (error) {
    console.error('❌ Failed to setup database schema:', error.message);
    throw error;
  }
}

async function seedDatabase() {
  console.log('🌱 Seeding test database...');

  try {
    const seedPath = path.resolve('../seed-test-db.mjs');
    if (!fs.existsSync(seedPath)) {
      throw new Error(`Seed file not found: ${seedPath}`);
    }

    await execAsync(`node ${seedPath}`);
    console.log('✅ Test database seeded');
  } catch (error) {
    console.error('❌ Failed to seed database:', error.message);
    throw error;
  }
}

async function globalSetup() {
  console.log('🚀 Starting Playwright global setup...');

  try {
    // 1. Start test containers
    console.log('🐳 Starting test containers...');
    await execAsync('docker-compose -f ../docker-compose.test.yml up -d');

    // 2. Wait for database to be ready
    await waitForDatabase();

    // 3. Setup database schema
    await setupDatabase();

    // 4. Seed test data
    await seedDatabase();

    console.log('✅ Global setup completed successfully');
    console.log('🧪 Test environment ready:');
    console.log('   - PostgreSQL with pgvector: localhost:5434');
    console.log('   - Redis: localhost:6380');
    console.log('   - Test user: test@example.com');
    console.log('   - Session ID: test_session_123');
  } catch (error) {
    console.error('❌ Global setup failed:', error.message);

    // Cleanup on failure
    try {
      await execAsync('docker-compose -f docker-compose.test.yml down');
    } catch (cleanupError) {
      console.error('❌ Cleanup also failed:', cleanupError.message);
    }

    process.exit(1);
  }
}

export default globalSetup;
