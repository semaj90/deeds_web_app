import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL);

async function fixSchema() {
  console.log('🔧 Fixing error_suggestions schema...');

  try {
    // Add error_event_id
    await sql`ALTER TABLE error_suggestions ADD COLUMN IF NOT EXISTS error_event_id UUID`;
    console.log('✅ Added error_event_id');

    // Add cluster_id
    await sql`ALTER TABLE error_suggestions ADD COLUMN IF NOT EXISTS cluster_id TEXT`;
    console.log('✅ Added cluster_id');

    // Add created_by_user_id
    await sql`ALTER TABLE error_suggestions ADD COLUMN IF NOT EXISTS created_by_user_id TEXT`;
    console.log('✅ Added created_by_user_id');

    // Add applied_by_user_id
    await sql`ALTER TABLE error_suggestions ADD COLUMN IF NOT EXISTS applied_by_user_id TEXT`;
    console.log('✅ Added applied_by_user_id');

    // Add applied
    await sql`ALTER TABLE error_suggestions ADD COLUMN IF NOT EXISTS applied BOOLEAN NOT NULL DEFAULT FALSE`;
    console.log('✅ Added applied');

    // Add applied_at
    await sql`ALTER TABLE error_suggestions ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP WITH TIME ZONE`;
    console.log('✅ Added applied_at');

    // Add updated_at
    await sql`ALTER TABLE error_suggestions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`;
    console.log('✅ Added updated_at');

    // Fix created_at type if needed (optional, but good for consistency)
    // await sql`ALTER TABLE error_suggestions ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE`;

  } catch (error) {
    console.error('❌ Error fixing schema:', error);
  } finally {
    await sql.end();
  }
}

fixSchema();
