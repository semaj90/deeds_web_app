import fs from 'node:fs';
import path from 'node:path';

// This script simulates parsing Atlas cards and detecting new schema structures
// It writes a raw Drizzle sidecar SQL file when a new entity structure is detected.

function analyzeCardsForSchemaDrift(cardsPath) {
  try {
    const rawData = fs.readFileSync(cardsPath, 'utf-8');
    const cards = JSON.parse(rawData);
    
    // Simulate detecting a new 'evidence_tag' schema from legal doc analysis
    const detectedPatterns = cards.filter(c => JSON.stringify(c).includes('evidence_tag'));
    
    if (detectedPatterns.length > 5) {
      console.log(`[Schema-Evo] Detected consistent entity drift: 'evidence_tag' found ${detectedPatterns.length} times.`);
      
      const sql = `
-- AUTO GENERATED EVOLUTION MIGRATION
-- Pattern: evidence_tag
CREATE TABLE IF NOT EXISTS evidence_tags (
  id serial PRIMARY KEY,
  case_id integer REFERENCES cases(id),
  tag_name text NOT NULL,
  extracted_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evidence_tags_case_id ON evidence_tags(case_id);
`;
      
      const migrationDir = path.join(process.cwd(), 'drizzle');
      if (!fs.existsSync(migrationDir)) fs.mkdirSync(migrationDir);
      
      // Look for latest migration number to append sidecar
      const files = fs.readdirSync(migrationDir);
      const numbers = files.map(f => parseInt(f.substring(0, 4))).filter(n => !isNaN(n));
      const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
      const paddedNum = String(nextNum).padStart(4, '0');
      
      const filename = path.join(migrationDir, `${paddedNum}_auto_schema_evidence_tag.sql`);
      fs.writeFileSync(filename, sql.trim());
      
      console.log(`[Schema-Evo] Generated schema evolution sidecar: ${filename}`);
      console.log(`[Schema-Evo] Note: You must add this to drizzle/sidecar-migrations.json per Phase 6E policy.`);
    } else {
      console.log(`[Schema-Evo] No consistent entity drift detected.`);
    }
  } catch (err) {
    console.error(`[Schema-Evo] Failed to run schema evolution:`, err.message);
  }
}

const targetPath = path.join(process.cwd(), 'docs', 'atlas', 'feature-registry.json');
analyzeCardsForSchemaDrift(targetPath);
