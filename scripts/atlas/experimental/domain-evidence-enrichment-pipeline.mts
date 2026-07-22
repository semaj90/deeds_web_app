#!/usr/bin/env npx tsx
/**
 * EXPERIMENTAL — NOT PART OF PHASE 107 F
 *
 * Deferred to Phase 2 CPU semantic baseline.
 * Does not produce calibrated probabilities.
 * Must not write canonical facts or ontology tuples.
 *
 * Domain Evidence Enrichment Pipeline (Phase 107 F Enhancement)
 *
 * Multi-label domain prediction with evidence tracking.
 * Combines:
 *   1. Lexical evidence (rg, path rules, glossary)
 *   2. Linguistic evidence (POS tagging, lemmatization)
 *   3. Structural evidence (Tree-sitter, ast-grep)
 *   4. Semantic evidence (embeddings, centroid similarity)
 *   5. Legacy evidence (atlas_packets.domain_class)
 *   6. Unresolved evidence (LDR research, Firecrawl)
 *
 * Output: feature_domain_predictions table with multi-label probabilities
 * and evidence lineage.
 *
 * Usage:
 *   npx tsx scripts/atlas/domain-evidence-enrichment-pipeline.mts [--limit N] [--dry-run]
 */

import { randomUUID } from 'node:crypto';

import { pool } from '$lib/server/db/client.js';

interface DomainEvidence {
  kind: 'lexical' | 'linguistic' | 'structural' | 'semantic' | 'legacy' | 'research';
  source: string;
  value: any;
  confidence: number;
  weight: number;
}

interface DomainPrediction {
  packet_key: string;
  source_ref: string;
  primary_domain: string;
  primary_confidence: number;
  domains: Record<string, number>;
  domain_rows: Array<{
    domain_id: string;
    probability: number;
    decision: 'accepted' | 'candidate' | 'review' | 'rejected';
  }>;
  evidence: DomainEvidence[];
  decision: 'accepted' | 'candidate' | 'review' | 'rejected';
  model_kind: string;
  model_version: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE COLLECTION
// ═══════════════════════════════════════════════════════════════════════════

const DOMAIN_KEYWORDS = {
  legal: ['contract', 'case', 'evidence', 'statute', 'compliance', 'litigation', 'court', 'counsel'],
  auth: ['session', 'token', 'password', 'credential', 'authentication', 'oauth', 'jwt', 'lucia'],
  retrieval: ['search', 'query', 'index', 'vector', 'embedding', 'qdrant', 'ranking', 'rag'],
  database: ['postgres', 'sql', 'schema', 'table', 'column', 'drizzle', 'orm', 'transaction'],
  frontend: ['component', 'svelte', 'react', 'html', 'css', 'dom', 'button', 'modal'],
  backend: ['server', 'api', 'endpoint', 'handler', 'middleware', 'request', 'response'],
  gpu: ['cuda', 'gpu', 'tensor', 'matrix', 'parallel', 'pytorch', 'inference'],
  nlp: ['embedding', 'token', 'nlp', 'language', 'model', 'llm', 'gemma', 'transformer']
};

/**
 * Lexical evidence: exact keyword matching on path + content
 */
function collectLexicalEvidence(
  sourceRef: string,
  content?: string
): DomainEvidence[] {
  const text = `${sourceRef} ${content || ''}`.toLowerCase();
  const evidence: DomainEvidence[] = [];

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const matches = keywords.filter(kw => text.includes(kw));
    if (matches.length > 0) {
      const confidence = Math.min(0.3 + (matches.length / keywords.length) * 0.5, 0.95);
      evidence.push({
        kind: 'lexical',
        source: 'keyword_match',
        value: { domain, matches, count: matches.length },
        confidence,
        weight: 0.8
      });
    }
  }

  return evidence;
}

/**
 * Linguistic evidence: POS tagging (simplified for demo)
 * In production: use spacy, flair, or transformer-based tagger
 */
function collectLinguisticEvidence(sourceRef: string): DomainEvidence[] {
  // Simplified POS simulation: extract identifier patterns
  const evidence: DomainEvidence[] = [];

  // Split path into words
  const pathWords = sourceRef.split(/[\/\-_.]/).filter(w => w.length > 2);

  // Map common programming identifiers to domain hints
  const domainHints: Record<string, string[]> = {
    legal: ['case', 'evidence', 'contract', 'statute'],
    auth: ['auth', 'login', 'session', 'credential'],
    retrieval: ['search', 'index', 'query', 'rank'],
    database: ['db', 'schema', 'postgres', 'table'],
    frontend: ['component', 'ui', 'view', 'button'],
    backend: ['api', 'server', 'handler', 'route'],
    gpu: ['cuda', 'gpu', 'tensor', 'compute'],
    nlp: ['embed', 'token', 'model', 'llm']
  };

  for (const [domain, hints] of Object.entries(domainHints)) {
    const matchedWords = pathWords.filter(w => hints.includes(w.toLowerCase()));
    if (matchedWords.length > 0) {
      evidence.push({
        kind: 'linguistic',
        source: 'identifier_pattern',
        value: { domain, matched_words: matchedWords },
        confidence: Math.min(0.35 + matchedWords.length * 0.15, 0.9),
        weight: 0.6
      });
    }
  }

  return evidence;
}

/**
 * Structural evidence: from feature_structural_facts (if available)
 */
async function collectStructuralEvidence(
  client: any,
  packetKey: string
): Promise<DomainEvidence[]> {
  try {
    const result = await client.query(
      `SELECT symbol_name, ast_facts FROM feature_structural_facts WHERE packet_key = $1 LIMIT 5`,
      [packetKey]
    ).catch(() => ({ rows: [] }));

    if (result.rows.length > 0) {
      return [{
        kind: 'structural',
        source: 'ast_extraction',
        value: { symbol_count: result.rows.length, symbols: result.rows.map((r: any) => r.symbol_name) },
        confidence: 0.8,
        weight: 0.9
      }];
    }
  } catch {
    // No structural facts available
  }

  return [];
}

/**
 * Semantic evidence: embedding similarity (if available)
 */
async function collectSemanticEvidence(
  client: any,
  sourceRef: string
): Promise<DomainEvidence[]> {
  // In production: embed sourceRef and compare to domain descriptions
  // For now: return empty (would require running embedding model)
  return [];
}

/**
 * Legacy evidence: from atlas_packets.domain_class
 */
async function collectLegacyEvidence(
  client: any,
  packetKey: string
): Promise<DomainEvidence[]> {
  try {
    const result = await client.query(
      `SELECT domain_class FROM atlas_packets WHERE packet_key = $1`,
      [packetKey]
    );

    if (result.rows[0]?.domain_class) {
      return [{
        kind: 'legacy',
        source: 'atlas_packets',
        value: { domain: result.rows[0].domain_class },
        confidence: 0.6,
        weight: 0.7
      }];
    }
  } catch {
    // No legacy domain available
  }

  return [];
}

/**
 * Research evidence: LDR + Firecrawl (optional, high-confidence)
 */
async function collectResearchEvidence(
  sourceRef: string,
  candidateDomain: string
): Promise<DomainEvidence[]> {
  // In production: call LDR MCP tool via HTTP
  // For now: return empty
  return [];
}

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE AGGREGATION & DECISION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aggregate evidence into multi-label domain probabilities
 */
function aggregateEvidence(evidence: DomainEvidence[]): Record<string, number> {
  const domainScores: Record<string, number> = {};

  for (const ev of evidence) {
    if (ev.kind === 'legacy' && ev.value?.domain) {
      // Legacy evidence: single domain
      const domain = ev.value.domain;
      domainScores[domain] = (domainScores[domain] || 0) + ev.confidence * ev.weight;
    } else if (ev.value?.domain) {
      // Other evidence: single domain
      const domain = ev.value.domain;
      domainScores[domain] = (domainScores[domain] || 0) + ev.confidence * ev.weight;
    } else if (ev.value?.matches) {
      // Keyword evidence: multi-label (one score per keyword domain)
      ev.value.matches.forEach((kw: string) => {
        for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
          if (keywords.includes(kw)) {
            domainScores[domain] = (domainScores[domain] || 0) + ev.confidence * ev.weight;
          }
        }
      });
    }
  }

  return domainScores;
}

/**
 * Decide acceptance based on confidence
 */
function makeDecision(primaryConfidence: number): 'accepted' | 'candidate' | 'review' | 'rejected' {
  if (primaryConfidence >= 0.85) return 'accepted';
  if (primaryConfidence >= 0.65) return 'candidate';
  if (primaryConfidence >= 0.40) return 'review';
  return 'rejected';
}

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE ORCHESTRATION
// ═══════════════════════════════════════════════════════════════════════════

async function enrichPacketDomain(
  client: any,
  packetKey: string,
  sourceRef: string
): Promise<DomainPrediction> {
  const allEvidence: DomainEvidence[] = [];

  // Collect all types of evidence in parallel
  allEvidence.push(...collectLexicalEvidence(sourceRef));
  allEvidence.push(...collectLinguisticEvidence(sourceRef));
  allEvidence.push(...await collectStructuralEvidence(client, packetKey));
  allEvidence.push(...await collectSemanticEvidence(client, sourceRef));
  allEvidence.push(...await collectLegacyEvidence(client, packetKey));

  // Aggregate into multi-label probabilities
  const rawDomains = aggregateEvidence(allEvidence);
  const totalScore = Object.values(rawDomains).reduce((sum, score) => sum + score, 0);
  const domains = totalScore > 0
    ? Object.fromEntries(
        Object.entries(rawDomains).map(([domain, score]) => [domain, score / totalScore])
      )
    : {};

  // Select primary domain (highest probability)
  const [primaryDomain, primaryScore] = Object.entries(rawDomains).sort(([, a], [, b]) => b - a)[0] || ['unknown', 0];
  const primaryConfidence = Math.min(primaryScore, 1);
  const domainRows = Object.entries(domains)
    .map(([domain_id, probability]) => ({
      domain_id,
      probability,
      decision: makeDecision(probability),
    }))
    .filter((row) => row.probability > 0);

  const prediction: DomainPrediction = {
    packet_key: packetKey,
    source_ref: sourceRef,
    primary_domain: primaryDomain,
    primary_confidence: primaryConfidence,
    domains,
    domain_rows: domainRows,
    evidence: allEvidence,
    decision: makeDecision(primaryConfidence),
    model_kind: 'evidence_aggregation',
    model_version: 'v1'
  };

  return prediction;
}

async function materializePredictions(
  client: any,
  predictions: DomainPrediction[],
  isDryRun: boolean
): Promise<number> {
  if (isDryRun) {
    const totalRows = predictions.reduce((sum, pred) => sum + pred.domain_rows.length, 0);
    console.log(`\n⚠️  DRY RUN: Would insert ${totalRows} prediction rows across ${predictions.length} packets\n`);
    console.log('Sample predictions (first 3):');
    predictions.slice(0, 3).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.packet_key}: ${p.primary_domain} (${(p.primary_confidence * 100).toFixed(1)}%) - ${p.decision}`);
    });
    return 0;
  }

  let inserted = 0;
  const processingPassId = randomUUID();

  for (const pred of predictions) {
    for (const domainRow of pred.domain_rows) {
      try {
        await client.query(
          `INSERT INTO feature_domain_predictions (
            packet_key, source_ref, domain_id, probability, decision,
            model_kind, model_version, feature_contract_version,
            evidence, processing_pass_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (packet_key, domain_id, model_version, processing_pass_id) DO UPDATE SET
            probability = EXCLUDED.probability,
            decision = EXCLUDED.decision,
            evidence = EXCLUDED.evidence`,
          [
            pred.packet_key,
            pred.source_ref,
            domainRow.domain_id,
            domainRow.probability,
            domainRow.decision,
            pred.model_kind,
            pred.model_version,
            'phase-107-f-domain-v1',
            JSON.stringify({
              primary_domain: pred.primary_domain,
              primary_confidence: pred.primary_confidence,
              domains: pred.domains,
              evidence: pred.evidence,
              evidence_count: pred.evidence.length,
              evidence_kinds: [...new Set(pred.evidence.map(e => e.kind))]
            }),
            processingPassId
          ]
        );
        inserted++;
      } catch (err) {
        console.warn(`Error inserting prediction for ${pred.packet_key} / ${domainRow.domain_id}:`, err);
      }
    }
  }

  console.log(`\n📊 Materialized ${inserted} prediction rows across ${predictions.length} packets`);
  return inserted;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const client = await pool.connect();

  try {
    const args = process.argv.slice(2);
    const limitArg = args.find(a => a.startsWith('--limit='));
    const isDryRun = args.includes('--dry-run');

    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;

    console.log('\n🧬 Domain Evidence Enrichment Pipeline\n');
    console.log(`Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}`);
    console.log(`Limit: ${limit > 0 ? limit : 'all packets'}\n`);

    // Fetch packets
    const query = limit > 0
      ? `SELECT packet_key, source_ref FROM atlas_packets LIMIT ${limit}`
      : 'SELECT packet_key, source_ref FROM atlas_packets LIMIT 1000'; // First 1000 for safety

    const packets = await client.query(query);
    console.log(`📦 Processing ${packets.rows.length} packets\n`);

    const predictions: DomainPrediction[] = [];

    // Enrich each packet
    for (let i = 0; i < packets.rows.length; i++) {
      const packet = packets.rows[i];
      const prediction = await enrichPacketDomain(client, packet.packet_key, packet.source_ref);
      predictions.push(prediction);

      if ((i + 1) % 100 === 0) {
        console.log(`  ✓ Enriched ${i + 1}/${packets.rows.length} packets`);
      }
    }

    // Materialize
    const inserted = await materializePredictions(client, predictions, isDryRun);

    // Stats
    const acceptedCount = predictions.flatMap(p => p.domain_rows).filter(r => r.decision === 'accepted').length;
    const avgConfidence = predictions.reduce((sum, p) => sum + p.primary_confidence, 0) / predictions.length;

    console.log(`\n📊 Summary`);
    console.log(`  Total packets: ${predictions.length}`);
    console.log(`  Total prediction rows: ${predictions.reduce((sum, p) => sum + p.domain_rows.length, 0)}`);
    console.log(`  Accepted (≥0.85): ${acceptedCount}`);
    console.log(`  Avg confidence: ${(avgConfidence * 100).toFixed(1)}%`);
    console.log(`  Materialized: ${inserted}\n`);

    process.exit((inserted > 0 || isDryRun) ? 0 : 1);
  } catch (err) {
    console.error('❌ Pipeline failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await client.release();
  }
}

main();
