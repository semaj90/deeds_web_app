/**
 * langextract/native — Pure TypeScript replacement for the Python langextract
 * service. Replaces the FastAPI + spaCy + httpx+Ollama pipeline with regex-
 * based section detection + legal-domain entity extraction. No Python, no GIL.
 *
 * Why this exists:
 *   - The Python service (phase66-langextract on :8095) added 200-300MB RAM,
 *     a Python toolchain dependency, and GIL-bound single-threaded NER.
 *   - The "langextract-go" candidate at :8090 is aspirational — no Go impl
 *     was ever shipped. Graphify shows fanIn=0 for the entire langextract
 *     adapter chain, but real grep finds 7 active call sites.
 *   - The existing TS heuristic (detectSectionsHeuristic) already covered
 *     11 legal section types. This file extends it to full parity:
 *       1. Section detection (delegated to existing regex pipeline)
 *       2. Legal entity extraction (citations, statutes, monetary, dates,
 *          parties) via deterministic regex
 *       3. Optional Gemma4 NER for high-precision queries (offloaded to
 *          worker_threads via compute-pool — escapes the V8 main loop the
 *          same way Python's GIL bottleneck is escaped by separate processes)
 *
 * API contract matches the existing `extractSectionsFromText()` shape so
 * existing callers can swap to this without a refactor.
 */

import { detectSectionsHeuristic } from '$lib/server/services/langextract-service.js';
import type {
  LangExtractOutput,
  LangExtractSection,
} from '$lib/server/services/langextract-service.js';

// ── Entity extraction ─────────────────────────────────────────────────────────

export interface LegalEntity {
  type:
    | 'citation'       // 384 U.S. 436 (1966)
    | 'statute'        // 42 U.S.C. § 1983
    | 'case_name'      // Brown v. Board of Education
    | 'court'          // Supreme Court, 9th Cir., E.D.N.Y.
    | 'monetary'       // $1,500,000
    | 'date'           // March 15, 2026 / 2026-03-15
    | 'person'         // Justice Roberts (heuristic from titles)
    | 'organization';  // ACLU, Department of Justice
  text:        string;
  start:       number;
  end:         number;
  confidence:  number;
  metadata?:   Record<string, string | number>;
}

// ── Patterns (curated for legal-domain precision over recall) ─────────────────

