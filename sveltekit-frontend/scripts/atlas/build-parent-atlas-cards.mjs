#!/usr/bin/env node
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const CWD = process.cwd();
const OUT_DIR = path.join(CWD, '.tmp');
const OUT_JSONL = path.join(OUT_DIR, 'parent-atlas-profile-cards.jsonl');
const OUT_REPORT = path.join(CWD, 'reports', 'parent-atlas-profile-cards.md');

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
      const orig = JSON.parse(line);
      
      const card = {
        card_id: orig.cardId || orig.id || 'schema-indexer:contract',
        sourceRef: (orig.sourceRefs && orig.sourceRefs[0]) || 'scripts/codebase-semantic-indexer.ts',
        feature_label: (orig.featureLabels && orig.featureLabels[0]) || 'schema-indexer-contract',
        summary: orig.summary || 'schema semantic indexer contract',
        hot_keywords: orig.clusterTags || orig.featureLabels || [],
        dependencies: orig.graphLinks ? orig.graphLinks.map(l => l.targetId) : [],
        routes: orig.entities?.routes || [],
        mcp_tools: orig.entities?.commands || [],
        db_tables: orig.tables || orig.entities?.tables || [],
        qdrant_tags: orig.clusterTags || [],
        redis_keys: orig.retrieval?.redisKey ? [orig.retrieval.redisKey] : [],
        protocols: ['http'],
        encodings: ['json'],
        missing_getters: [],
        missing_setters: [],
        missing_logs: [],
        status: 'implemented',
        nextAction: 'index:qdrant'
      };

      cards.push(card);
    } catch (e) {
      console.error('Failed to parse line:', e);
    }
  }

  await fs.writeFile(OUT_JSONL, cards.map(c => JSON.stringify(c)).join('\n') + '\n', 'utf8');
  console.log(`Wrote ${cards.length} cards to ${OUT_JSONL}`);

  const report = [
    '# Parent Atlas Profile Cards',
    '',
    `Generated At: ${new Date().toISOString()}`,
    `Total Cards: ${cards.length}`,
    '',
    '## Card Entries',
    '',
    cards.map(c => `### ${c.card_id}
- **Feature**: ${c.feature_label}
- **SourceRef**: \`${c.sourceRef}\`
- **Summary**: ${c.summary}
- **Status**: \`${c.status}\`
- **Next Action**: \`${c.nextAction}\``).join('\n\n')
  ].join('\n');

  await fs.writeFile(OUT_REPORT, report, 'utf8');
  console.log(`Wrote report to ${OUT_REPORT}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
