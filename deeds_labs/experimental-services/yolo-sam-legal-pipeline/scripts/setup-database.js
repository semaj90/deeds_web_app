const { Pool } = require('pg');
require('dotenv').config();

async function setupDatabase() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'legal_ai_db',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
  });

  try {
    console.log('Setting up PostgreSQL database for YOLO/SAM pipeline...');

    // Create pgvector extension if it doesn't exist
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');

    // Create document_analyses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_analyses (
        id UUID PRIMARY KEY,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        entities JSONB NOT NULL,
        extracted_text TEXT,
        processing_time INTEGER NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        minio_path TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Create index on timestamp for efficient querying
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_document_analyses_timestamp
      ON document_analyses (timestamp DESC);
    `);

    // Create index on filename for search
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_document_analyses_filename
      ON document_analyses USING gin (to_tsvector('english', filename));
    `);

    // Create embeddings table for vector search
    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_embeddings (
        id UUID PRIMARY KEY,
        analysis_id UUID REFERENCES document_analyses(id) ON DELETE CASCADE,
        entity_id UUID NOT NULL,
        embedding vector(512),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Create index for vector similarity search
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_document_embeddings_embedding
      ON document_embeddings USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    `);

    console.log('✅ Database setup complete!');
    console.log('Created tables:');
    console.log('  - document_analyses');
    console.log('  - document_embeddings');
    console.log('Created indexes for efficient querying and vector search.');

  } catch (error) {
    console.error('❌ Error setting up database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run setup if called directly
if (require.main === module) {
  setupDatabase().catch((error) => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}

module.exports = { setupDatabase };