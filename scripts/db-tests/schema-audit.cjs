const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

// Key tables to audit (Drizzle schema column names → actual PG column names expected)
const TABLES_TO_AUDIT = {
  users: {
    drizzle: ['id','email','hashed_password','username','first_name','last_name','role','department','jurisdiction','permissions','is_active','email_verified','avatar_url','last_login_at','practice_areas','bar_number','firm_name','profile_embedding','metadata','created_at','updated_at','deleted_at','has_completed_onboarding','onboarding_step','name'],
  },
  sessions: {
    drizzle: ['id','user_id','expires_at','ip_address','user_agent','session_context','created_at'],
  },
  cases: {
    drizzle: ['id','title','description','case_number','status','priority','practice_area','jurisdiction','court','client_name','opposing_party','user_id','assigned_attorney','filing_date','due_date','closed_date','qdrant_id','qdrant_collection','metadata','created_at','updated_at'],
  },
  evidence: {
    drizzle: ['id','case_id','title','description','type','file_url','file_name','file_size','mime_type','status','hash','extracted_text','summary','entities','keywords','embedding','metadata','uploaded_by','created_at','updated_at','deleted_at'],
  },
  persons_of_interest: {
    drizzle: ['id','name','description','aliases','threat_level','status','relationship','crimes','case_ids','photo_url','notes','metadata','created_at','updated_at'],
  },
  poi_photos: {
    drizzle: ['id','poi_id','minio_key','thumbnail_key','url','thumbnail_url','original_name','mime_type','size','ai_caption','ai_tags','exif_data','forensic_data','face_embedding','uploaded_at'],
  },
  timeline_events: {
    drizzle: ['id','poi_id','case_id','title','description','event_date','event_type','location','severity','metadata','created_by','created_at','updated_at'],
  },
  citations: {
    drizzle: ['id','case_id','title','source_type','source_name','source_url','quoted_text','page_number','relevance_score','notes','tags','embedding','metadata','created_by','created_at','updated_at'],
  },
  reports: {
    drizzle: ['id','case_id','title','report_type','content','status','format','metadata','created_by','created_at','updated_at'],
  },
};

async function audit() {
  console.log('=== POSTGRESQL SCHEMA AUDIT ===\n');

  // 1. Extensions
  const exts = await pool.query('SELECT extname, extversion FROM pg_extension ORDER BY extname');
  console.log('EXTENSIONS:');
  exts.rows.forEach(e => console.log(`  ✅ ${e.extname} v${e.extversion}`));
  console.log('');

  // 2. Table count
  const allTables = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);
  console.log(`TOTAL TABLES IN DB: ${allTables.rows.length}\n`);

  // 3. Audit each key table
  let totalMissing = 0;
  let totalExtra = 0;

  for (const [tableName, config] of Object.entries(TABLES_TO_AUDIT)) {
    const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [tableName]);
    const actualCols = cols.rows.map(r => r.column_name);

    if (actualCols.length === 0) {
      console.log(`❌ ${tableName}: TABLE DOES NOT EXIST`);
      totalMissing++;
      continue;
    }

    const drizzleCols = config.drizzle;
    const missing = drizzleCols.filter(c => !actualCols.includes(c));
    const extra = actualCols.filter(c => !drizzleCols.includes(c));

    if (missing.length === 0 && extra.length === 0) {
      console.log(`✅ ${tableName}: ${actualCols.length} cols — PERFECT MATCH`);
    } else {
      console.log(`⚠️  ${tableName}: ${actualCols.length} actual cols vs ${drizzleCols.length} expected`);
      if (missing.length > 0) {
        console.log(`   MISSING in DB (Drizzle expects): ${missing.join(', ')}`);
        totalMissing += missing.length;
      }
      if (extra.length > 0) {
        console.log(`   EXTRA in DB (not in Drizzle):    ${extra.join(', ')}`);
        totalExtra += extra.length;
      }
    }
  }

  // 4. FK constraints on critical tables
  console.log('\nFOREIGN KEY CONSTRAINTS:');
  const fks = await pool.query(`
    SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_table, rc.delete_rule
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc ON rc.constraint_name = tc.constraint_name
    JOIN information_schema.key_column_usage kcu ON rc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON rc.unique_constraint_name = ccu.constraint_name
    WHERE tc.table_name IN ('poi_photos','timeline_events','sessions','evidence','citations')
    ORDER BY tc.table_name
  `);
  if (fks.rows.length === 0) {
    console.log('  ⚠️  No FK constraints found on audited tables');
  } else {
    fks.rows.forEach(fk => console.log(`  ✅ ${fk.table_name}.${fk.column_name} → ${fk.ref_table} (ON DELETE ${fk.delete_rule})`));
  }

  // 5. Summary
  console.log(`\n=== SUMMARY ===`);
  console.log(`Tables in DB: ${allTables.rows.length}`);
  console.log(`Missing columns (need ALTER TABLE ADD): ${totalMissing}`);
  console.log(`Extra columns (in DB but not Drizzle): ${totalExtra}`);

  pool.end();
}

audit().catch(e => { console.error(e); pool.end(); });
