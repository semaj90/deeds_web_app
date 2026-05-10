/**
 * Structure-Aware Legal Document Chunker
 *
 * Splits legal PDFs (statutes, constitutions, regulations) by structural headings
 * before applying token-window chunking within each section.
 *
 * Hierarchy detection:
 *   PART / TITLE / CHAPTER / ARTICLE / SECTION / § / numbered headings
 *
 * Output: LegalChunk[] with sectionPath, page info, citation candidates, heading text.
 * Designed for 400+ page documents like the California Constitution.
 */

// ── Types ────────────────────────────────────────────────────────────────

/**
 * Legal-content section classification — used by RRF section-weighted scoring,
 * KAG applicable-law routing, and RAPTOR leaf classification.
 *
 * Distinct from {@link LegalStructureSection} which represents document hierarchy.
 */
export type LegalSection =
  | 'caption'
  | 'procedural_posture'
  | 'facts'
  | 'issue'
  | 'analysis'
  | 'holding'
  | 'dicta'
  | 'disposition'
  | 'citation_block'
  | 'unknown';

/**
 * Recommended scoring multipliers for legal sections in retrieval rerank.
 * Reference values — actual RRF scorer (Phase 1C) imports and may tune these.
 */
export const LEGAL_SECTION_BOOST: Record<LegalSection, number> = {
  holding: 1.5,
  analysis: 1.2,
  facts: 1.0,
  issue: 1.0,
  disposition: 0.95,
  procedural_posture: 0.9,
  caption: 0.8,
  citation_block: 0.8,
  dicta: 0.65,
  unknown: 0.75,
};

export interface LegalChunk {
  text: string;
  chunkIndex: number;
  /** Hierarchical section path, e.g. ["Article I", "Section 2", "Subdivision (a)"] */
  sectionPath: string[];
  /** Heading text of the immediate section */
  heading: string;
  /** Start page (1-based, if available from pdf-parse) */
  pageStart?: number;
  /** End page */
  pageEnd?: number;
  /** Character offsets in the full text */
  startOffset: number;
  endOffset: number;
  /** Approximate token count */
  tokenCount: number;
  /** Citation candidates found in this chunk */
  citations: string[];
  /** Extraction method for the parent document */
  extractionMethod?: string;
  /** DocTags element types present in this chunk (from Granite-Docling) */
  doctagTypes?: string[];
  /** Whether this chunk is a preserved whole table */
  isTable?: boolean;
  // ── Phase 1A: legal retrieval metadata (RRF / KAG / RAPTOR feed) ──
  /** Legal-content classification (holding|analysis|facts|...) for section-weighted RRF */
  legal_section?: LegalSection;
  /** Jurisdiction hint, e.g. "US-9th", "CA", "US-Federal", or "unknown" */
  jurisdiction?: string;
  /**
   * Authority tier (1=primary binding, 2=primary persuasive, 3=secondary, 4=other).
   * See HyperRAG TrustMeta — keep aligned with `trust_tier` mapping.
   */
  authority_tier?: 1 | 2 | 3 | 4;
  /** Number of citations detected in this chunk (denormalized from `citations.length`) */
  citation_count?: number;
  /** Confidence in section classification (0..1). Heuristic = ~0.6, LLM-assisted = ~0.9 */
  extraction_confidence?: number;
}

/**
 * Document-structure section parsed from headings (Article/Section/§ hierarchy).
 * Distinct from {@link LegalSection} which is the content classification.
 */
export interface LegalStructureSection {
  level: number;
  heading: string;
  text: string;
  startOffset: number;
  endOffset: number;
  children: LegalStructureSection[];
  /** Resolved section path from root */
  path: string[];
}

export interface LegalChunkerOptions {
  /** Max tokens per chunk (default: 512) */
  maxTokens?: number;
  /** Token overlap between adjacent chunks (default: 128) */
  overlap?: number;
  /** Min section text length to create a chunk (default: 30 chars) */
  minSectionLength?: number;
  /** DocTags blocks from Granite-Docling for structure-aware chunking */
  doclingBlocks?: Array<{
    type: string;
    text: string;
    page: number;
    bbox?: [number, number, number, number];
  }>;
}

