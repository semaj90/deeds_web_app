#!/usr/bin/env node

// Simple seed script that runs the TypeScript seed
import { execSync } from 'child_process';

try {
  console.log('🌱 Running database seed...');

  // Set environment variable for Windows compatibility
  const env = {
    ...process.env,
    DATABASE_URL: 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db',
  };

  execSync('npx tsx src/lib/server/db/seed.ts', {
    stdio: 'inherit',
    cwd: process.cwd(),
    env,
  });
  console.log('✅ Seed completed successfully!');
} catch (error) {
  console.error('❌ Seed failed:', error.message);
  process.exit(1);
}
