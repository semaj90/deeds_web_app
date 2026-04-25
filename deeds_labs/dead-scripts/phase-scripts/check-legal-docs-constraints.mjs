#!/usr/bin/env node

import 'dotenv/config';
import { Client } from 'pg';

async function checkConstraints() {
  const client = new Client(process.env.DATABASE_URL);

  try {
    await client.connect();
    console.log('Connected to database');

    // Check foreign key constraints on legal_documents
    const result = await client.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'legal_documents'
      AND constraint_type = 'FOREIGN KEY'
    `);

    console.log('Foreign key constraints on legal_documents:');
    if (result.rows.length === 0) {
      console.log('  None found');
    } else {
      result.rows.forEach(row => {
        console.log(`  - ${row.constraint_name}`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkConstraints();