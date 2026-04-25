import { sql } from './src/lib/server/db.ts';

(async () => {
  try {
    const result = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    const tables = result.map(r => r.table_name).filter(t => t.includes('rag') || t.includes('evidence') || t.includes('citation'));
    console.log('Relevant tables:', tables);
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();