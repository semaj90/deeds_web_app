#!/usr/bin/env node
import 'dotenv/config';
import { resolve, join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const SOURCE = args.find(a => a.startsWith('--source='))?.split('=')[1];
const WRITE = args.includes('--write');
const RUN_ID = args.find(a => a.startsWith('--runId='))?.split('=')[1];

const CHUNK_DIR = resolve(process.cwd(), 'data/external-docs/chunks');
const NEO4J_URL = process.env.NEO4J_HTTP_URL ?? 'http://localhost:7474';
const NEO4J_AUTH = Buffer.from(`${process.env.NEO4J_USER}:${process.env.NEO4J_PASSWORD}`).toString('base64');

async function project() {
  if (!existsSync(CHUNK_DIR)) return;
  const files = await readdir(CHUNK_DIR);

  for (const file of files) {
    if (SOURCE && file !== `${SOURCE}.jsonl`) continue;
    if (file.endsWith('.jsonl')) {
      const content = await readFile(join(CHUNK_DIR, file), 'utf8');
      const chunks = content.split('\n').filter(Boolean).map(JSON.parse);

      console.log(`[neo4j] Projecting ${chunks.length} chunks from ${file}... (RunID: ${RUN_ID || 'none'})`);
      
      if (!WRITE) {
        console.log(`[dry-run] Would create nodes/edges for ${chunks.length} chunks in Neo4j`);
        continue;
      }

      for (const chunk of chunks) {
        const query = `
          MERGE (s:DocSource {id: $sourceId})
          SET s.name = $sourceId, s.trustTier = $trustTier
          MERGE (p:DocPage {id: $sourceTitle})
          SET p.url = $sourceUrl, p.version = $version
          MERGE (c:DocChunk {id: $chunkId})
          SET c.text = $text, c.runId = $runId, c.indexedAt = $indexedAt
          MERGE (s)-[:HAS_PAGE]->(p)
          MERGE (p)-[:HAS_CHUNK]->(c)
        `;

        const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Basic ${NEO4J_AUTH}`
          },
          body: JSON.stringify({
            statements: [{
              statement: query,
              parameters: {
                sourceId: chunk.sourceId,
                trustTier: chunk.trustTier,
                sourceTitle: chunk.sourceTitle,
                sourceUrl: chunk.sourceUrl,
                version: chunk.version,
                chunkId: chunk.chunkId,
                text: chunk.text,
                runId: RUN_ID,
                indexedAt: chunk.indexedAt
              }
            }]
          })
        });

        if (res.ok) console.log(`  ✅ ${chunk.chunkId} projected.`);
        else console.error(`  ❌ ${chunk.chunkId} failed: ${await res.text()}`);
      }
    }
  }
}

project().catch(console.error);