// ── Heading patterns (ranked by hierarchy level) ──────────────────────────

const HEADING_PATTERNS: Array<{ pattern: RegExp; level: number; label: string }> = [
  // Level 0: Top divisions
  { pattern: /^(?:PART|DIVISION)\s+(?:[IVXLCDM]+|\d+)\b[.:—–\- ]*(.*)/im, level: 0, label: 'Part' },
  // Level 1: Titles
  { pattern: /^TITLE\s+(?:[IVXLCDM]+|\d+)\b[.:—–\- ]*(.*)/im, level: 1, label: 'Title' },
  // Level 2: Chapters
  { pattern: /^CHAPTER\s+(?:[IVXLCDM]+|\d+)\b[.:—–\- ]*(.*)/im, level: 2, label: 'Chapter' },
  // Level 3: Articles
  { pattern: /^ARTICLE\s+(?:[IVXLCDM]+|\d+)\b[.:—–\- ]*(.*)/im, level: 3, label: 'Article' },
  // Level 4: Sections (§ or SECTION or SEC.)
  { pattern: /^(?:SECTION|SEC\.?|§)\s*(\d+[\w.-]*)\b[.:—–\- ]*(.*)/im, level: 4, label: 'Section' },
  // Level 5: Subdivisions
  { pattern: /^\(([a-z])\)\s+(.*)/m, level: 5, label: 'Subdivision' },
];

// ── Citation extraction regex ───────────────────────────────────────────

