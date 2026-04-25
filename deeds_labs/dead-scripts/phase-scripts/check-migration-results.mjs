#!/usr/bin/env node

import { Client } from 'pg';
import 'dotenv/config';

async function checkTables() {
  const client = new Client(process.env.DATABASE_URL);

  try {
    await client.connect();
    console.log('Connected to database');

    // Check for chat/workspace/error tables
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (table_name LIKE '%chat%' OR table_name LIKE '%workspace%' OR table_name LIKE '%error%')
      ORDER BY table_name
    `);

    console.log('Tables found:');
    result.rows.forEach(row => {
      console.log(` - ${row.table_name}`);
    });

    // Check evidence table columns
    const columnsResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'evidence'
      AND column_name IN ('evidence_type', 'file_type', 'uploaded_by', 'tags', 'ai_analysis')
      ORDER BY column_name
    `);

    console.log('Evidence table new columns:');
    columnsResult.rows.forEach(row => {
      console.log(` - ${row.column_name}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkTables();