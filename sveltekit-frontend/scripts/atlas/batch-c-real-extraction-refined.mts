#!/usr/bin/env tsx
/**
 * Batch C Real Extraction — Refined Implementation
 * Combines working tools: ast-grep (lexical), metadata (AST), heuristics (LangExtract)
 *
 * Lanes:
 * 1. Lexical: ast-grep pattern matching (REAL)
 * 2. AST: metadata structure (already in DB, not simulated)
 * 3. LangExtract: keyword heuristics (simplified, not ML-based)
 * 4. Semantic: Gemma4 classification (deferred to Phase 2)
 * 5. Ontology: schema-matched tuple (REAL schema validation)
 */

import { execSync } from 'child_process';
import { pool } from '$lib/server/db/client.js';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

interface LaneObservation {
  node_id: string;
  lane: 'lexical' | 'ast' | 'langextract' | 'semantic' | 'ontology_tuple';
  observation: string;
  confidence: number;
  source_field?: string;
  extraction_method?: string; // 'ast-grep' | 'metadata' | 'heuristic' | 'schema'
}

// ============================================================================
// Extraction Functions
// ============================================================================

/**
 * Lane 1: LEXICAL — Real ast-grep pattern matching
 */
async function extractLexicalObservations(sourceRef: string | null): Promise<string | null> {
  if (!sourceRef) return null;

  try {
    // Run ast-grep to find import/export patterns
    const cmd = `ast-grep run -l typescript -p 'import $_' "${sourceRef}" 2>&1`;
    const output = execSync(cmd, { encoding: 'utf-8' });

    const lines = output.split('\n').filter((l) => l.includes(':') && l.includes('import'));
    if (lines.length === 0) return null;

    // Extract top-level patterns
    const patterns = lines.slice(0, 3).map((l) => {
      const match = l.match(/import\s+({[^}]+}|[\w*]+)/);
      return match ? match[1].slice(0, 30) : null;
    });

    return `lexical:imports[${patterns.filter(Boolean).join(',')}]`;
  } catch {
    return null;
  }
}

/**
 * Lane 2: AST — Metadata structure (already in Postgres)
 */
async function extractASTObservation(
  nodeType: string,
  metadata: Record<string, any>
): Promise<string> {
  const depth = metadata?.tree_depth ?? 0;
  const childCount = metadata?.child_count ?? 0;

  return `node_type:${nodeType}|depth:${depth}|children:${childCount}`;
}

/**
 * Lane 3: LANGEXTRACT — Keyword heuristics
 */
async function extractLangExtractObservation(featureLabel: string | null): Promise<string> {
  if (!featureLabel) return 'entities:unknown';

  const text = featureLabel.toLowerCase();
  const entities: string[] = [];

  // Domain classification
  if (text.includes('auth') || text.includes('session') || text.includes('user')) entities.push('auth');
  if (text.includes('data') || text.includes('store') || text.includes('cache')) entities.push('data');
  if (text.includes('ui') || text.includes('component') || text.includes('render')) entities.push('ui');
  if (text.includes('service') || text.includes('client') || text.includes('api')) entities.push('service');
  if (text.includes('util') || text.includes('helper') || text.includes('tool')) entities.push('util');

  return entities.length > 0 ? `entities:${entities.join(',')}` : 'entities:generic';
}

/**
 * Lane 4: SEMANTIC — Direct feature label (deferred Gemma4 for Phase 2)
 */
async function extractSemanticObservation(featureLabel: string | null): Promise<string> {
  return featureLabel || 'unknown-feature';
}

/**
 * Lane 5: ONTOLOGY TUPLE — Schema-validated identity
 */
const OntologyTupleSchema = z.object({
  entity: z.string().min(1),
  source: z.string().min(1),
  label: z.string().min(1),
});

async function extractOntologyTupleObservation(
  featureId: string | null,
  sourceRef: string | null,
  featureLabel: string | null
): Promise<string> {
  const tuple = {
    entity: featureId || 'unknown',
    source: sourceRef || 'unknown',
    label: featureLabel || 'unknown',
  };

  // Validate against schema
  const validation = OntologyTupleSchema.safeParse(tuple);

  if (!validation.success) {
    return JSON.stringify({ ...tuple, valid: false, errors: validation.error.issues.map((i) => i.path.join('.')) });
  }

  return JSON.stringify({ ...tuple, valid: true });
}

// ============================================================================
// Main Extraction
// ============================================================================

async function extractAllLanes(node: {
  node_id: string;
  feature_id: string | null;
  feature_label: string | null;
  source_ref: string | null;
  node_type: string;
  metadata: Record<string, any>;
}): Promise<LaneObservation[]> {
  const observations: LaneObservation[] = [];

  // Lane 1: Lexical (ast-grep)
  const lexicalObs = await extractLexicalObservations(node.source_ref);
  if (lexicalObs) {
    observations.push({
      node_id: node.node_id,
      lane: 'lexical',
      observation: lexicalObs,
      confidence: 0.92,
      source_field: 'source_ref',
      extraction_method: 'ast-grep',
    });
  }

  // Lane 2: AST (metadata)
  const astObs = await extractASTObservation(node.node_type, node.metadata);
  observations.push({
    node_id: node.node_id,
    lane: 'ast',
    observation: astObs,
    confidence: 0.94,
    source_field: 'metadata',
    extraction_method: 'metadata',
  });

  // Lane 3: LangExtract (heuristics)
  const langExtractObs = await extractLangExtractObservation(node.feature_label);
  observations.push({
    node_id: node.node_id,
    lane: 'langextract',
    observation: langExtractObs,
    confidence: 0.70,
    source_field: 'feature_label',
    extraction_method: 'heuristic',
  });

  // Lane 4: Semantic (direct)
  const semanticObs = await extractSemanticObservation(node.feature_label);
  observations.push({
    node_id: node.node_id,
    lane: 'semantic',
    observation: semanticObs,
    confidence: 0.95,
    source_field: 'feature_label',
    extraction_method: 'direct',
  });

  // Lane 5: Ontology Tuple (schema)
  const ontologyObs = await extractOntologyTupleObservation(
    node.feature_id,
    node.source_ref,
    node.feature_label
  );
  observations.push({
    node_id: node.node_id,
    lane: 'ontology_tuple',
    observation: ontologyObs,
    confidence: 0.96,
    source_field: 'feature_id+source_ref+feature_label',
    extraction_method: 'schema',
  });

  return observations;
}

// ============================================================================
// Test: Extract one node
// ============================================================================

async function testExtraction() {
  console.log('[Real Extraction] Starting test...');

  try {
    // Load one sample node
    const result = await pool.query(
      `SELECT node_id, feature_id, feature_label, source_ref, node_type, metadata
       FROM atlas_tree_nodes
       WHERE feature_id IS NOT NULL
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      console.log('[Real Extraction] No nodes found');
      process.exit(1);
    }

    const node = result.rows[0];
    console.log(`[Real Extraction] Testing on node: ${node.node_id}`);
    console.log(`  feature_id: ${node.feature_id}`);
    console.log(`  feature_label: ${node.feature_label}`);
    console.log(`  source_ref: ${node.source_ref}`);

    // Extract all lanes
    const observations = await extractAllLanes(node);

    console.log(`\n[Real Extraction] Extracted ${observations.length} observations:`);
    for (const obs of observations) {
      console.log(`  [${obs.lane}] ${obs.extraction_method}: ${obs.observation.slice(0, 60)}`);
      console.log(`           confidence: ${obs.confidence}`);
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error(`[Real Extraction] ERROR: ${(err as Error).message}`);
    process.exit(1);
  }
}

testExtraction();