const CITATION_PATTERNS = [
  // California Constitution: "Cal. Const. art. I, § 2" or "Article I, Section 2"
  /(?:Cal\.?\s*Const\.?\s*)?(?:art(?:icle)?\.?\s*[IVXLCDM]+)\s*,?\s*(?:§|sec(?:tion)?\.?)\s*\d+[\w.-]*/gi,
  // Generic section references: "§ 1234" or "Section 1234.5(a)"
  /§\s*\d+[\w.-]*/g,
  // US Code: "42 U.S.C. § 1983"
  /\d+\s+U\.?S\.?C\.?\s*§?\s*\d+[\w.-]*/gi,
  // California codes: "Cal. Civ. Code § 1234" or "CCP § 425.16"
  /(?:Cal\.?\s*)?(?:Civ|Pen|Gov|Fam|Lab|Bus|Corp|Prob|Ins|Fin|Ed|Health|Welf|Veh|Wat)\.\s*(?:Code|& Prof\.?\s*Code)\s*§?\s*\d+[\w.-]*/gi,
  // Case citations: "Smith v. Jones, 123 Cal.App.4th 456"
  /\b[A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+,?\s+\d+\s+(?:Cal\.?(?:\s*App\.?)?(?:\s*\d+(?:st|nd|rd|th))?|F\.?\s*(?:\d+d|Supp))\s+\d+/g,
];

// ── Main API ────────────────────────────────────────────────────────────

/**
 * Parse a legal document into structure-aware chunks.
 * If DocTags blocks are provided (from Granite-Docling), uses block boundaries
 * for precise section splits and preserves tables as whole units.
 * Otherwise falls back to heading detection + simple token windowing.
 */
export function chunkLegalDocument(fullText: string, opts?: LegalChunkerOptions): LegalChunk[] {
  const maxTokens = opts?.maxTokens ?? 512;
  const overlap = opts?.overlap ?? 128;
  const minLen = opts?.minSectionLength ?? 30;

  // If DocTags blocks available, use block-aware chunking
  if (opts?.doclingBlocks && opts.doclingBlocks.length > 0) {
    return chunkFromDoclingBlocks(opts.doclingBlocks, maxTokens, overlap, minLen);
  }

  // 1. Try to split by structural headings
  const sections = parseSections(fullText);

  // 2. If no structure found, fall back to simple windowing
  if (sections.length <= 1 && !sections[0]?.heading) {
    return simpleChunk(fullText, maxTokens, overlap);
  }

  // 3. Flatten sections and chunk each one
  const flatSections = flattenSections(sections);
  const chunks: LegalChunk[] = [];
  let globalChunkIndex = 0;

  for (const section of flatSections) {
    if (section.text.trim().length < minLen) continue;

    const sectionChunks = chunkSectionText(
      section.text,
      maxTokens,
      overlap,
      section.path,
      section.heading,
      section.startOffset,
      globalChunkIndex
    );

    for (const chunk of sectionChunks) {
      chunks.push(chunk);
      globalChunkIndex++;
    }
  }

  return chunks;
}

// ── Section parsing ─────────────────────────────────────────────────────

export function parseSections(text: string): LegalStructureSection[] {
  const lines = text.split('\n');
  const root: LegalStructureSection[] = [];
  const stack: LegalStructureSection[] = [];
  let currentText = '';
  let currentOffset = 0;
  let lineOffset = 0;

  for (const line of lines) {
    const heading = detectHeading(line.trim());

    if (heading) {
      // Close previous section's text
      if (stack.length > 0) {
        const current = stack[stack.length - 1];
        current.text += currentText;
        current.endOffset = lineOffset;
      } else if (currentText.trim() && root.length === 0) {
        // Preamble text before first heading
        root.push({
          level: -1,
          heading: 'Preamble',
          text: currentText,
          startOffset: 0,
          endOffset: lineOffset,
          children: [],
          path: ['Preamble'],
        });
      }
      currentText = '';

      const newSection: LegalStructureSection = {
        level: heading.level,
        heading: heading.fullHeading,
        text: '',
        startOffset: lineOffset,
        endOffset: lineOffset,
        children: [],
        path: [],
      };

      // Pop stack until we find a parent with lower level
      while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
        stack.pop();
      }

      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        parent.children.push(newSection);
        newSection.path = [...parent.path, heading.fullHeading];
      } else {
        root.push(newSection);
        newSection.path = [heading.fullHeading];
      }

      stack.push(newSection);
    } else {
      currentText += line + '\n';
    }

    lineOffset += line.length + 1; // +1 for \n
  }

  // Close last section
  if (stack.length > 0) {
    const current = stack[stack.length - 1];
    current.text += currentText;
    current.endOffset = lineOffset;
  }

  return root;
}

function detectHeading(line: string): { level: number; fullHeading: string } | null {
  if (!line || line.length > 200) return null; // Headings are short

  for (const { pattern, level } of HEADING_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      return { level, fullHeading: line.trim() };
    }
  }

  // Detect ALL-CAPS lines as potential headings (common in legal docs)
  if (line.length > 3 && line.length < 120 && line === line.toUpperCase() && /[A-Z]/.test(line)) {
    // Exclude lines that are just numbers or punctuation
    if (/[A-Z]{3,}/.test(line)) {
      return { level: 2, fullHeading: line.trim() };
    }
  }

  return null;
}

function flattenSections(sections: LegalStructureSection[]): LegalStructureSection[] {
  const result: LegalStructureSection[] = [];

  for (const section of sections) {
    result.push(section);
    if (section.children.length > 0) {
      result.push(...flattenSections(section.children));
    }
  }

  return result;
}

// ── Chunk a single section into token windows ────────────────────────────

