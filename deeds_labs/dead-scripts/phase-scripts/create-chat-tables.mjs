// Create tables for chat history and evidence metadata
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/legal_ai_db';
const sql = postgres(connectionString);

async function createTables() {
  try {
    console.log('Creating chat history and evidence tables...');

    // Create chat_turns table
    await sql`CREATE TABLE IF NOT EXISTS chat_turns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id UUID,
      user_message TEXT NOT NULL,
      assistant_response TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`;

    // Create evidence_files table
    await sql`CREATE TABLE IF NOT EXISTS evidence_files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chat_turn_id UUID REFERENCES chat_turns(id),
      case_id UUID,
      filename TEXT NOT NULL,
      minio_object_name TEXT NOT NULL,
      content_type TEXT,
      size_bytes BIGINT,
      extracted_text TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`;

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_turns_case_id ON chat_turns(case_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_turns_created_at ON chat_turns(created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_evidence_files_chat_turn_id ON evidence_files(chat_turn_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_evidence_files_case_id ON evidence_files(case_id)`;

    console.log('Tables created successfully!');
  } catch (error) {
    console.error('Error creating tables:', error);
  } finally {
    await sql.end();
  }
}

createTables();