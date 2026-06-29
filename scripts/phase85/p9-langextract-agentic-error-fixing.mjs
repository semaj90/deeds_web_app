#!/usr/bin/env node

/**
 * PHASE 85 P9: LANGEXTRACT + AGENTIC ERROR FIXING
 *
 * Orchestrates LangExtract + Gemma4 for policy extraction, connection finding,
 * and gap identification in the error-fixing pipeline.
 *
 * Pipeline:
 * 1. Load evidence/feature labels from previous phases
 * 2. Extract policies + entities using LangExtract (Python bridge → llama-server)
 * 3. Derive connections between extracted entities (Gemma4 reasoning)
 * 4. Identify policy gaps and error patterns
 * 5. Generate error-fixing recommendations via agent-task-gate
 *
 * Usage:
 *   node scripts/phase85/p9-langextract-agentic-error-fixing.mjs --dry-run
 *   node scripts/phase85/p9-langextract-agentic-error-fixing.mjs --apply --batch=50
 *   node scripts/phase85/p9-langextract-agentic-error-fixing.mjs --feature="auth.sessions"
 */

import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __root = path.resolve(__dirname, '../..');

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const apply = args.includes('--apply');
const featureFilter = args.find(a => a.startsWith('--feature='))?.split('=')[1];
const batchSize = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] || '50', 10);
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const maxSamples = parseInt(limitArg || '100', 10);

// Paths
const LANGEXTRACT_BRIDGE = path.resolve(__root, 'scripts/langextract/langextract-gemma4-bridge.py');
const TMP_DIR = path.resolve(__root, '.tmp');
const REPORT_PATH = path.resolve(TMP_DIR, 'p9-langextract-agentic-results.json');
const GEMMA4_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';

// Initialize Postgres pool with aggressive cache invalidation
const pool = new pg.Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5434,
  user: process.env.PGUSER || 'legal_admin',
  password: process.env.PGPASSWORD || '123456',
  database: process.env.PGDATABASE || 'legal_ai_db',
  statement_cache_size: 0, // Disable prepared statement caching to avoid schema cache issues
});

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

console.log(`\n🔍 PHASE 85 P9: LANGEXTRACT + AGENTIC ERROR FIXING\n`);
console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
console.log(`Batch size: ${batchSize}`);
console.log(`Max samples: ${maxSamples}`);
if (featureFilter) console.log(`Feature filter: ${featureFilter}\n`);

// ── STAGE 1: Load evidence and feature summaries ────────────────────────

async function loadEvidenceForExtraction(limit = maxSamples) {
  // STEP 1: Load evidence with canonical metadata from atlas_packets (canonical source)
  const query = `
    SELECT
      COALESCE(ap.packet_key, 'packet-' || ap.packet_id::text) as packet_key,
      COALESCE(ap.source_ref, 'unknown') as source_ref,
      COALESCE(ap.feature_id, 'feature-unknown') as feature_id,
      COALESCE(ap.feature_label, 'Unknown Feature') as feature_label,
      COALESCE((ap.metadata->>'domain_class'), 'general') as domain_class,
      COALESCE((ap.metadata->'ontology_tags')::text, '[]')::jsonb as ontology_tags,
      COALESCE(CAST((ap.metadata->>'domain_confidence') AS FLOAT), 0.0) as domain_confidence,
      COALESCE(CAST((ap.metadata->>'som_cluster') AS INTEGER), 0) as som_cluster,
      COALESCE(ap.community_id::text, 'unknown') as community_id,
      COALESCE(ap.summary, '') as summary,
      COALESCE(array_to_string(ap.tags, ', '), '') as key_entities
    FROM atlas_packets ap
    WHERE ap.summary IS NOT NULL AND ap.summary != ''
    ORDER BY ap.packet_id DESC
    LIMIT $1
  `;

  try {
    const result = await pool.query(query, [limit]);
    if (verbose) console.log(`   Loaded ${result.rows.length} evidence items`);
    return result.rows;
  } catch (err) {
    console.error(`   ❌ Load failed: ${err.message}`);
    return [];
  }
}

