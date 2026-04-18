/**
 * Bulk Glossary Seeder — combines all batch files and inserts into legal_glossary
 * Usage: node scripts/seed_glossary_bulk.cjs
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

async function main() {
  // Load all batch files
  const batchFiles = [];
  for (let i = 1; i <= 14; i++) {
    const fp = path.join(__dirname, `glossary_batch_${i}.cjs`);
    if (fs.existsSync(fp)) {
      batchFiles.push(fp);
    } else {
      console.log(`  SKIP batch ${i} — file not found`);
    }
  }

  if (batchFiles.length === 0) {
    console.error('No batch files found!');
    process.exit(1);
  }

  // Collect all terms
  let allTerms = [];
  for (const fp of batchFiles) {
    const mod = require(fp);
    const terms = mod.terms || [];
    console.log(`  Loaded ${terms.length} terms from ${path.basename(fp)}`);
    allTerms = allTerms.concat(terms);
  }
  console.log(`\nTotal terms loaded: ${allTerms.length}`);

  // Get existing terms for dedup
  const existingRes = await pool.query('SELECT LOWER(term) as term FROM legal_glossary');
  const existing = new Set(existingRes.rows.map(r => r.term));
  console.log(`Existing terms in DB: ${existing.size}`);

  // Filter out duplicates
  const newTerms = allTerms.filter(t => !existing.has(t[0].toLowerCase()));
  const skipped = allTerms.length - newTerms.length;
  console.log(`New terms to insert: ${newTerms.length} (${skipped} duplicates skipped)\n`);

  // Insert in batches of 25
  let inserted = 0;
  let errors = 0;
  const BATCH_SIZE = 25;

  for (let i = 0; i < newTerms.length; i += BATCH_SIZE) {
    const batch = newTerms.slice(i, i + BATCH_SIZE);
    const values = [];
    const params = [];
    let paramIdx = 1;

    for (const [term, definition, category, jurisdiction, relatedTerms, sources] of batch) {
      values.push(`($${paramIdx}, $${paramIdx+1}, $${paramIdx+2}, $${paramIdx+3}, $${paramIdx+4}, $${paramIdx+5})`);
      params.push(
        term,
        definition,
        category || 'general',
        jurisdiction || 'Federal/State',
        JSON.stringify(relatedTerms || []),
        JSON.stringify(sources || [])
      );
      paramIdx += 6;
    }

    try {
      await pool.query(
        `INSERT INTO legal_glossary (term, definition, category, jurisdiction, related_terms, sources)
         VALUES ${values.join(', ')}
         ON CONFLICT DO NOTHING`,
        params
      );
      inserted += batch.length;
      process.stdout.write(`\r  Inserted: ${inserted}/${newTerms.length}`);
    } catch (err) {
      console.error(`\n  ERROR batch at index ${i}: ${err.message}`);
      // Try one-by-one fallback
      for (const [term, definition, category, jurisdiction, relatedTerms, sources] of batch) {
        try {
          await pool.query(
            `INSERT INTO legal_glossary (term, definition, category, jurisdiction, related_terms, sources)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT DO NOTHING`,
            [term, definition, category || 'general', jurisdiction || 'Federal/State',
             JSON.stringify(relatedTerms || []), JSON.stringify(sources || [])]
          );
          inserted++;
        } catch (e2) {
          errors++;
          console.error(`  SKIP "${term}": ${e2.message}`);
        }
      }
    }
  }

  // Final count
  const countRes = await pool.query('SELECT COUNT(*) as total FROM legal_glossary');
  console.log(`\n\n=== SEED COMPLETE ===`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped (dupes): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total in DB: ${countRes.rows[0].total}`);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });