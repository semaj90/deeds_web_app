const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

async function main() {
  const stats = await p.query('SELECT COUNT(*) as total, COUNT(embedding) as embedded FROM legal_glossary');
  console.log('DB: total=' + stats.rows[0].total + ' embedded=' + stats.rows[0].embedded);

  // Check for specific MPC/USSG terms
  const check = await p.query(`
    SELECT term FROM legal_glossary
    WHERE LOWER(term) IN ('purposely','knowingly','recklessly','negligently',
      'model penal code','mpc 2.02','culpability',
      'ussg','sentencing guidelines','aggravating factor','mitigating factor',
      'departure','substantial assistance',
      'ness test','loss of chance','market share liability',
      'battle of forms','ucc 2-207',
      'erga omnes','universality principle',
      'plenary power','trust responsibility')
    ORDER BY term
  `);
  console.log('\nDB matches for target terms:', check.rows.length);
  check.rows.forEach(r => console.log('  - ' + r.term));

  await p.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
