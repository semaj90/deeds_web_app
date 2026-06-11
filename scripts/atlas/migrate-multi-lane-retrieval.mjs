#!/usr/bin/env node
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

async function main() {
  const e = loadRepoEnv(process.env);
  const dbUrl = resolveDatabaseUrl(e);
  console.log('Connecting to PostgreSQL database...');

  const pool = new pg.Pool({ connectionString: dbUrl });

  try {
    // 1. Enable pg_trgm extension
    console.log('Enabling pg_trgm extension...');
    await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');

    // 2. Create GIN index on nes_chrom_packets.summary
    console.log('Creating GIN trigram index on nes_chrom_packets.summary...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS nes_chrom_packets_summary_trgm_idx 
      ON nes_chrom_packets 
      USING gin (summary gin_trgm_ops)
    `);

    // 3. Create GIN index on source_ref
    console.log('Creating GIN trigram index on nes_chrom_packets.source_ref...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS nes_chrom_packets_source_ref_trgm_idx 
      ON nes_chrom_packets 
      USING gin (source_ref gin_trgm_ops)
    `);

    // 4. Create functional GIN index on normalized source_ref
    console.log('Creating functional GIN trigram index on normalized source_ref...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS nes_chrom_packets_norm_source_ref_trgm_idx 
      ON nes_chrom_packets 
      USING gin (
        regexp_replace(regexp_replace(source_ref, '^(\\.\\./)+', ''), '^sveltekit-frontend/', '') gin_trgm_ops
      )
    `);

    // 5. Create packet_markdown_chunks table
    console.log('Creating packet_markdown_chunks table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS packet_markdown_chunks (
        id SERIAL PRIMARY KEY,
        packet_key TEXT NOT NULL,
        chunk_index INT NOT NULL,
        markdown_content TEXT NOT NULL,
        ts_vector TSVECTOR,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT fk_packet_markdown_chunks_packet_key 
          FOREIGN KEY (packet_key) 
          REFERENCES nes_chrom_packets(packet_key) 
          ON DELETE CASCADE
      )
    `);

    // 6. Create indexes on packet_markdown_chunks
    console.log('Creating indexes on packet_markdown_chunks...');
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS packet_markdown_chunks_key_chunk_idx 
      ON packet_markdown_chunks (packet_key, chunk_index)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS packet_markdown_chunks_ts_vector_idx 
      ON packet_markdown_chunks 
      USING gin (ts_vector)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS packet_markdown_chunks_markdown_content_trgm_idx 
      ON packet_markdown_chunks 
      USING gin (markdown_content gin_trgm_ops)
    `);

    console.log('Migrations completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
