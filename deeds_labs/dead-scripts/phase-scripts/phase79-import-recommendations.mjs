import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import postgres from 'postgres';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, '../data/recommendations.jsonl');
const sql = postgres(process.env.DATABASE_URL);

async function main() {
  console.log('📥 Importing recommendations from JSONL to DB...');

  try {
    const content = await fs.readFile(INPUT_FILE, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    console.log(`   Found ${lines.length} recommendations.`);

    for (const line of lines) {
      try {
        const rec = JSON.parse(line);
        if (!rec.full_patch) continue;

        // Find cluster_id for this file
        // We take the first cluster associated with this file for now
        const clusters = await sql`
          SELECT cluster_id, route_id
          FROM error_cluster
          WHERE file_path = ${rec.file_path} OR file_path = ${rec.file_path.replace('src/', '')}
          LIMIT 1
        `;

        if (clusters.length === 0) {
          console.warn(`   ⚠️ No cluster found for ${rec.file_path}, skipping.`);
          continue;
        }

        const cluster = clusters[0];

        // Insert into error_suggestions
        // Check if exists first to avoid duplicates
        const existing = await sql`
          SELECT id FROM error_suggestions
          WHERE cluster_id = ${cluster.cluster_id} AND source = 'phase79-engine'
        `;

        if (existing.length > 0) {
          console.log(`   ⏭️ Suggestion already exists for ${rec.file_path}`);
          continue;
        }

        await sql`
          INSERT INTO error_suggestions (
            route_path,
            summary,
            patch,
            risk_level,
            source,
            cluster_id,
            applied
          ) VALUES (
            ${cluster.route_id || 'unknown'},
            ${`Phase 79 AI Fix (${rec.confidence_level})`},
            ${rec.full_patch},
            ${rec.confidence_level === 'HIGH' ? 'low' : 'medium'},
            'phase79-engine',
            ${cluster.cluster_id},
            false
          )
        `;

        console.log(`   ✅ Imported fix for ${rec.file_path}`);

      } catch (e) {
        console.error(`   ❌ Failed to process line: ${e.message}`);
      }
    }

  } catch (e) {
    console.error(`❌ Error reading file: ${e.message}`);
  } finally {
    await sql.end();
  }
}

main();