function chunkSectionText(
  text: string,
  maxTokens: number,
  overlap: number,
  sectionPath: string[],
  heading: string,
  baseOffset: number,
  startIndex: number
): LegalChunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const citations = extractCitations(text);

  if (words.length <= maxTokens) {
    const trimmed = text.trim();
    return [
      {
        text: trimmed,
        chunkIndex: startIndex,
        sectionPath,
        heading,
        startOffset: baseOffset,
        endOffset: baseOffset + text.length,
        tokenCount: words.length,
        citations,
        ...buildLegalMetadata(trimmed, heading, citations),
      },
    ];
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = startIndex;
  let charOffset = 0;

  for (let i = 0; i < words.length; i += maxTokens - overlap) {
    const windowWords = words.slice(i, i + maxTokens);
    const chunkText = windowWords.join(' ');
    const chunkCitations = extractCitations(chunkText);

    chunks.push({
      text: chunkText,
      chunkIndex: chunkIdx,
      sectionPath,
      heading,
      startOffset: baseOffset + charOffset,
      endOffset: baseOffset + charOffset + chunkText.length,
      tokenCount: windowWords.length,
      citations: chunkCitations,
      ...buildLegalMetadata(chunkText, heading, chunkCitations),
    });

    charOffset += windowWords.slice(0, maxTokens - overlap).join(' ').length + 1;
    chunkIdx++;

    if (i + maxTokens >= words.length) break;
  }

  return chunks;
}

// ── Citation extraction ──────────────────────────────────────────────────

function extractCitations(text: string): string[] {
  const found = new Set<string>();

  for (const pattern of CITATION_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      found.add(match[0].trim());
    }
  }

  return [...found];
}

// ── Phase 1A: Section classification + jurisdiction + authority tier ─────

/**
 * Cue-phrase weights per legal section. Heuristic — Phase 1B/1C will
 * back this with an LLM-assisted classifier when extraction_confidence < 0.7.
 *
 * Phrases are matched case-insensitively against the chunk text + heading.
 * Multi-word phrases are stronger signals than single words.
 */
const SECTION_CUES: Record<LegalSection, string[]> = {
  caption: ['plaintiff', 'defendant', 'appellant', 'appellee', 'petitioner', 'respondent', 'case no.', 'docket no.'],
  procedural_posture: ['appeal from', 'on appeal', 'this matter comes before', 'motion for', 'demurrer', 'reversed and remanded', 'affirmed in part', 'we granted certiorari'],
  facts: ['on or about', 'on the morning of', 'on the night of', 'plaintiff alleges', 'the record shows', 'the evidence established', 'background facts', 'factual background'],
  issue: ['the question presented', 'we must decide', 'the issue before us', 'the question is whether', 'the central question', 'we consider whether'],
  analysis: ['we hold that', 'we agree', 'we disagree', 'the test for', 'under this standard', 'applying this rule', 'as we explained in', 'this court has held', 'the proper inquiry'],
  holding: ['we hold', 'we conclude that', 'we therefore hold', 'accordingly, we hold', 'this court holds', 'it is therefore held', 'the holding of this case'],
  dicta: ['we note in passing', 'we observe that', 'although not necessary', 'as a matter of dictum', 'we need not decide', 'in passing'],
  disposition: ['judgment affirmed', 'judgment reversed', 'so ordered', 'remanded for further', 'the petition is denied', 'the petition is granted', 'reversed and remanded', 'we vacate'],
  citation_block: [], // detected via citation_count >= threshold
  unknown: [],
};

/**
 * Jurisdiction inference from citation patterns + heading hints.
 * Returns a stable token like "US-Federal", "US-9th", "CA", or "unknown".
 */
function inferJurisdiction(text: string, citations: string[]): string {
  const sample = `${text.slice(0, 2000)} ${citations.join(' ')}`.toLowerCase();
  if (/\bu\.?s\.?\s*supreme\s*court\b|\bcert(?:iorari)?\b/.test(sample)) return 'US-Federal';
  if (/\bu\.?s\.?c\.?\s*§|\b\d+\s+u\.?s\.?\s+\d+\b/.test(sample)) return 'US-Federal';
  if (/\b9th\s+cir|\bf\.?\d+d?\s+\d+\b.*9th/.test(sample)) return 'US-9th';
  if (/\b\dth\s+cir(?:cuit)?\b/.test(sample)) {
    const m = sample.match(/\b(\d+)(?:st|nd|rd|th)\s+cir/);
    return m ? `US-${m[1]}th` : 'US-Federal';
  }
  if (/\bcal\.?\s*(?:const|civ|pen|gov|fam|lab|bus|corp|prob|ins|fin|ed|health|welf|veh|wat)|cal\.?\s*app\.?/.test(sample)) return 'CA';
  if (/\bn\.?y\.?\s*\d|\bnew\s+york\s+state\b/.test(sample)) return 'NY';
  if (/\btex\.?\s*\d|\btexas\s+supreme/.test(sample)) return 'TX';
  return 'unknown';
}

