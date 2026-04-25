#!/usr/bin/env node

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/prosecutor_db';

async function setupDatabase() {
  console.log('🚀 Setting up PostgreSQL database...');

  // First connect to postgres database to create our database
  const adminPool = new Pool({
    connectionString: process.env.DATABASE_URL.replace('/prosecutor_db', '/postgres'),
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  try {
    // Create database if it doesn't exist
    console.log("📝 Creating database if it doesn't exist...");
    await adminPool.query(`
      CREATE DATABASE prosecutor_db;
    `);
    console.log('✅ Database created successfully');
  } catch (error) {
    if (error.code === '42P04') {
      console.log('✅ Database already exists');
    } else {
      console.error('❌ Error creating database:', error.message);
    }
  } finally {
    await adminPool.end();
  }

  // Now connect to our database
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL: ssl, process: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  const db = drizzle(pool);

  try {
    console.log('🔄 Running database migrations...');

    // Create tables manually since we don't have migration files
    console.log('📝 Creating users table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        hashed_password TEXT NOT NULL,
        name VARCHAR(255) NOT NULL,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'prosecutor',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('📝 Creating cases table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cases (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        case_number VARCHAR(100) UNIQUE,
        status VARCHAR(50) DEFAULT 'active',
        priority VARCHAR(20) DEFAULT 'medium',
        jurisdiction VARCHAR(255),
        assigned_prosecutor_id INTEGER REFERENCES users(id),
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('📝 Creating evidence table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS evidence (
        id SERIAL PRIMARY KEY,
        case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        file_path VARCHAR(1000),
        file_type VARCHAR(100),
        file_size INTEGER,
        hash_checksum VARCHAR(255),
        chain_of_custody JSONB,
        tags TEXT[],
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('📝 Creating reports table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        content TEXT,
        type VARCHAR(100) DEFAULT 'investigation',
        status VARCHAR(50) DEFAULT 'draft',
        metadata JSONB,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('📝 Creating citation_points table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS citation_points (
        id SERIAL PRIMARY KEY,
        report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        source VARCHAR(500),
        page INTEGER,
        context TEXT,
        type VARCHAR(100) DEFAULT 'statute',
        tags TEXT[],
        metadata JSONB,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('📝 Creating canvas_states table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS canvas_states (
        id SERIAL PRIMARY KEY,
        report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
        title VARCHAR(500),
        canvas_data JSONB NOT NULL,
        metadata JSONB,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('📝 Creating criminals table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS criminals (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        date_of_birth DATE,
        ssn VARCHAR(20),
        address TEXT,
        phone VARCHAR(20),
        email VARCHAR(255),
        criminal_history JSONB,
        aliases TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('📝 Creating statutes table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS statutes (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        section VARCHAR(100),
        subsection VARCHAR(100),
        content TEXT NOT NULL,
        jurisdiction VARCHAR(255),
        effective_date DATE,
        tags TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('📝 Creating indexes...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_cases_case_number ON cases(case_number);
      CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
      CREATE INDEX IF NOT EXISTS idx_evidence_case_id ON evidence(case_id);
      CREATE INDEX IF NOT EXISTS idx_reports_case_id ON reports(case_id);
      CREATE INDEX IF NOT EXISTS idx_citation_points_report_id ON citation_points(report_id);
      CREATE INDEX IF NOT EXISTS idx_canvas_states_report_id ON canvas_states(report_id);
    `);

    // Create a default admin user if none exists
    console.log('📝 Creating default admin user...');
    const existingUsers = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(existingUsers.rows[0].count) === 0) {
      // Hash a default password
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123!', 12);

      await pool.query(
        `
        INSERT INTO users (email, hashed_password, name, first_name, last_name, role)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [
          'admin@prosecutor.law',
          hashedPassword,
          'System Administrator',
          'System',
          'Administrator',
          'admin',
        ]
      );

      console.log('✅ Default admin user created:');
      console.log('   Email: admin@prosecutor.law');
      console.log('   Password: admin123!');
    }

    console.log('✅ Database setup completed successfully!');
    console.log('');
    console.log('🔗 Database URL:', process.env.DATABASE_URL);
    console.log('');
    console.log('You can now start the application with: npm run dev');
  } catch (error) {
    console.error('❌ Error setting up database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the setup
setupDatabase().catch(console.error);