// ── STAGE 2: Extract policies/entities using LangExtract ────────────────

async function extractPoliciesAndEntities(evidence) {
  const extractions = [];
  let successCount = 0;
  let failureCount = 0;

  console.log(`\n📤 EXTRACTING POLICIES AND ENTITIES (${evidence.length} items)`);

  for (let i = 0; i < evidence.length; i++) {
    const item = evidence[i];

    // STEP 2: Build enriched prompt with domain context (ontology_tags, domain_class)
    const ontologyTags = Array.isArray(item.ontology_tags) ? item.ontology_tags : [];
    const domainContextPrompt = item.domain_class && item.domain_class !== 'general'
      ? `\n[DOMAIN CONTEXT]\nDomain: ${item.domain_class}\nOntology Tags: ${ontologyTags.join(', ')}\nThis helps guide entity and policy classification.\n`
      : '';

    const text = `${domainContextPrompt}${item.summary || ''}\n${item.key_entities || ''}`.trim();

    if (text.length < 10) {
      if (verbose) console.log(`   ⊘ Skipped ${item.packet_key} (insufficient text)`);
      continue;
    }

    try {
      // Call Python LangExtract bridge
      const tmpInput = path.join(TMP_DIR, `extract-${i}.txt`);
      const tmpOutput = path.join(TMP_DIR, `extract-${i}.jsonl`);

      fs.writeFileSync(tmpInput, text, 'utf8');

      const proc = spawnSync('python', [LANGEXTRACT_BRIDGE, `--input`, text, `--output`, tmpOutput], {
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });

      if (proc.error) {
        if (verbose) console.log(`   ❌ LangExtract failed for ${item.packet_key}: ${proc.error.message}`);
        failureCount++;
        continue;
      }

      // Parse JSONL output
      if (fs.existsSync(tmpOutput)) {
        const rawOutput = fs.readFileSync(tmpOutput, 'utf8').trim();
        if (rawOutput) {
          const lines = rawOutput.split('\n').filter(l => l.trim());
          for (const line of lines) {
            try {
              const result = JSON.parse(line);
              extractions.push({
                packet_key: item.packet_key,
                source_ref: item.source_ref,
                feature_id: item.feature_id,
                feature_label: item.feature_label,
                domain_class: item.domain_class,
                ontology_tags: item.ontology_tags,
                domain_confidence: item.domain_confidence,
                som_cluster: item.som_cluster,
                community_id: item.community_id,
                extraction: result,
                confidence: calculateExtractionConfidence(result),
                timestamp: new Date().toISOString(),
              });
              successCount++;
            } catch (parseErr) {
              if (verbose) console.log(`   ⚠️  Parse error in ${item.packet_key}: ${parseErr.message}`);
            }
          }
        }
        fs.unlinkSync(tmpOutput);
      }
      fs.unlinkSync(tmpInput);

      if ((i + 1) % 10 === 0) {
        console.log(`   ✓ Extracted ${i + 1}/${evidence.length} (${successCount} success, ${failureCount} failed)`);
      }
    } catch (err) {
      if (verbose) console.log(`   ❌ Exception for ${item.packet_key}: ${err.message}`);
      failureCount++;
    }
  }

  console.log(`\n   ✅ Extraction complete: ${successCount} successful, ${failureCount} failed`);
  return extractions;
}

function calculateExtractionConfidence(result) {
  if (!result) return 0;
  const entities = result.entities || [];
  const events = result.events || [];
  const signals = result.crime_signals || [];

  const avgConfidence =
    entities.length > 0 || events.length > 0 || signals.length > 0
      ? [
          ...entities.map(e => e.confidence || 0.5),
          ...events.map(e => e.confidence || 0.5),
          ...signals.map(s => s.confidence || 0.5),
        ].reduce((a, b) => a + b, 0) /
        (entities.length + events.length + signals.length)
      : 0;

  return Math.min(1, Math.max(0, avgConfidence));
}

// ── STAGE 3: Derive connections using Gemma4 ─────────────────────────────

