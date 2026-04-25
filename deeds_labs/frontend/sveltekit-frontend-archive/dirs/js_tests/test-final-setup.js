console.log('🔧 Final PostgreSQL Setup Check...');

// Force environment to use PostgreSQL
process.env.NODE_ENV = 'testing';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/prosecutor_db';

console.log('Environment:');
console.log('  NODE_ENV:', process.env.NODE_ENV);
console.log('  DATABASE_URL:', process.env.DATABASE_URL);

// Test database connection with the app's database module
import('./src/lib/server/db/index.js')
  .then(async (dbModule) => {
    console.log('\n📊 Testing database connection...');

    const db = dbModule.db;
    if (!db) {
      console.error('❌ Database connection failed - db is null');
      return;
    }

    console.log('✅ Database module loaded successfully');
    console.log('🎉 PostgreSQL is ready!');

    console.log('\n🚀 You can now start the development server with:');
    console.log('  npm run dev');
  })
  .catch((error) => {
    console.error('❌ Database test failed:', error.message);

    console.log('\n💡 Try these steps:');
    console.log('  1. Make sure Docker is running');
    console.log('  2. Start PostgreSQL: docker-compose up -d postgres');
    console.log('  3. Wait 10 seconds for PostgreSQL to start');
    console.log('  4. Run database migrations: npx drizzle-kit push');
    console.log('  5. Try again');
  });