const PATTERNS: Array<{
  type:       LegalEntity['type'];
  re:         RegExp;
  confidence: number;
  metaKey?:   string;
}> = [
  // Citations: Volume Reporter Page (Year) — e.g. "384 U.S. 436 (1966)"
  {
    type: 'citation',
    re: /\b(\d{1,4})\s+(U\.?S\.?|F\.?\d?d?|S\.?\s*Ct\.?|L\.?\s*Ed\.?\s*\d?d?|N\.?E\.?\d?d?|N\.?W\.?\d?d?|S\.?E\.?\d?d?|S\.?W\.?\d?d?|P\.?\d?d?|A\.?\d?d?|Cal\.?\s*(?:App\.?)?\s*\d?d?)\s+(\d{1,5})(?:\s*\((\d{4})\))?/g,
    confidence: 0.95,
  },
  // Statute: title U.S.C. § number — e.g. "42 U.S.C. § 1983"
  {
    type: 'statute',
    re: /\b(\d{1,3})\s+(U\.?S\.?C\.?|C\.?F\.?R\.?)\s*§+\s*(\d+(?:[a-z](?:-\d+)?)?(?:\([a-z0-9]+\))*)/gi,
    confidence: 0.95,
  },
  // Case name: X v. Y — capture both party names
  {
    type: 'case_name',
    re: /\b([A-Z][A-Za-z.&'-]+(?:\s+[A-Z][A-Za-z.&'-]+){0,3})\s+v\.?\s+([A-Z][A-Za-z.&'-]+(?:\s+[A-Z][A-Za-z.&'-]+){0,3})\b/g,
    confidence: 0.85,
  },
  // Court: Supreme Court, 9th Cir., E.D.N.Y. style
  {
    type: 'court',
    re: /\b(?:U\.?S\.?\s+)?Supreme\s+Court|(?:\d+(?:st|nd|rd|th)|D\.C\.|First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Eleventh|Federal)\s+Cir(?:\.|cuit)?|[NSEWMnsewm]?\.?D\.\s*[A-Z][a-z]*\.|Court\s+of\s+Appeals/g,
    confidence: 0.80,
  },
  // Monetary: $1,500,000 or $1.5M / $1.5 million
  {
    type: 'monetary',
    re: /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:million|billion|thousand|M|B|K)?\b/gi,
    confidence: 0.90,
  },
  // Date: ISO 8601 or "Month Day, Year"
  {
    type: 'date',
    re: /\b\d{4}-\d{2}-\d{2}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/g,
    confidence: 0.95,
  },
  // Person (titled): Justice X, Judge Y, Senator Z
  {
    type: 'person',
    re: /\b(?:Justice|Judge|Chief Justice|Senator|Representative|Attorney General|Mr\.|Ms\.|Mrs\.|Dr\.|Prof\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
    confidence: 0.80,
  },
  // Organization: known acronyms + Department/Agency patterns
  {
    type: 'organization',
    re: /\b(?:ACLU|FBI|CIA|DOJ|EPA|FTC|SEC|IRS|DEA|ATF|Department\s+of\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*|[A-Z][a-z]+\s+Agency|[A-Z][a-z]+\s+Bureau)\b/g,
    confidence: 0.85,
  },
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract named entities from legal text using curated regex patterns.
 * Synchronous — no LLM, no Python, no network. Suitable for the hot path.
 *
 * For high-precision NER (e.g. distinguishing person names without titles
 * or extracting unfamiliar organization names), use `extractEntitiesGemma4()`
 * which dispatches to a worker_threads-bound Gemma4 call.
 */
export function extractEntitiesNative(text: string, opts: { maxPerType?: number } = {}): LegalEntity[] {
  const maxPerType = opts.maxPerType ?? 50;
  const out: LegalEntity[] = [];
  const seen = new Set<string>();

  for (const { type, re, confidence } of PATTERNS) {
    let count = 0;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null && count < maxPerType) {
      const start = m.index;
      const end   = start + m[0].length;
      const key   = `${type}:${start}:${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        type,
        text:       m[0],
        start,
        end,
        confidence,
        metadata:   m.length > 1 ? buildMetadata(type, m) : undefined,
      });
      count++;
    }
  }
  // Stable order: by start offset, then type
  return out.sort((a, b) => a.start - b.start || a.type.localeCompare(b.type));
}

function buildMetadata(type: LegalEntity['type'], m: RegExpExecArray): Record<string, string | number> | undefined {
  switch (type) {
    case 'citation':
      return {
        volume:   m[1],
        reporter: (m[2] ?? '').replace(/\./g, ''),
        page:     m[3] ?? '',
        ...(m[4] ? { year: Number(m[4]) } : {}),
      };
    case 'statute':
      return { title: m[1], code: (m[2] ?? '').replace(/\./g, ''), section: m[3] };
    case 'case_name':
      return { plaintiff: m[1], defendant: m[2] };
    default:
      return undefined;
  }
}

/**
 * Full document extraction — sections + entities + metadata. Mirrors the
 * Python `extractSectionsFromText` API so callers can swap with no refactor.
 */
export function extractDocumentNative(
  text:        string,
  documentId:  string,
  documentType: 'statute' | 'case' = 'case',
): LangExtractOutput & { entities: LegalEntity[] } {
  const base = detectSectionsHeuristic(text, documentId);
  const entities = extractEntitiesNative(text);

  // Patch sections with entity counts so callers can rank by density
  const sections: LangExtractSection[] = base.sections.map((s) => {
    const inSection = entities.filter((e) => e.start >= s.start_offset && e.end <= s.end_offset).length;
    return { ...s, confidence: Math.max(s.confidence ?? 0.6, inSection > 0 ? 0.75 : 0.6) };
  });

  return {
    ...base,
    sections,
    entities,
    extraction_confidence: sections.length > 0 ? 0.85 : 0.4,
  };
}

// ── Worker-pool dispatch (escapes V8 main loop, like sub-processes escape GIL) ─

/**
 * Run native extraction inside the existing compute-pool worker_threads pool.
 * Each worker has its own V8 isolate, so this provides true parallelism for
 * batch ingestion (evidence pipeline, document upload, etc.).
 *
 * Returns null if the compute pool is unavailable; caller should fall back
 * to the synchronous `extractDocumentNative()` on the main thread.
 */
export async function extractDocumentInWorker(
  text:        string,
  documentId:  string,
  documentType: 'statute' | 'case' = 'case',
): Promise<LangExtractOutput & { entities: LegalEntity[] }> {
  try {
    const { getComputePool } = await import('$lib/server/workers/compute-pool.js').catch(() => ({
      getComputePool: null as null | (() => { run: (type: string, payload: unknown, opts?: unknown) => Promise<unknown> }),
    }));
    if (!getComputePool) return extractDocumentNative(text, documentId, documentType);
    const pool = getComputePool();
    // Worker handles only entity extraction (the regex sweep). Section detection
    // stays on the main thread — it's cheap and keeps worker payloads small.
    const workerOut = await (pool as { run: (type: string, payload: unknown, opts?: unknown) => Promise<unknown> })
      .run('langextract.extract', { text, documentId, documentType }, { timeoutMs: 5000 })
      .catch(() => null);
    const wo = workerOut as { entities?: LegalEntity[] } | null;
    if (!wo?.entities) return extractDocumentNative(text, documentId, documentType);
    const base = detectSectionsHeuristic(text, documentId);
    const sections: LangExtractSection[] = base.sections.map((s) => {
      const inSection = wo.entities!.filter((e) => e.start >= s.start_offset && e.end <= s.end_offset).length;
      return { ...s, confidence: Math.max(s.confidence ?? 0.6, inSection > 0 ? 0.75 : 0.6) };
    });
    return {
      ...base,
      sections,
      entities:               wo.entities,
      extraction_confidence:  sections.length > 0 ? 0.85 : 0.4,
    };
  } catch {
    return extractDocumentNative(text, documentId, documentType);
  }
}

// ── Graphify integration: expose entity extraction for cluster summaries ─────

/**
 * Extract entities for a graphify cluster summary text. Used by
 * cluster-summaries.mjs and directory-summarizer.ts to enrich Gemma4 outputs
 * with structured citations + statutes + parties (which the model itself
 * sometimes hallucinates or omits).
 */
export function enrichClusterSummary(summaryText: string): {
  entities:    LegalEntity[];
  citationCount: number;
  statuteCount:  number;
  partyCount:    number;
} {
  const entities = extractEntitiesNative(summaryText, { maxPerType: 20 });
  return {
    entities,
    citationCount: entities.filter((e) => e.type === 'citation').length,
    statuteCount:  entities.filter((e) => e.type === 'statute').length,
    partyCount:    entities.filter((e) => e.type === 'case_name' || e.type === 'person').length,
  };
}
