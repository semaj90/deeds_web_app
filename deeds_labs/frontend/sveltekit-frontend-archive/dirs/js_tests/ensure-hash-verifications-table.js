#!/usr/bin/env node

import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5433'),
  database: process.env.POSTGRES_DB || 'prosecutor_db',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
});

async function ensureHashVerificationsTable() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');

    // Check if table exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'hash_verifications'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.log('Creating hash_verifications table...');

      await client.query(`
        CREATE TABLE hash_verifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
          verified_hash VARCHAR(64) NOT NULL,
          stored_hash VARCHAR(64),
          result BOOLEAN NOT NULL,
          verification_method VARCHAR(50) NOT NULL DEFAULT 'manual',
          verified_by UUID NOT NULL REFERENCES users(id),
          notes TEXT,
          verified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `);

      // Create indexes for better performance
      await client.query(`
        CREATE INDEX idx_hash_verifications_evidence_id ON hash_verifications(evidence_id);
      `);

      await client.query(`
        CREATE INDEX idx_hash_verifications_verified_at ON hash_verifications(verified_at DESC);
      `);

      await client.query(`
        CREATE INDEX idx_hash_verifications_result ON hash_verifications(result);
      `);

      console.log('✅ hash_verifications table created successfully');
    } else {
      console.log('✅ hash_verifications table already exists');
    }

    // Test the table structure
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'hash_verifications' 
      ORDER BY ordinal_position;
    `);

    console.log('\nTable structure:');
    columns.rows.forEach((col) => {
      console.log(
        `  ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`
      );
    });
  } catch (error) {
    console.error('Error ensuring hash_verifications table:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

ensureHashVerificationsTable();
