import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db'
});

async function main() {
  await client.connect();

  const cols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'error_logs' ORDER BY ordinal_position"
  );
  console.log('error_logs columns:', cols.rows.map(c => c.column_name));

  const countRes = await client.query('SELECT count(*) FROM error_logs');
  console.log('Total error_logs count:', countRes.rows[0].count);

  const recent = await client.query(
    'SELECT * FROM error_logs ORDER BY id DESC LIMIT 5'
  );
  console.log('Recent 5 error logs:');
  recent.rows.forEach(r => {
    console.log(`[${r.id}] ${r.created_at || ''} | ${r.severity || ''} | ${r.component || ''} | ${(r.error_message || r.message || '').slice(0, 120)}`);
  });

  await client.end();
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