/**
 * Authority tier mapping (1=primary binding, 2=primary persuasive, 3=secondary, 4=other).
 * Aligned with HyperRAG TrustMeta. Heuristic by source pattern.
 */
function inferAuthorityTier(text: string, citations: string[], jurisdiction: string): 1 | 2 | 3 | 4 {
  const sample = `${text.slice(0, 1500)} ${citations.join(' ')}`.toLowerCase();
  // Tier 1: binding primary authority — Supreme Court, controlling circuit, state high court, statutes/constitution
  if (jurisdiction === 'US-Federal' && /\bu\.?s\.?\s*supreme|\bsupreme\s*court\s*of\s*the\s*u/.test(sample)) return 1;
  if (/\bconst(?:itution)?\s*art|cal\.?\s*const|u\.?s\.?\s*const/.test(sample)) return 1;
  if (/\bu\.?s\.?c\.?\s*§|cal\.?\s*(?:civ|pen|gov)\.?\s*code\s*§/.test(sample)) return 1;
  // Tier 2: primary persuasive — federal circuit, state appellate, sister-jurisdiction high court
  if (/\bcir(?:cuit)?\b|\bcal\.?\s*app/.test(sample)) return 2;
  // Tier 3: secondary authority — restatements, treatises, law reviews
  if (/\brestatement|\btreatise|\blaw\s*review|\bjournal/.test(sample)) return 3;
  // Default to tier 4 for unclassified material
  return 4;
}

/**
 * Classify the dominant legal section in a chunk via cue-phrase scoring.
 * Returns the section with the highest weighted score plus a confidence in [0..1].
 *
 * Scoring rules:
 *  - Multi-word cue match: +2.0
 *  - Single-word cue match: +1.0
 *  - Heading text matches a known section keyword: +1.5
 *  - High citation density (≥4 citations in <800 chars): forces 'citation_block'
 *  - All zeros → 'unknown' with confidence 0.4
 */
export function classifyLegalSection(
  text: string,
  heading: string,
  citationCount: number
): { section: LegalSection; confidence: number } {
  // Citation-block override: fires only when the text is *predominantly* citations,
  // not when prose merely contains a few. Heuristic: short passage AND high citation
  // density (≥1 citation per 60 chars), e.g. a bare "See X; Y; Z." footnote block.
  if (citationCount >= 3 && text.length < 400 && text.length / citationCount < 60) {
    return { section: 'citation_block', confidence: 0.85 };
  }

  const haystack = `${heading.toLowerCase()} \n ${text.toLowerCase()}`;
  const scores = new Map<LegalSection, number>();

  for (const [section, cues] of Object.entries(SECTION_CUES) as [LegalSection, string[]][]) {
    if (cues.length === 0) continue;
    let score = 0;
    for (const cue of cues) {
      if (!haystack.includes(cue)) continue;
      score += cue.includes(' ') ? 2.0 : 1.0;
    }
    // Heading bonus
    if (heading && cues.some((c) => heading.toLowerCase().includes(c))) {
      score += 1.5;
    }
    if (score > 0) scores.set(section, score);
  }

  if (scores.size === 0) {
    return { section: 'unknown', confidence: 0.4 };
  }

  // Pick the highest-scoring section
  let best: LegalSection = 'unknown';
  let bestScore = 0;
  let totalScore = 0;
  for (const [section, score] of scores) {
    totalScore += score;
    if (score > bestScore) {
      bestScore = score;
      best = section;
    }
  }

  // Confidence = winner's share of total score, capped at 0.95 (heuristic ceiling)
  const confidence = Math.min(0.95, 0.4 + 0.6 * (bestScore / Math.max(totalScore, 1)));
  return { section: best, confidence };
}

