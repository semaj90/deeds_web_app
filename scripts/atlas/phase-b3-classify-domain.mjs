#!/usr/bin/env node
/**
 * Phase B Pass 3: Domain Classification
 *
 * Classifies feature_id into domain groups using Gemma4 ontology classification.
 * Maps summaries to the hierarchical domain taxonomy defined in atlas_domain_ontology.
 *
 * Output: Populates atlas_packets.{feature_group_id, domain_class, taxonomy_level}
 *
 * Usage:
 *   node scripts/atlas/phase-b3-classify-domain.mjs [--dry-run] [--apply] [--batch=100] [--verbose]
 */

import pg from 'pg';

const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch='))?.split('=')[1] || '100');

const GEMMA4_ENDPOINT = 'http://127.0.0.1:8090/v1/chat/completions';

// Connection from .env
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

// Domain classification prompt template
const CLASSIFICATION_PROMPT = (summary, featureId) => `
You are a domain ontology classifier for a legal AI codebase.

Classify the following feature into a domain group from this hierarchy:
- devops (Infrastructure & Deployment)
  - devops.env-config (Configuration Management)
  - devops.process-mgmt (Process Management)
- error-handling (Error Handling & Recovery)
- auth (Authentication & Authorization)
- retrieval (Information Retrieval & Search)
  - retrieval.vector (Vector Search)
  - retrieval.graph (Graph Traversal)
  - retrieval.fulltext (Full-Text Search)
- api (API Design & Integration)
- data (Data Structures & Storage)
- ui (User Interface & Components)

Feature ID: ${featureId}
Summary: ${summary.substring(0, 500)}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "feature_group_id": "category.subcategory",
  "domain_class": "Short descriptive label",
  "taxonomy_level": 0 or 1 or 2,
  "confidence": 0.0-1.0
}
`;

async function classifyWithGemma4(summary, featureId) {
  if (!summary || summary.length < 20) {
    return {
      feature_group_id: 'unclassified',
      domain_class: 'No summary available',
      taxonomy_level: 0,
      confidence: 0.1,
    };
  }

  try {
    const response = await fetch(GEMMA4_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs-direct.gguf',
        messages: [{ role: 'user', content: CLASSIFICATION_PROMPT(summary, featureId) }],
        temperature: 0.3,
        max_tokens: 200,
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      if (VERBOSE) console.log(`  ⚠️  Gemma4 HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content;

    if (!responseText) return null;

    // Extract JSON from response (handle markdown code blocks if present)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const classification = JSON.parse(jsonMatch[0]);
    return {
      feature_group_id: classification.feature_group_id || 'unclassified',
      domain_class: classification.domain_class || 'Unknown',
      taxonomy_level: classification.taxonomy_level || 0,
      confidence: classification.confidence || 0.5,
    };
  } catch (error) {
    if (VERBOSE) console.log(`  ⚠️  Classification error: ${error.message}`);
    return null;
  }
}

async function processBatch(packets) {
  const results = [];

  for (const packet of packets) {
    const classification =
      (await classifyWithGemma4(packet.summary, packet.feature_id)) || {
        feature_group_id: 'unclassified',
        domain_class: 'Classification failed',
        taxonomy_level: 0,
        confidence: 0.0,
      };

    results.push({
      ...packet,
      ...classification,
    });

    if (VERBOSE) {
      console.log(
        `   ✅ Classified ${packet.feature_id} → ${classification.feature_group_id} (confidence: ${classification.confidence})`
      );
    }
  }

  return results;
}

async function writeToPostgres(packets) {
  const updateQueries = packets.map((packet) => ({
    text: `
      UPDATE atlas_packets
      SET
        feature_group_id = $2,
        domain_class = $3,
        taxonomy_level = $4,
        updated_at = NOW()
      WHERE packet_key = $1
    `,
    values: [packet.packet_key, packet.feature_group_id, packet.domain_class, packet.taxonomy_level],
  }));

  if (DRY_RUN) {
    console.log(`\n📋 Dry-run: Would classify ${packets.length} packets`);
    if (VERBOSE) {
      console.log(`   Sample: ${packets[0].feature_id} → ${packets[0].feature_group_id}`);
    }
    return true;
  }

  try {
    for (const query of updateQueries) {
      await pool.query(query.text, query.values);
    }
    console.log(`   ✅ Wrote ${packets.length} classifications to Postgres`);
    return true;
  } catch (error) {
    console.error(`   ❌ Write error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase B Pass 3: Domain Classification (Gemma4 Ontology)       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  if (DRY_RUN) console.log('⚠️  DRY-RUN MODE\n');

  const startTime = Date.now();

  try {
    // Step 1: Query packets needing classification
    const result = await pool.query(`
      SELECT
        packet_key,
        feature_id,
        summary,
        feature_group_id,
        domain_class
      FROM atlas_packets
      WHERE summary IS NOT NULL
        AND (feature_group_id IS NULL OR feature_group_id = 'unclassified')
      ORDER BY created_at DESC
      LIMIT 5000
    `);

    const packets = result.rows;
    console.log(`📦 Found ${packets.length} packets needing classification\n`);

    let processed = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < packets.length; i += BATCH_SIZE) {
      const batch = packets.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(packets.length / BATCH_SIZE);

      console.log(`🔄 Processing batch ${batchNum}/${totalBatches}`);

      try {
        const classified = await processBatch(batch);
        const success = await writeToPostgres(classified);

        if (success) {
          processed += batch.length;
        } else {
          failed += batch.length;
        }
      } catch (error) {
        console.error(`   ❌ Batch error: ${error.message}`);
        failed += batch.length;
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Summary
    console.log(`\n✅ Domain Classification Complete`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Total Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`);

    // Verification query
    if (!DRY_RUN) {
      const verifyResult = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN feature_group_id IS NOT NULL THEN 1 END) as classified,
          COUNT(DISTINCT feature_group_id) as unique_groups
        FROM atlas_packets
      `);

      console.log('📊 Verification:');
      const v = verifyResult.rows[0];
      console.log(`   Total packets: ${v.total}`);
      console.log(`   Classified: ${v.classified} (${(100 * v.classified / v.total).toFixed(1)}%)`);
      console.log(`   Unique groups: ${v.unique_groups}\n`);

      // Show top groups
      const groupResult = await pool.query(`
        SELECT feature_group_id, COUNT(*) as count
        FROM atlas_packets
        WHERE feature_group_id IS NOT NULL
        GROUP BY feature_group_id
        ORDER BY count DESC
        LIMIT 10
      `);

      console.log('   Top 10 classified groups:');
      for (const row of groupResult.rows) {
        console.log(`     - ${row.feature_group_id}: ${row.count} packets`);
      }
      console.log('');
    }
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
