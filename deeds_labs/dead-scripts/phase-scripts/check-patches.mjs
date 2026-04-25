import { dirname } from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Direct PostgreSQL query instead of Drizzle to avoid $lib alias issues
const client = new pg.Client({
  host: 'localhost',
  port: 5432,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.PGPASSWORD || '123456'
});

await client.connect();

const result = await client.query('SELECT * FROM error_suggestions ORDER BY created_at DESC');
const patches = result.rows;
console.log('Total patches:', patches.length);
console.log('Applied:', patches.filter(p => p.applied).length);
console.log('Pending:', patches.filter(p => !p.applied).length);

console.log('\nMost recent patches:');
patches
	.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
	.slice(0, 5)
	.forEach(p => {
		console.log(`  - ${p.route_path}: ${p.summary?.substring(0, 60)}... (${p.risk_level})`);
	});

await client.end();
process.exit(0);
