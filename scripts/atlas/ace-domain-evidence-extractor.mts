#!/usr/bin/env npx tsx
/**
 * ACE Domain Evidence Extractor (Phase 108+ Integration)
 *
 * Offline lesson extraction tool for ACE reflection pipeline.
 * Analyzes past run outcomes and generates candidate playbook deltas
 * about domain classification strategies.
 *
 * Used in the reflection → curation → playbook flow:
 *   outcome_ledger (run + results)
 *        ↓
 *   ace-domain-evidence-extractor (this module)
 *        ↓
 *   candidate PlaybookDelta objects
 *        ↓
 *   curator review + conflict checks
 *        ↓
 *   agent_playbook_entries (canonical playbook)
 *
 * Three-tier domain evidence signals:
 * 1. Lexical: keyword matching (deterministic, fast)
 * 2. Semantic: centroid cosine similarity + Qdrant retrieval
 * 3. Validated: LDR research + external evidence
 *
 * NOT used in hot path. Used post-hoc to extract reusable lessons.
 *
 * Usage:
 *   npx tsx scripts/atlas/ace-domain-evidence-extractor.mts \
 *     --run-id <uuid> --extract-lessons
 *   npx tsx scripts/atlas/ace-domain-evidence-extractor.mts \
 *     --packet-key <key> --analyze-domain [--confidence-threshold 0.6]
 */

import { pool } from '$lib/server/db/client.js';

interface DomainEvidence {
  kind: 'lexical' | 'semantic' | 'structural' | 'legacy' | 'research';
  source: string;
  value: any;
  confidence: number;
  weight: number;
}

interface DomainEvidenceReport {
  packetKey: string;
  sourceRef: string;
  evidenceSignals: DomainEvidence[];
  aggregatedDomains: Record<string, number>;
  primaryDomain: string;
  primaryConfidence: number;
  candidateLessons: Array<{
    lessonKey: string;
    scope: string[];
    content: string;
    confidence: number;
    evidenceRefs: string[];
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE COLLECTION (mirrors Phase 107 F but for offline analysis)
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

function normalizeKeywordSurface(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function tokenizeKeywordSurface(value: string): Set<string> {
  return new Set(normalizeKeywordSurface(value));
}

function hasExplicitKeywordMatch(surface: Set<string>, keyword: string): boolean {
  const parts = normalizeKeywordSurface(keyword);
  if (parts.length === 0) return false;
  return parts.every((part) => surface.has(part));
}

function collectLexicalEvidence(sourceRef: string, content?: string): DomainEvidence[] {
  const surface = tokenizeKeywordSurface(`${sourceRef} ${content || ''}`);
  const evidence: DomainEvidence[] = [];

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const matches = keywords.filter((kw) => hasExplicitKeywordMatch(surface, kw));
    if (matches.length > 0) {
      const confidence = Math.min(matches.length / keywords.length, 1.0);
      evidence.push({
        kind: 'lexical',
        source: 'keyword_match',
        value: { domain, matches, count: matches.length },
        confidence,
        weight: 0.15
      });
    }
  }

  return evidence;
}

function collectLinguisticEvidence(sourceRef: string): DomainEvidence[] {
  const evidence: DomainEvidence[] = [];
  const pathWords = sourceRef.split(/[\/\-_.]/).filter(w => w.length > 2);

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
        kind: 'lexical',
        source: 'identifier_pattern',
        value: { domain, matched_words: matchedWords },
        confidence: Math.min(matchedWords.length / 2, 1.0),
        weight: 0.10
      });
    }
  }

  return evidence;
}

async function collectStructuralEvidence(client: any, packetKey: string): Promise<DomainEvidence[]> {
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
        weight: 0.15
      }];
    }
  } catch {
    // No structural facts available
  }

  return [];
}

async function collectLegacyEvidence(client: any, packetKey: string): Promise<DomainEvidence[]> {
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
        weight: 0.40
      }];
    }
  } catch {
    // No legacy domain available
  }

  return [];
}

// ═══════════════════════════════════════════════════════════════════════════
// LESSON EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

function aggregateEvidence(evidence: DomainEvidence[]): Record<string, number> {
  const domainScores: Record<string, number> = {};

  for (const ev of evidence) {
    if (ev.value?.domain) {
      const domain = ev.value.domain;
      domainScores[domain] = (domainScores[domain] || 0) + ev.confidence * ev.weight;
    } else if (ev.value?.matches) {
      ev.value.matches.forEach((kw: string) => {
        for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
          if (keywords.some((keyword) => hasExplicitKeywordMatch(tokenizeKeywordSurface(kw), keyword))) {
            domainScores[domain] = (domainScores[domain] || 0) + ev.confidence * ev.weight;
          }
        }
      });
    }
  }

  const max = Math.max(...Object.values(domainScores), 1e-10);
  for (const [domain, score] of Object.entries(domainScores)) {
    domainScores[domain] = score / max;
  }

  return domainScores;
}

