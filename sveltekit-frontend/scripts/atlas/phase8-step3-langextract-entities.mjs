#!/usr/bin/env node

/**
 * Phase 8 Step 3: LangExtract Entity Extraction
 *
 * Extracts entities (STATUTE, PERSON, ORG, AMOUNT, LOCATION) from summary text
 * Stores in atlas_packets.used_concepts for ACE routing
 *
 * Tries LangExtract :8095 first, falls back to NLP regex patterns
 *
 * Usage:
 *   npm run atlas:phase8:step3:langextract:dry
 *   npm run atlas:phase8:step3:langextract:apply
 *   npm run atlas:phase8:step3:langextract:full
 */

import { Client } from 'pg';
import * as Redis from 'ioredis';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';
const LANGEXTRACT_URL = process.env.LANGEXTRACT_URL || 'http://127.0.0.1:8095';

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('dry');
const isApply = process.argv.includes('--apply');
const isFull = process.argv.includes('--full');
const limitIdx = process.argv.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1]) : 10000;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 8 Step 3: LangExtract Entity Extraction                 ║');
console.log('║  Extract STATUTE, PERSON, ORG, AMOUNT, LOCATION entities      ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log();
console.log(`Mode: ${isDryRun ? 'DRY_RUN' : isFull ? 'FULL' : 'APPLY'}`);
console.log(`Limit: ${limit} packets`);
console.log(`LangExtract: ${LANGEXTRACT_URL}`);
console.log();

/**
 * Extract entities via LangExtract API
 */
async function extractViaLangExtract(text) {
  try {
    const response = await fetch(`${LANGEXTRACT_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, entities: ['STATUTE', 'PERSON', 'ORG', 'AMOUNT', 'LOCATION'] }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn(`LangExtract HTTP ${response.status}, falling back to regex`);
      return null;
    }

    const data = await response.json();
    return data.entities || [];
  } catch (err) {
    console.warn(`LangExtract unavailable: ${err.message}`);
    return null;
  }
}

/**
 * Fallback: Extract entities via regex patterns
 */
function extractViaRegex(text) {
  const entities = [];

  // STATUTE: "§ 123", "Section 123", "U.C.C. § 1-101"
  const statuteMatches = text.matchAll(/(?:§|Section|Article|Chapter|42\s+U\.S\.C\.?|U\.C\.C\.?)\s+(?:[\d\-\.]+(?:\([a-z0-9]+\))?)/gi);
  for (const match of statuteMatches) {
    entities.push({ type: 'STATUTE', text: match[0].trim() });
  }

  // PERSON: "John Smith", "Ms. Jane Doe"
  const personMatches = text.matchAll(/(?:Mr\.|Ms\.|Dr\.|Prof\.|Mr|Ms|Dr|Prof)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g);
  for (const match of personMatches) {
    entities.push({ type: 'PERSON', text: match[0].trim() });
  }

  // ORG: "Apple Inc.", "Bank of America", "LLC"
  const orgMatches = text.matchAll(/[A-Z][a-zA-Z\s&]+(?:Inc\.|LLC|Corp\.|Co\.|Ltd\.|LLP)/g);
  for (const match of orgMatches) {
    entities.push({ type: 'ORG', text: match[0].trim() });
  }

  // AMOUNT: "$1,000,000", "100 million dollars"
  const amountMatches = text.matchAll(/\$[\d,]+(?:\.\d{2})?|[\d,]+\s+(?:dollars?|cents?|million|billion|thousand)/gi);
  for (const match of amountMatches) {
    entities.push({ type: 'AMOUNT', text: match[0].trim() });
  }

  // LOCATION: "New York", "United States", "California"
  const locationMatches = text.matchAll(/(?:^|[\s,])[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?=[\s,\.\)]|$)/g);
  for (const match of locationMatches) {
    const loc = match[0].trim();
    if (loc.length > 3 && !['The', 'This', 'That', 'Which', 'Where', 'When', 'Why', 'How', 'What', 'Who', 'Whom'].includes(loc)) {
      entities.push({ type: 'LOCATION', text: loc });
    }
  }

  return entities;
}

/**
 * Extract entities and materialized used_concepts
 */
async function extractEntities() {
  const pgClient = new Client({ connectionString: POSTGRES_URL });
  const redis = new Redis.default({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  try {
    await pgClient.connect();
    await redis.connect();

    // Query packets with summaries but no used_concepts
    const query = `
      SELECT
        id as packet_id,
        packet_key,
        summary
      FROM atlas_packets
      WHERE summary IS NOT NULL
        AND LENGTH(COALESCE(summary, '')) > 20
        AND (metadata IS NULL OR metadata->>'used_concepts' IS NULL)
      ORDER BY created_at DESC
      LIMIT $1
    `;

    const result = await pgClient.query(query, [limit]);
    const packets = result.rows;

    console.log(`Found ${packets.length} packets without extracted entities\n`);

    if (isDryRun) {
      console.log('DRY RUN: Sample entity extraction:');
      for (let i = 0; i < Math.min(3, packets.length); i++) {
        const p = packets[i];
        const entities = await extractViaLangExtract(p.summary) || extractViaRegex(p.summary);
        console.log(`  ${p.packet_key}:`);
        entities.slice(0, 3).forEach((e) => {
          console.log(`    - ${e.type}: ${e.text}`);
        });
        if (entities.length > 3) console.log(`    ... and ${entities.length - 3} more`);
      }
      return;
    }

    // APPLY: Extract and materialize
    let extracted = 0;
    let langExtractFails = 0;

    for (let i = 0; i < packets.length; i++) {
      const p = packets[i];

      // Try LangExtract first
      let entities = await extractViaLangExtract(p.summary);
      if (!entities) {
        entities = extractViaRegex(p.summary);
        langExtractFails++;
      }

      // Deduplicate entities by text
      const uniqueEntities = [...new Map(entities.map((e) => [e.text, e])).values()];
      const conceptTexts = uniqueEntities.map((e) => e.text);

      // Update Postgres metadata
      await pgClient.query(
        `UPDATE atlas_packets
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $1,
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify({ used_concepts: conceptTexts }), p.packet_id]
      );

      // Update Valkey cache if it exists
      const cacheKey = `bifrost:packet:${p.packet_key}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        const cachedEnvelope = JSON.parse(cached);
        cachedEnvelope.used_concepts = conceptTexts;
        await redis.setex(cacheKey, 86400, JSON.stringify(cachedEnvelope));
      }

      extracted++;
      if ((i + 1) % 1000 === 0) {
        console.log(`  ✅ Extracted entities from ${i + 1}/${packets.length} packets`);
      }
    }

    console.log(`\n✅ Extraction complete:`);
    console.log(`  Entities materialized: ${extracted}`);
    console.log(`  LangExtract failures (using regex): ${langExtractFails}`);
  } finally {
    await pgClient.end();
    await redis.quit();
  }
}

extractEntities().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
