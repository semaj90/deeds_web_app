import { db } from '../src/lib/server/db/client.ts';
import { sql } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';

async function ingestJsonl() {
  console.log('🚀 Ingesting Enhanced Graph JSONL...');

  const jsonlPath = './build/enhanced-graph-mappings.jsonl';
  
  try {
    // Ensure build directory exists
    await fs.mkdir('./build', { recursive: true });

    // For testing/mocking if file doesn't exist yet
    if (!(await fs.access(jsonlPath).then(() => true).catch(() => false))) {
       console.log('   [WARN] build/enhanced-graph-mappings.jsonl not found. Creating mock data...');
       const mock = [
         { id: 'file:src/lib/server/features/feature-map-compiler.ts', kind: 'file', metadata: { title: 'FeatureMap Compiler' } },
         { id: 'cluster:core-logic', kind: 'cluster', metadata: { title: 'Core Logic Cluster' } },
         { id: 'svg:feature-map-flow', kind: 'svg', metadata: { title: 'FeatureMap Flow Diagram' } }
       ];
       await fs.writeFile(jsonlPath, mock.map(m => JSON.stringify(m)).join('\n'));
    }

    const content = await fs.readFile(jsonlPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());

    let upserted = 0;
    const byKind = { cluster: 0, file: 0, svg: 0 };

    for (const line of lines) {
      const mapping = JSON.parse(line);
      
      await db.execute(sql`
        INSERT INTO enhanced_graph_mappings (id, kind, label, metadata, updated_at)
        VALUES (${mapping.id}, ${mapping.kind}, ${mapping.metadata?.title || mapping.metadata?.label || ''}, ${JSON.stringify(mapping.metadata)}::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET
          label = EXCLUDED.label,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `);
      
      upserted++;
      if (mapping.kind in byKind) {
        byKind[mapping.kind]++;
      }
    }

    console.log('✅ Ingest complete.');
    console.log(JSON.stringify({
      mode: 'upsert',
      mappingCount: lines.length,
      upserted,
      byKind
    }, null, 2));

  } catch (err) {
    console.error('❌ Ingest failed:', err);
    process.exit(1);
  }
}

ingestJsonl();
