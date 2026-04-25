import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

// Config
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';

console.log(`🔌 Connecting to database at ${DATABASE_URL}...`);

const sql = postgres(DATABASE_URL);

async function main() {
  const migrationFile = path.join(process.cwd(), 'drizzle', 'cutlass_schema.sql');

  console.log(`📖 Reading migration file: ${migrationFile}`);
  const migrationSql = fs.readFileSync(migrationFile, 'utf8');

  console.log('🚀 Applying migration...');

  // Split into statements if needed, but postgres.js might handle multi-statement strings
  // Typically simpler to run as one block if supported
  try {
    await sql.unsafe(migrationSql);
    console.log('✅ Migration applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
