import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbUrl = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });

async function generateReport() {
  const { rows } = await pool.query('SELECT * FROM synthesis_logs ORDER BY created_at DESC LIMIT 100');
  let md = `# Synthesis Logs Report\n\nGenerated at: ${new Date().toISOString()}\n\n`;
  for (const row of rows) {
    md += `## Run ID: ${row.run_id}\n`;
    md += `- Stage: ${row.source_stage}\n`;
    md += `- Path Mappings: ${row.path_mapping?.length || 0}\n`;
    md += `- Dynamic Imports: ${row.dynamic_imports?.length || 0}\n`;
    md += `- Protocols: ${JSON.stringify(row.protocols || [])}\n`;
    md += `- Manifold4: ${JSON.stringify(row.manifold4 || {})}\n\n`;
  }
  
  const reportPath = path.resolve(ROOT_DIR, 'docs/reports/synthesis-log-latest.md');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, md, 'utf8');
  console.log(`Saved report to ${reportPath}`);
  await pool.end();
}

generateReport().catch(console.error);
