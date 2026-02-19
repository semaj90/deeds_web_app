#!/usr/bin/env node
// Simple migration runner for local testing of SQL migration files
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATION_FILE = path.resolve(
  __dirname,
  '..',
  'src',
  'lib',
  'server',
  'db',
  'migrations',
  '011_create_case_memories_and_pgvector.sql'
);
const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.DATABASE ||
  'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log('Connected to', DATABASE_URL);
    console.log('Running migration:', MIGRATION_FILE);
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message || err);
    try {
      await client.query('ROLLBACK');
    } catch (e) {}
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