/**
 * Compute the full Phase-1A metadata bundle for a chunk in one pass.
 * Extracted as a helper so all three chunk producers stay consistent.
 */
function buildLegalMetadata(
  text: string,
  heading: string,
  citations: string[]
): Pick<LegalChunk, 'legal_section' | 'jurisdiction' | 'authority_tier' | 'citation_count' | 'extraction_confidence'> {
  const { section, confidence } = classifyLegalSection(text, heading, citations.length);
  const jurisdiction = inferJurisdiction(text, citations);
  const authority_tier = inferAuthorityTier(text, citations, jurisdiction);
  return {
    legal_section: section,
    jurisdiction,
    authority_tier,
    citation_count: citations.length,
    extraction_confidence: Number(confidence.toFixed(3)),
  };
}

// ── DocTags block-aware chunker ──────────────────────────────────────────

type DoclingBlockInput = {
  type: string;
  text: string;
  page: number;
  bbox?: [number, number, number, number];
};

/**
 * Chunk a document using DocTags blocks from Granite-Docling.
 * - Headings become section boundaries (sectionPath)
 * - Tables are preserved as whole units (never split mid-row)
 * - Block types propagate to chunk metadata (doctagTypes)
 */
function chunkFromDoclingBlocks(
  blocks: DoclingBlockInput[],
  maxTokens: number,
  overlap: number,
  minLen: number
): LegalChunk[] {
  const chunks: LegalChunk[] = [];
  let chunkIndex = 0;
  let charOffset = 0;
  let currentSectionPath: string[] = [];

  // Group consecutive non-heading blocks under the most recent heading
  let pendingBlocks: DoclingBlockInput[] = [];
  let pendingHeading = '';

  function flushPending() {
    if (pendingBlocks.length === 0) return;

    const combinedText = pendingBlocks.map((b) => b.text).join('\n\n');
    if (combinedText.trim().length < minLen) {
      pendingBlocks = [];
      return;
    }

    const doctagTypes = [...new Set(pendingBlocks.map((b) => b.type))];
    const pages = pendingBlocks.map((b) => b.page).filter(Boolean);
    const pageStart = pages.length > 0 ? Math.min(...pages) : undefined;
    const pageEnd = pages.length > 0 ? Math.max(...pages) : undefined;

    const words = combinedText.split(/\s+/).filter(Boolean);

    if (words.length <= maxTokens) {
      const trimmed = combinedText.trim();
      const cits = extractCitations(combinedText);
      chunks.push({
        text: trimmed,
        chunkIndex: chunkIndex++,
        sectionPath: [...currentSectionPath],
        heading: pendingHeading,
        pageStart,
        pageEnd,
        startOffset: charOffset,
        endOffset: charOffset + combinedText.length,
        tokenCount: words.length,
        citations: cits,
        doctagTypes,
        isTable: doctagTypes.length === 1 && doctagTypes[0] === 'table',
        ...buildLegalMetadata(trimmed, pendingHeading, cits),
      });
      charOffset += combinedText.length + 2;
    } else {
      // Split oversized block group with token windowing
      for (let i = 0; i < words.length; i += maxTokens - overlap) {
        const windowWords = words.slice(i, i + maxTokens);
        const chunkText = windowWords.join(' ');
        const chunkCits = extractCitations(chunkText);

        chunks.push({
          text: chunkText,
          chunkIndex: chunkIndex++,
          sectionPath: [...currentSectionPath],
          heading: pendingHeading,
          pageStart,
          pageEnd,
          startOffset: charOffset,
          endOffset: charOffset + chunkText.length,
          tokenCount: windowWords.length,
          citations: chunkCits,
          doctagTypes,
          ...buildLegalMetadata(chunkText, pendingHeading, chunkCits),
        });

        charOffset += windowWords.slice(0, maxTokens - overlap).join(' ').length + 1;
        if (i + maxTokens >= words.length) break;
      }
    }

    pendingBlocks = [];
  }

  for (const block of blocks) {
    if (block.type === 'heading' || block.type.startsWith('section_header')) {
      // Flush what we have before starting a new section
      flushPending();
      pendingHeading = block.text.trim();
      currentSectionPath = buildSectionPath(block.text, currentSectionPath);
      continue;
    }

    // Tables get their own chunk (preserve as whole unit)
    if (block.type === 'table' || block.type === 'otsl') {
      flushPending();
      const tableText = block.text.trim();
      if (tableText.length < minLen) continue;

      const words = tableText.split(/\s+/).filter(Boolean);
      const tblCits = extractCitations(tableText);
      chunks.push({
        text: tableText,
        chunkIndex: chunkIndex++,
        sectionPath: [...currentSectionPath],
        heading: pendingHeading,
        pageStart: block.page || undefined,
        pageEnd: block.page || undefined,
        startOffset: charOffset,
        endOffset: charOffset + tableText.length,
        tokenCount: words.length,
        citations: tblCits,
        doctagTypes: ['table'],
        isTable: true,
        ...buildLegalMetadata(tableText, pendingHeading, tblCits),
      });
      charOffset += tableText.length + 2;
      continue;
    }

    pendingBlocks.push(block);
  }

  // Flush remaining
  flushPending();

  return chunks;
}