function generateCandidateLessons(report: DomainEvidenceReport, runId: string): DomainEvidenceReport {
  const lessons: DomainEvidenceReport['candidateLessons'] = [];

  // Lesson 1: Lexical signal for primary domain
  const lexicalEvidence = report.evidenceSignals.filter(e => e.kind === 'lexical');
  if (lexicalEvidence.length > 0 && report.primaryConfidence > 0.5) {
    lessons.push({
      lessonKey: `domain-lexical-${report.primaryDomain}`,
      scope: ['domain:classification', `domain:${report.primaryDomain}`],
      content: `Packets with lexical keywords for ${report.primaryDomain} should be classified with domain:${report.primaryDomain}. Keywords: ${lexicalEvidence.map(e => e.value?.matches || []).flat().join(', ')}`,
      confidence: report.primaryConfidence,
      evidenceRefs: [runId]
    });
  }

  // Lesson 2: Structural signal (if strong)
  const structuralEvidence = report.evidenceSignals.find(e => e.kind === 'structural');
  if (structuralEvidence && structuralEvidence.confidence > 0.7) {
    lessons.push({
      lessonKey: `domain-structural-${report.primaryDomain}`,
      scope: ['domain:classification', 'structural:facts'],
      content: `Structural AST facts can strengthen domain classification. Use AST symbol patterns to disambiguate between ${Object.keys(report.aggregatedDomains).slice(0, 3).join(', ')}.`,
      confidence: structuralEvidence.confidence,
      evidenceRefs: [runId]
    });
  }

  // Lesson 3: Fallback strategy (if legacy was needed)
  const legacyEvidence = report.evidenceSignals.find(e => e.kind === 'legacy');
  if (legacyEvidence && !report.evidenceSignals.find(e => e.kind === 'lexical' && e.confidence > 0.7)) {
    lessons.push({
      lessonKey: `domain-fallback-legacy`,
      scope: ['domain:classification', 'fallback:strategy'],
      content: `When lexical signals are weak, use atlas_packets.domain_class as fallback with confidence 0.6. Only proceed to heuristic inference if both primary and fallback are unavailable.`,
      confidence: 0.6,
      evidenceRefs: [runId]
    });
  }

  return { ...report, candidateLessons: lessons };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export async function extractDomainEvidenceReport(
  packetKey: string,
  sourceRef: string,
  runId: string
): Promise<DomainEvidenceReport> {
  const client = await pool.connect();

  try {
    const allEvidence: DomainEvidence[] = [];

    // Collect evidence in parallel
    allEvidence.push(...collectLexicalEvidence(sourceRef));
    allEvidence.push(...collectLinguisticEvidence(sourceRef));
    allEvidence.push(...await collectStructuralEvidence(client, packetKey));
    allEvidence.push(...await collectLegacyEvidence(client, packetKey));

    // Aggregate
    const domains = aggregateEvidence(allEvidence);
    const [primaryDomain, primaryConfidence] = Object.entries(domains).sort(([, a], [, b]) => b - a)[0] || ['unknown', 0];

    // Build report
    let report: DomainEvidenceReport = {
      packetKey,
      sourceRef,
      evidenceSignals: allEvidence,
      aggregatedDomains: domains,
      primaryDomain,
      primaryConfidence,
      candidateLessons: []
    };

    // Generate candidate lessons
    report = generateCandidateLessons(report, runId);

    return report;
  } finally {
    await client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI (for manual analysis or batch extraction)
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const packetKeyArg = args.find(a => a.startsWith('--packet-key='))?.split('=')[1];
  const runIdArg = args.find(a => a.startsWith('--run-id='))?.split('=')[1] || 'manual-' + Date.now();

  if (!packetKeyArg) {
    console.error('Usage: --packet-key <key> [--run-id <uuid>]');
    process.exit(1);
  }

  // Fetch packet details
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT packet_key, source_ref FROM atlas_packets WHERE packet_key = $1`,
      [packetKeyArg]
    );

    if (!result.rows[0]) {
      console.error(`Packet ${packetKeyArg} not found`);
      process.exit(1);
    }

    const { packet_key, source_ref } = result.rows[0];
    const report = await extractDomainEvidenceReport(packet_key, source_ref, runIdArg);

    console.log(`\n📊 Domain Evidence Report\n`);
    console.log(`Packet: ${report.packetKey}`);
    console.log(`Source: ${report.sourceRef}`);
    console.log(`Primary Domain: ${report.primaryDomain} (confidence: ${(report.primaryConfidence * 100).toFixed(1)}%)`);
    console.log(`\nEvidence Signals: ${report.evidenceSignals.length}`);
    report.evidenceSignals.forEach(e => {
      console.log(`  - ${e.kind}: ${e.source} (confidence: ${(e.confidence * 100).toFixed(1)}%)`);
    });

    console.log(`\nCandidate Lessons: ${report.candidateLessons.length}`);
    report.candidateLessons.forEach(l => {
      console.log(`  - ${l.lessonKey} (confidence: ${(l.confidence * 100).toFixed(1)}%)`);
      console.log(`    Scope: ${l.scope.join(', ')}`);
      console.log(`    Content: ${l.content.substring(0, 100)}...`);
    });

    console.log(`\n${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await client.release();
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch(console.error);
}

export type { DomainEvidence, DomainEvidenceReport };
