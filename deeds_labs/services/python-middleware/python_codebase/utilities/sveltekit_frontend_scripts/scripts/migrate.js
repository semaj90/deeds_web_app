#!/usr/bin/env node
/**
 * Simple migration runner for development.
 * Applies all .sql files found under src/lib/server/db in lexicographic order.
 * Usage: node scripts/migrate.js
 * Ensure env var DATABASE_URL is set.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  const migrationsDir = path.resolve(__dirname, '..', 'src', 'lib', 'server', 'db');
  if (!fs.existsSync(migrationsDir)) {
    console.error('Migrations directory not found:', migrationsDir);
    process.exit(1);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No SQL migration files found.');
    process.exit(0);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      console.log('Applying', filePath);
      const sql = fs.readFileSync(filePath, 'utf8');
      // Skip commented-out migrations
      if (!sql.trim()) continue;
      await client.query(sql);
      console.log('Applied', file);
    }
    console.log('Migrations applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 2;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