/**
 * Build section path from a heading block, checking if it matches
 * known legal heading patterns or just appending.
 */
function buildSectionPath(headingText: string, currentPath: string[]): string[] {
  const trimmed = headingText.trim();
  const heading = detectHeading(trimmed);

  if (heading) {
    // Known legal heading — maintain hierarchy by level
    const newPath = currentPath.filter((p) => {
      const existingHeading = detectHeading(p);
      return existingHeading && existingHeading.level < heading.level;
    });
    return [...newPath, trimmed];
  }

  // Unknown heading — append to current path (max 4 levels deep)
  if (currentPath.length >= 4) {
    return [...currentPath.slice(0, 3), trimmed];
  }
  return [...currentPath, trimmed];
}

// ── Simple fallback chunker (no structure detected) ──────────────────────

function simpleChunk(text: string, maxTokens: number, overlap: number): LegalChunk[] {
	const words = text.split(/\s+/).filter(Boolean);
	if (words.length <= maxTokens) {
		const trimmed = text.trim();
		const citations = extractCitations(text);
		return [{
			text: trimmed,
			chunkIndex: 0,
			sectionPath: [],
			heading: '',
			startOffset: 0,
			endOffset: text.length,
			tokenCount: words.length,
			citations,
			...buildLegalMetadata(trimmed, '', citations),
		}];
	}

	const chunks: LegalChunk[] = [];
	let chunkIdx = 0;
	let charOffset = 0;

	for (let i = 0; i < words.length; i += maxTokens - overlap) {
		const windowWords = words.slice(i, i + maxTokens);
		const chunkText = windowWords.join(' ');
		const chunkCitations = extractCitations(chunkText);

		chunks.push({
			text: chunkText,
			chunkIndex: chunkIdx,
			sectionPath: [],
			heading: '',
			startOffset: charOffset,
			endOffset: charOffset + chunkText.length,
			tokenCount: windowWords.length,
			citations: chunkCitations,
			...buildLegalMetadata(chunkText, '', chunkCitations),
		});

		charOffset += windowWords.slice(0, maxTokens - overlap).join(' ').length + 1;
		chunkIdx++;

		if (i + maxTokens >= words.length) break;
	}

	return chunks;
}