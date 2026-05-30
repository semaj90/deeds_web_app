import fs from 'fs';
import path from 'path';

console.log('🚀 Unified Codebase Ingester Starting');

const workspaceRoot = 'c:/Users/james/Videos/deeds-web-app/sveltekit-frontend';
const inputDir = path.join(workspaceRoot, '.tmp/ingest/lanes');
const outputDir = path.join(workspaceRoot, 'memory/exports/atlas');
const outputNdjsonPath = path.join(outputDir, 'codebase-ingest.ndjson');
const outputManifestPath = path.join(outputDir, 'codebase-ingest-manifest.json');

// Ensure directories exist
fs.mkdirSync(inputDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const isDryRun = process.argv.includes('--dry-run');

// If directory is empty, seed a dry-run dummy file so it has something to ingest
const files = fs.readdirSync(inputDir);
if (files.length === 0) {
  console.log(`[Ingester] Input directory ${inputDir} is empty. Seeding a test lane entry for validation...`);
  const dummyEntry = {
    sourceRef: 'c:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/ai/openai-facade.ts',
    graphVersion: '2026-05-30',
    lane: 'lane-default',
    kind: 'node',
    metadata: { test: true }
  };
  fs.writeFileSync(path.join(inputDir, 'test-lane.ndjson'), JSON.stringify(dummyEntry) + '\n');
}

const allFiles = fs.readdirSync(inputDir).filter(f => f.endsWith('.ndjson') || f.endsWith('.csv'));
console.log(`[Ingester] Found ${allFiles.length} file(s) for ingestion.`);

const records = [];
let totalProcessed = 0;
let totalFailed = 0;

const stats = {
  totalRecords: 0,
  kinds: { node: 0, edge: 0, card: 0, reward: 0, glyph: 0 },
  lanes: {},
  filesProcessed: []
};

for (const file of allFiles) {
  const filePath = path.join(inputDir, file);
  stats.filesProcessed.push(file);

  if (file.endsWith('.ndjson')) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const record = JSON.parse(line);

        // Validation Contract
        if (!record.sourceRef) throw new Error('Missing sourceRef');
        if (!record.graphVersion) throw new Error('Missing graphVersion');
        if (!record.lane) throw new Error('Missing lane');
        if (!['node', 'edge', 'card', 'reward', 'glyph'].includes(record.kind)) {
          throw new Error(`Invalid kind: ${record.kind}`);
        }

        records.push(record);
        totalProcessed++;

        // Track stats
        stats.kinds[record.kind] = (stats.kinds[record.kind] || 0) + 1;
        stats.lanes[record.lane] = (stats.lanes[record.lane] || 0) + 1;
      } catch (err) {
        totalFailed++;
        console.warn(`[Ingester] Failed to parse line ${i + 1} in ${file}:`, err.message);
      }
    }
  } else if (file.endsWith('.csv')) {
    // Simple CSV parser
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    if (lines.length > 1) {
      const headers = lines[0].split(',').map(h => h.trim());
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = line.split(',').map(v => v.trim());
        const record = {};
        headers.forEach((h, idx) => {
          record[h] = values[idx];
        });

        try {
          if (!record.sourceRef) throw new Error('Missing sourceRef');
          if (!record.graphVersion) throw new Error('Missing graphVersion');
          if (!record.lane) throw new Error('Missing lane');
          if (!['node', 'edge', 'card', 'reward', 'glyph'].includes(record.kind)) {
            throw new Error(`Invalid kind: ${record.kind}`);
          }

          records.push(record);
          totalProcessed++;

          stats.kinds[record.kind] = (stats.kinds[record.kind] || 0) + 1;
          stats.lanes[record.lane] = (stats.lanes[record.lane] || 0) + 1;
        } catch (err) {
          totalFailed++;
          console.warn(`[Ingester] Failed to validate CSV row ${i} in ${file}:`, err.message);
        }
      }
    }
  }
}

stats.totalRecords = totalProcessed;

if (isDryRun) {
  console.log(`[Ingester] [DRY RUN] Would write ${totalProcessed} records to ${outputNdjsonPath}`);
  console.log('[Ingester] [DRY RUN] Manifest structure:', JSON.stringify({ stats, totalFailed }, null, 2));
} else {
  fs.writeFileSync(outputNdjsonPath, records.map(r => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(outputManifestPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    stats,
    totalFailed
  }, null, 2));
  console.log(`[Ingester] Successfully wrote ${totalProcessed} records to ${outputNdjsonPath}`);
  console.log(`[Ingester] Manifest written to ${outputManifestPath}`);
}
