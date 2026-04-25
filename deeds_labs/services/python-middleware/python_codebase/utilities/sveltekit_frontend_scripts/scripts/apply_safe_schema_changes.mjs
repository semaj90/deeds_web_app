import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_test';
const statements = [
  {
    name: 'ALTER vector_metadata.document_id to uuid using cast',
    sql: `ALTER TABLE vector_metadata ALTER COLUMN document_id SET DATA TYPE uuid USING document_id::uuid;`,
  },
  {
    name: 'CREATE keys table if not exists',
    sql: `CREATE TABLE IF NOT EXISTS keys (
      id varchar(255) PRIMARY KEY NOT NULL,
      user_id uuid NOT NULL,
      hashed_password varchar(255),
      provider_id varchar(255),
      provider_user_id varchar(255),
      created_at timestamp with time zone DEFAULT now() NOT NULL
    );`,
  },
  {
    name: 'ADD FK keys.user_id -> users.id (if not exists)',
    sql: `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'keys_user_id_users_id_fk') THEN
        ALTER TABLE keys ADD CONSTRAINT keys_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE cascade;
      END IF; END $$;`,
  },
  {
    name: 'CREATE btree index on vector_metadata.document_id',
    sql: `CREATE INDEX IF NOT EXISTS vector_metadata_document_id_idx ON vector_metadata USING btree (document_id);`,
  },
  {
    name: 'CREATE hnsw index on vector_metadata.embedding (may fail if extension missing)',
    sql: `DO $$ BEGIN
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'vector_metadata_embedding_hnsw_idx') THEN
          EXECUTE 'CREATE INDEX vector_metadata_embedding_hnsw_idx ON vector_metadata USING hnsw (embedding vector_cosine_ops);';
        END IF;
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Skipping hnsw index creation: %', SQLERRM;
      END;
    END $$;`,
  },
];

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to DB. Executing safe statements:');
    for (const s of statements) {
      try {
        console.log('\n--', s.name);
        const res = await client.query(s.sql);
        console.log('OK');
      } catch (e) {
        console.error('FAILED:', s.name, '-', e && e.message ? e.message : e);
        // continue to next statement
      }
    }
    console.log('\nDone.');
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err && err.message ? err.message : err);
    try {
      await client.end();
    } catch (e) {}
    process.exit(1);
  }
}

run();
