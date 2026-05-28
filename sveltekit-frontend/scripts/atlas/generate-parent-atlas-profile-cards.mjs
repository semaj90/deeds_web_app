#!/usr/bin/env node
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const CWD = process.cwd();
const OUT_DIR = path.join(CWD, '.tmp');
const OUT_JSONL = path.join(OUT_DIR, 'parent-atlas-profile-cards.jsonl');
const OUT_REPORT = path.join(CWD, 'reports', 'parent-atlas-profile-cards.md');

// Inputs
const INPUT_LOCATIONS = [
  path.join(CWD, '..', 'memory', 'knowledge', 'schema-indexer-contract-cards.jsonl'),
  path.join(CWD, 'memory', 'knowledge', 'schema-indexer-contract-cards.jsonl')
];

async function run() {
  let inputPath = '';
  for (const p of INPUT_LOCATIONS) {
    if (existsSync(p)) {
      inputPath = p;
      break;
    }
  }

  if (!inputPath) {
    console.error('❌ Error: Could not find schema-indexer-contract-cards.jsonl');
    process.exit(1);
  }

  console.log(`Loading inputs from: ${inputPath}`);
  const content = await fs.readFile(inputPath, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(OUT_REPORT), { recursive: true });

  const cards = [];

  for (const line of lines) {
    try {
      const originalCard = JSON.parse(line);
      
      // Map original contract card to feature-profile layout
      const profileCard = {
        card_id: originalCard.cardId || originalCard.id || 'schema-indexer:contract',
        sourceRef: (originalCard.sourceRefs && originalCard.sourceRefs[0]) || 'scripts/codebase-semantic-indexer.ts',
        feature_label: (originalCard.featureLabels && originalCard.featureLabels[0]) || 'schema-indexer-contract',
        hot_keywords: originalCard.clusterTags || originalCard.featureLabels || [],
        dependencies: originalCard.graphLinks ? originalCard.graphLinks.map(l => l.targetId) : [],
        imports: originalCard.entities?.files ? originalCard.entities.files.slice(0, 10) : [],
        exports: originalCard.chunkIds || [],
        routes: originalCard.entities?.routes || [],
        mcp_tools: originalCard.entities?.commands || [],
        db_tables: originalCard.tables || originalCard.entities?.tables || [],
        qdrant_collection: 'codebase_chunks_768',
        redis_keys: originalCard.retrieval?.redisKey ? [originalCard.retrieval.redisKey] : [],
        network_protocols: 'http',
        encoding_profile: 'json',
        missing_getters: [],
        missing_setters: [],
        missing_logs: [],
        implementation_status: 'candidate_complete',
        nextAction: 'index:qdrant'
      };

      cards.push(profileCard);
    } catch (e) {
      console.error('Failed to parse line:', e);
    }
  }

  // Write .jsonl
  await fs.writeFile(OUT_JSONL, cards.map(c => JSON.stringify(c)).join('\n') + '\n', 'utf8');
  console.log(`Wrote ${cards.length} cards to ${OUT_JSONL}`);

  // Write MD report
  const reportContent = [
    '# Parent Atlas Profile Cards Report',
    '',
    `**Generated At**: ${new Date().toISOString()}`,
    `**Total Profile Cards**: ${cards.length}`,
    '',
    '## Active Profile Cards',
    '',
    cards.map(c => `### Card: ${c.card_id}
- **Feature Label**: ${c.feature_label}
- **SourceRef**: [${path.basename(c.sourceRef)}](file:///${path.resolve(c.sourceRef).replace(/\\/g, '/')})
- **Hot Keywords**: ${c.hot_keywords.join(', ')}
- **Dependencies**: ${c.dependencies.join(', ')}
- **Database Tables**: ${c.db_tables.slice(0, 5).join(', ')} (and ${Math.max(0, c.db_tables.length - 5)} more)
- **Status**: \`${c.implementation_status}\`
- **Next Action**: \`${c.nextAction}\``).join('\n\n'),
    ''
  ].join('\n');

  await fs.writeFile(OUT_REPORT, reportContent, 'utf8');
  console.log(`Wrote report to ${OUT_REPORT}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