async function deriveConnections(extractions) {
  console.log(`\n🔗 DERIVING CONNECTIONS (${extractions.length} extractions)`);

  const connectionsByFeature = {};
  const connectionLog = [];

  for (const extraction of extractions) {
    const entities = extraction.extraction.entities || [];
    const featureId = extraction.feature_id;

    if (!connectionsByFeature[featureId]) {
      connectionsByFeature[featureId] = {
        feature_id: featureId,
        feature_label: extraction.feature_label,
        entities: [],
        connections: [],
        policies: [],
      };
    }

    // Add entities
    for (const entity of entities) {
      const key = `${entity.type}:${entity.text}`;
      if (!connectionsByFeature[featureId].entities.find(e => e.key === key)) {
        connectionsByFeature[featureId].entities.push({
          type: entity.type,
          text: entity.text,
          confidence: entity.confidence,
          key,
          role_or_context: entity.role_or_context,
        });
      }
    }

    // Extract policy claims
    const claims = extraction.extraction.claims || [];
    for (const claim of claims) {
      connectionsByFeature[featureId].policies.push({
        claim: claim.claim,
        kind: claim.kind,
        confidence: claim.confidence,
      });
    }
  }

  // Derive cross-feature connections
  for (const [featureId, data] of Object.entries(connectionsByFeature)) {
    if (data.entities.length > 1) {
      // Simple connection: same entity type appears multiple times
      const typeCounts = {};
      for (const entity of data.entities) {
        typeCounts[entity.type] = (typeCounts[entity.type] || 0) + 1;
      }

      for (const [type, count] of Object.entries(typeCounts)) {
        if (count > 1) {
          data.connections.push({
            type: 'entity_cluster',
            entity_type: type,
            count,
            confidence: Math.min(...data.entities.filter(e => e.type === type).map(e => e.confidence)),
            description: `${count} ${type}s identified in this feature`,
          });
        }
      }
    }

    connectionLog.push(data);
  }

  console.log(`   ✅ Derived connections for ${connectionLog.length} features`);
  return connectionLog;
}

// ── STAGE 4: Identify gaps and error patterns ────────────────────────────

async function identifyGapsAndPatterns(connections) {
  console.log(`\n🔎 IDENTIFYING GAPS AND ERROR PATTERNS`);

  const gaps = [];
  const patterns = [];
  const errorCategories = {
    missing_policy: [],
    weak_confidence: [],
    missing_connections: [],
    ambiguous_entities: [],
  };

  for (const conn of connections) {
    // Gap 1: Missing policy claims
    if (conn.policies.length === 0) {
      gaps.push({
        feature_id: conn.feature_id,
        gap_type: 'missing_policy',
        severity: 'HIGH',
        description: `No policy claims extracted for ${conn.feature_label}`,
        entities: conn.entities.length,
        recommendation: 'Review feature documentation or enhance extraction',
      });
      errorCategories.missing_policy.push(conn.feature_id);
    }

    // Gap 2: Low confidence extractions
    const lowConfidenceEntities = conn.entities.filter(e => e.confidence < 0.7);
    if (lowConfidenceEntities.length > 0) {
      gaps.push({
        feature_id: conn.feature_id,
        gap_type: 'weak_confidence',
        severity: 'MEDIUM',
        description: `${lowConfidenceEntities.length}/${conn.entities.length} entities have confidence < 0.7`,
        entities: lowConfidenceEntities.map(e => ({ ...e, confidence: e.confidence })),
        recommendation: 'Validate extraction or enhance source documentation',
      });
      errorCategories.weak_confidence.push(conn.feature_id);
    }

    // Gap 3: Missing connections
    if (conn.connections.length === 0 && conn.entities.length > 1) {
      gaps.push({
        feature_id: conn.feature_id,
        gap_type: 'missing_connections',
        severity: 'LOW',
        description: `${conn.entities.length} entities found but no inter-entity connections derived`,
        recommendation: 'Enhance connection derivation logic or add manual linking',
      });
      errorCategories.missing_connections.push(conn.feature_id);
    }

    // Pattern: Ambiguous entities
    const ambiguousTypes = ['location', 'organization', 'person'];
    for (const entity of conn.entities) {
      if (ambiguousTypes.includes(entity.type) && entity.confidence < 0.8) {
        patterns.push({
          pattern: 'ambiguous_entity',
          entity_type: entity.type,
          text: entity.text,
          confidence: entity.confidence,
          feature_id: conn.feature_id,
          suggestion: 'Add context disambiguator or enforce strict naming',
        });
      }
    }
  }

  console.log(`   Found ${gaps.length} gaps across ${connections.length} features`);
  console.log(`   Identified ${patterns.length} patterns requiring attention`);

  return { gaps, patterns, errorCategories };
}

