// Simple PostgreSQL database initialization
import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const databaseUrl =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/prosecutor_db';

async function initializePostgreSQL() {
  console.log('🔧 Initializing PostgreSQL database...');
  console.log('Database URL:', databaseUrl.replace(/\/\/.*@/, '//***:***@')); // Hide credentials in log

  try {
    const pool = new Pool({
      connectionString: databaseUrl,
    });

    const client = await pool.connect();
    console.log('✅ PostgreSQL connection successful');

    // Check if users table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    if (tableCheck.rows[0].exists) {
      console.log('✅ Users table exists');

      // Check if we have any users
      const userCount = await client.query('SELECT COUNT(*) FROM users');
      console.log(`📊 Found ${userCount.rows[0].count} users in database`);

      if (userCount.rows[0].count === '0') {
        console.log('📝 Creating demo user...');

        // Create a simple demo user (we'll handle password hashing separately)
        await client.query(
          `
          INSERT INTO users (email, name, first_name, last_name, role, hashed_password)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
          [
            'admin@prosecutor.com',
            'System Administrator',
            'Admin',
            'User',
            'admin',
            '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
          ]
        );

        console.log('✅ Demo user created (email: admin@prosecutor.com, password: password)');
      }
    } else {
      console.log('❌ Users table does not exist. Please run database migrations first.');
      console.log('💡 Try running: npx drizzle-kit push');
    }

    client.release();
    await pool.end();

    console.log('🎉 PostgreSQL initialization complete!');
  } catch (error) {
    console.error('❌ PostgreSQL initialization failed:', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Make sure PostgreSQL is running. Try: docker-compose up -d postgres');
    }
  }
}

initializePostgreSQL();
