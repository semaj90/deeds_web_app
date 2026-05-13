import { db } from './src/lib/server/db/client.ts';
import { sql } from 'drizzle-orm';
import fs from 'node:fs/promises';

async function registerFeatures() {
  console.log('🚀 Registering TurboVec Features...');

  try {
    const raw = await fs.readFile('./turbovec-feature-manifest.json', 'utf8');
    const manifest = JSON.parse(raw);

    for (const feature of manifest.features) {
      console.log(`   Upserting feature: ${feature.id}...`);
      
      await db.execute(sql`
        INSERT INTO enhanced_graph_mappings (id, kind, label, metadata, updated_at)
        VALUES (${feature.id}, 'feature', ${feature.title || ''}, ${JSON.stringify(feature)}::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET
          label = EXCLUDED.label,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `);
    }

    console.log('✅ Feature registration complete.');
  } catch (err) {
    console.error('❌ Feature registration failed:', err);
    process.exit(1);
  }
}

registerFeatures();
