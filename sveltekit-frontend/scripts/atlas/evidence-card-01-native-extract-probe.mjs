#!/usr/bin/env node
/**
 * EVIDENCE-CARD-01 probe: empirically checks whether the repo's only wired "batch LangExtract"
 * implementation (native TS, legal-domain regex — src/lib/server/langextract/native.ts) can
 * populate CandidateEvidenceCardV1's code-oriented `extracted` fields (symbols/apis/tests/
 * constraints) for TypeScript code candidates, or whether it's a domain mismatch (legal-entity
 * extraction only: citations/statutes/case names/courts/monetary/dates/persons/orgs).
 * Read-only. No production writes, no GPU sidecar calls.
 */
import { extractDocumentNative } from '../../src/lib/server/langextract/native.ts';

const CANDIDATES = [
  { id: 'service-merge', text: 'export function mergeDuplicateIdentityScores(results) { const key = r.symbol_version_id ?? r.packet_key ?? r.id; merged.set(key, { ...representative, score: existing.score + r.score }); }' },
  { id: 'rrf-tologicallane', text: 'function toLogicalLaneName(value) { const normalized = value.trim().toLowerCase(); return normalizeRetrievalLane(normalized) ?? (normalized || "dispatcher"); }' },
  { id: 'evidence-card', text: 'export function assertExtractionBatchBounded(candidateCount) { if (candidateCount > CANDIDATE_EVIDENCE_EXTRACTION_MAX_BATCH) throw new Error("exceeds the bounded maximum"); }' },
  { id: 'firecrawl-provider', text: 'export async function loadFirecrawl() { try { const mod = await import("@mendable/firecrawl-js"); const FirecrawlCtor = mod.default ?? mod; cached = { status: "AVAILABLE", FirecrawlCtor }; } catch (err) { cached = { status: "UNAVAILABLE", reason: err.message }; } return cached; }' },
];

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const results = [];
for (const c of CANDIDATES) {
  const t0 = performance.now();
  const out = extractDocumentNative(c.text, c.id, 'case');
  const latencyMs = performance.now() - t0;
  const entityCount = out.entities?.length ?? 0;
  results.push({
    id: c.id,
    rawWordCount: wordCount(c.text),
    latencyMs: Number(latencyMs.toFixed(3)),
    entityCount,
    entities: out.entities ?? [],
    sectionCount: out.sections?.length ?? 0,
    // Can this output be mapped onto CandidateEvidenceCardV1's `extracted` shape at all?
    mapsToSymbols: false,   // native extractor has no 'symbol' entity type
    mapsToApis: false,      // no 'api' entity type
    mapsToTests: false,     // no 'test' entity type
    mapsToConstraints: false, // no 'constraint' entity type
  });
}

console.log(JSON.stringify({
  schema: 'atlas.evidence-card-01-native-extract-probe.v1',
  readOnly: true,
  extractorTested: 'src/lib/server/langextract/native.ts::extractDocumentNative (legal-domain regex: citation/statute/case_name/court/monetary/date/person/organization)',
  targetSchema: 'CandidateEvidenceCardV1.extracted (symbols/apis/tests/constraints/groundedFacts)',
  results,
  totalEntitiesAcrossAllCandidates: results.reduce((s, r) => s + r.entityCount, 0),
}, null, 2));
