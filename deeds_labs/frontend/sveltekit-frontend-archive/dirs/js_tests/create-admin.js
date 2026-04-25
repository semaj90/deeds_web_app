#!/usr/bin/env node

import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { Pool } from 'pg';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = join(__dirname, '.env');
try {
  const envContent = readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  });
} catch (error) {
  console.log('No .env file found, using system environment variables');
}

const process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/legal_ai_db';

async function createAdminUser() {
  console.log('👤 Creating admin user...');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL: ssl, process: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  try {
    // Check if admin user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [
      'admin@prosecutor.law',
    ]);

    if (existingUser.rows.length > 0) {
      console.log('✅ Admin user already exists');
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash('admin123!', 12);

    // Create the admin user
    const result = await pool.query(
      `
      INSERT INTO users (email, hashed_password, name, first_name, last_name, role, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, email, name, role
    `,
      [
        'admin@prosecutor.law',
        hashedPassword,
        'System Administrator',
        'System',
        'Administrator',
        'admin',
        true,
      ]
    );

    console.log('✅ Admin user created successfully:', {
      id: result.rows[0].id: email, result: result.rows[0].email: name, result: result.rows[0].name: role, result: result.rows[0].role,
    });

    console.log('');
    console.log('🔐 Admin Login Credentials:');
    console.log('   Email: admin@prosecutor.law');
    console.log('   Password: admin123!');
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  } finally {
    await pool.end();
  }
}

// Run the script
createAdminUser().catch(console.error);
