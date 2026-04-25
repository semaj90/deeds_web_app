#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function globalTeardown() {
  console.log('🧹 Starting Playwright global teardown...');

  try {
    console.log('🐳 Stopping test containers...');
    await execAsync('docker-compose -f ../docker-compose.test.yml down -v');
    console.log('✅ Test containers stopped and volumes removed');
  } catch (error) {
    console.error('❌ Global teardown failed:', error.message);
    // Don't fail the test run if teardown fails
  }
}

export default globalTeardown;
