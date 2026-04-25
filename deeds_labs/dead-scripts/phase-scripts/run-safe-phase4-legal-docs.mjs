import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const sqlFile = path.join(process.cwd(), 'drizzle', 'safe_phase4_legal_documents_created_by.sql');

async function main() {
  console.log('🚀 Starting Safe Phase 4 – legal_documents.created_by...');
  const db = postgres(process.env.DATABASE_URL);

  try {
    console.log('📡 Connecting to database...');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('⚡ Executing SQL file:', sqlFile);
    await db.unsafe(sql);

    console.log('✅ legal_documents.created_by column + FK are in place');
    console.log('📋 To verify, run: psql -U postgres -h localhost -d legal_ai_db -c \'\\d "legal_documents"\'');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await db.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
