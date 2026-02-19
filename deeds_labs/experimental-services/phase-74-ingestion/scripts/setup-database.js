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
    console.log('Setting up PostgreSQL database for Phase-74 ingestion...');

    // Enable pgvector extension
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');

    // Create documents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size BIGINT NOT NULL,
        hash TEXT NOT NULL,
        uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL,
        processed_at TIMESTAMP WITH TIME ZONE,
        status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        error TEXT,
        content TEXT,
        summary TEXT,
        keywords TEXT[],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Create document_embeddings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_embeddings (
        id UUID PRIMARY KEY,
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        embedding vector(512),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Create document_entities table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_entities (
        id UUID PRIMARY KEY,
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        text TEXT NOT NULL,
        confidence REAL NOT NULL,
        start_pos INTEGER NOT NULL,
        end_pos INTEGER NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Create document_chunks table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id UUID PRIMARY KEY,
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        embedding vector(512),
        start_pos INTEGER NOT NULL,
        end_pos INTEGER NOT NULL,
        page INTEGER,
        entities JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Create indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents (uploaded_at DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_filename ON documents USING gin (to_tsvector('english', filename));
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_content ON documents USING gin (to_tsvector('english', content));
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_id ON document_embeddings (document_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_document_entities_document_id ON document_entities (document_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_document_entities_type ON document_entities (type);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks (document_id);
    `);

    // Create vector similarity search index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_document_embeddings_embedding
      ON document_embeddings USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
      ON document_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    `);

    console.log('✅ Database setup complete!');
    console.log('Created tables:');
    console.log('  - documents');
    console.log('  - document_embeddings');
    console.log('  - document_entities');
    console.log('  - document_chunks');
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