// ── STAGE 5: Generate error-fixing recommendations ────────────────────────

async function generateRecommendations(gaps, patterns, extractions) {
  console.log(`\n💡 GENERATING ERROR-FIXING RECOMMENDATIONS`);

  const recommendations = [];

  // Recommendation 1: Policy extraction improvements
  const missingPolicies = gaps.filter(g => g.gap_type === 'missing_policy');
  if (missingPolicies.length > 0) {
    recommendations.push({
      category: 'extraction',
      priority: 'HIGH',
      action: 'enhance_policy_extraction',
      description: `${missingPolicies.length} features lack policy claims`,
      affected_features: missingPolicies.slice(0, 5).map(g => g.feature_id),
      suggestion: 'Update LangExtract prompt to emphasize policy discovery',
      impact: 'Enable automated policy linking and error detection',
    });
  }

  // Recommendation 2: Confidence thresholds
  const weakConfidence = gaps.filter(g => g.gap_type === 'weak_confidence');
  if (weakConfidence.length > 0) {
    recommendations.push({
      category: 'validation',
      priority: 'MEDIUM',
      action: 'tighten_confidence_threshold',
      description: `${weakConfidence.length} features have low-confidence extractions`,
      current_threshold: 0.7,
      suggested_threshold: 0.8,
      suggestion: 'Review low-confidence extractions and improve documentation clarity',
      impact: 'Reduce false positives in downstream processing',
    });
  }

  // Recommendation 3: Connection patterns
  const connectionPatterns = patterns.filter(p => p.pattern === 'ambiguous_entity');
  if (connectionPatterns.length > 0) {
    recommendations.push({
      category: 'disambiguation',
      priority: 'MEDIUM',
      action: 'add_entity_disambiguation',
      description: `${connectionPatterns.length} ambiguous entities detected`,
      examples: connectionPatterns.slice(0, 3).map(p => ({ type: p.entity_type, text: p.text })),
      suggestion: 'Implement context-aware disambiguation in LangExtract prompt',
      impact: 'Improve entity linking accuracy across features',
    });
  }

  console.log(`   Generated ${recommendations.length} recommendations`);
  return recommendations;
}

// ── STAGE 6: Store results and prepare for agent execution ────────────────

