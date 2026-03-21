const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db' });

// ALTER TABLE ADD COLUMN IF NOT EXISTS for each missing column
// Using safe types matching Drizzle schema-postgres.ts definitions
const ALTERS = [
  // evidence table (6 missing)
  `ALTER TABLE evidence ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending'`,
  `ALTER TABLE evidence ADD COLUMN IF NOT EXISTS extracted_text TEXT`,
  `ALTER TABLE evidence ADD COLUMN IF NOT EXISTS entities JSONB DEFAULT '[]'`,
  `ALTER TABLE evidence ADD COLUMN IF NOT EXISTS keywords JSONB DEFAULT '[]'`,
  `ALTER TABLE evidence ADD COLUMN IF NOT EXISTS embedding vector(768)`,
  `ALTER TABLE evidence ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,

  // persons_of_interest (3 missing)
  `ALTER TABLE persons_of_interest ADD COLUMN IF NOT EXISTS photo_url TEXT`,
  `ALTER TABLE persons_of_interest ADD COLUMN IF NOT EXISTS notes TEXT`,
  `ALTER TABLE persons_of_interest ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`,

  // citations (8 missing)
  `ALTER TABLE citations ADD COLUMN IF NOT EXISTS title VARCHAR(500)`,
  `ALTER TABLE citations ADD COLUMN IF NOT EXISTS source_type VARCHAR(100)`,
  `ALTER TABLE citations ADD COLUMN IF NOT EXISTS source_name VARCHAR(500)`,
  `ALTER TABLE citations ADD COLUMN IF NOT EXISTS source_url TEXT`,
  `ALTER TABLE citations ADD COLUMN IF NOT EXISTS notes TEXT`,
  `ALTER TABLE citations ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'`,
  `ALTER TABLE citations ADD COLUMN IF NOT EXISTS embedding vector(768)`,
  `ALTER TABLE citations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`,

  // reports (2 missing)
  `ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_type VARCHAR(100)`,
  `ALTER TABLE reports ADD COLUMN IF NOT EXISTS format VARCHAR(50) DEFAULT 'html'`,
];

async function run() {
  let ok = 0, fail = 0;
  for (const sql of ALTERS) {
    try {
      await pool.query(sql);
      const match = sql.match(/ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+)/);
      console.log(`✅ ${match[1]}.${match[2]}`);
      ok++;
    } catch (e) {
      const match = sql.match(/ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+)/);
      console.error(`❌ ${match[1]}.${match[2]}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\nDone: ${ok} added, ${fail} failed`);
  pool.end();
}

run().catch(e => { console.error(e); pool.end(); });
