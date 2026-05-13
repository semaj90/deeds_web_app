import { db } from '../src/lib/server/db/client.ts';
import { sql } from 'drizzle-orm';

async function createTable() {
  console.log('🚀 Creating enhanced_graph_mappings table...');

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS enhanced_graph_mappings (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        path TEXT,
        summary TEXT,
        edges JSONB NOT NULL DEFAULT '[]',
        scores JSONB NOT NULL DEFAULT '{}',
        flags INTEGER NOT NULL DEFAULT 0,
        vectors JSONB NOT NULL DEFAULT '{}',
        manifold4 REAL[],
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_enhanced_graph_kind ON enhanced_graph_mappings (kind);
    `);

    console.log('✅ Table creation complete.');
  } catch (err) {
    console.error('❌ Table creation failed:', err);
    process.exit(1);
  }
}

createTable();