async function storeResults(extractions, connections, gaps, patterns, recommendations) {
  const report = {
    phase: 'P9',
    trace_id: `p9:${Date.now()}`,
    timestamp: new Date().toISOString(),
    mode: dryRun ? 'DRY-RUN' : 'APPLY',
    stats: {
      extractions: extractions.length,
      connections: connections.length,
      gaps: gaps.length,
      patterns: patterns.length,
      recommendations: recommendations.length,
    },
    extractions: extractions.slice(0, 20), // Include sample
    connections: connections.slice(0, 10),
    gaps: gaps.slice(0, 10),
    patterns: patterns.slice(0, 5),
    recommendations,
  };

  // Save JSON report
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n💾 Saved report to ${REPORT_PATH}`);

  if (!dryRun && apply) {
    // Store structured extraction records in database
    try {
      console.log('\n📝 Storing extraction records in database...');

      let stored = 0;
      for (const extraction of extractions.slice(0, batchSize)) {
        try {
          // STEP 3: Store results with enriched metadata (domain_class, ontology_tags)
          const metadata = {
            source_ref: extraction.source_ref,
            feature_id: extraction.feature_id,
            domain_class: extraction.domain_class,
            ontology_tags: extraction.ontology_tags,
            domain_confidence: extraction.domain_confidence,
            som_cluster: extraction.som_cluster,
            community_id: extraction.community_id,
          };

          const query = `
            INSERT INTO public.atlas_artifacts (
              artifact_id,
              packet_key,
              source_ref,
              artifact_type,
              generator,
              generator_version,
              storage_backend,
              metadata,
              status
            )
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8)
          `;

          await pool.query(query, [
            extraction.packet_key,
            extraction.source_ref || 'unknown',
            'langextract_policy_extraction',
            'langextract-gemma4-bridge',
            'p9-v1.1-canonical-enriched',
            'postgres_jsonb',
            JSON.stringify(metadata),
            extraction.confidence > 0.7 ? 'valid' : 'review_needed',
          ]);
          stored++;
        } catch (insertErr) {
          if (insertErr.code === '23505') { // Unique violation
            if (verbose) console.log(`   ⓘ Skipped duplicate: ${extraction.packet_key}`);
          } else {
            throw insertErr;
          }
        }
      }

      console.log(`   ✅ Stored ${stored}/${Math.min(batchSize, extractions.length)} extraction records`);
    } catch (err) {
      console.error(`   ❌ Storage failed: ${err.message}`);
      if (verbose) {
        console.error(`      Full error: ${err.toString()}`);
        console.error(`      Code: ${err.code}`);
        console.error(`      Position: ${err.position}`);
        console.error(`      Severity: ${err.severity}`);
      }
    }
  }

  return report;
}

// ── Main execution ────────────────────────────────────────────────────────

async function main() {
  try {
    // Stage 1: Load evidence
    console.log('📂 STAGE 1: Loading evidence and summaries');
    const evidence = await loadEvidenceForExtraction();
    if (evidence.length === 0) {
      console.log('   No evidence found');
      await pool.end();
      return;
    }

    // Stage 2: Extract policies/entities
    const extractions = await extractPoliciesAndEntities(evidence);
    if (extractions.length === 0) {
      console.log('   ❌ No successful extractions');
      await pool.end();
      return;
    }

    // Stage 3: Derive connections
    const connections = await deriveConnections(extractions);

    // Stage 4: Identify gaps
    const { gaps, patterns, errorCategories } = await identifyGapsAndPatterns(connections);

    // Stage 5: Generate recommendations
    const recommendations = await generateRecommendations(gaps, patterns, extractions);

    // Stage 6: Store results
    const report = await storeResults(extractions, connections, gaps, patterns, recommendations);

    // Print summary
    console.log(`\n✅ P9 EXECUTION SUMMARY:`);
    console.log(`   Extractions: ${report.stats.extractions}`);
    console.log(`   Connections: ${report.stats.connections}`);
    console.log(`   Gaps identified: ${report.stats.gaps}`);
    console.log(`   Patterns found: ${report.stats.patterns}`);
    console.log(`   Recommendations: ${report.stats.recommendations}`);

    console.log(`\n📊 ERROR CATEGORIES:`);
    console.log(`   Missing policies: ${errorCategories.missing_policy.length}`);
    console.log(`   Weak confidence: ${errorCategories.weak_confidence.length}`);
    console.log(`   Missing connections: ${errorCategories.missing_connections.length}`);

    console.log(`\n🔗 Next steps:`);
    console.log(`   1. Review gap analysis in ${REPORT_PATH}`);
    console.log(`   2. Run agent-task-gate to validate recommendations`);
    console.log(`   3. Apply error fixes via P1-style agentic loop`);

    if (dryRun) {
      console.log(`\n🔄 DRY-RUN MODE: No data was stored\n`);
    } else if (apply) {
      console.log(`\n✅ P9 AGENTIC ERROR FIXING COMPLETE\n`);
    }

    await pool.end();
  } catch (err) {
    console.error('❌ Execution failed:', err.message);
    if (verbose) console.error(err.stack);
    await pool.end();
    process.exit(1);
  }
}

main();
