/**
 * Backfill legal_definitions from existing legal_chunks.
 *
 * Two extraction strategies:
 * 1. Glossary-term matching: find chunks containing known legal_glossary terms
 * 2. Pattern-based extraction: find definitional language ("means", "shall include", etc.)
 *
 * Handles PDF text quirks: double spaces, smart quotes, line breaks mid-word.
 */
import postgres from 'postgres';
import crypto from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const sql = postgres(DATABASE_URL, { max: 3 });

/** Normalize text for matching: collapse whitespace, strip smart quotes */
function normalize(text) {
  return text
    .replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"') // smart quotes → ASCII
    .replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'")
    .replace(/\s+/g, ' ')                              // collapse all whitespace
    .trim();
}

/** Build a regex pattern from a term that tolerates extra whitespace */
function flexTermRegex(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Allow 1+ whitespace between each word
  const flexed = escaped.replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${flexed}\\b`, 'i');
}

// ── Definitional language patterns (ASCII quotes, whitespace-tolerant) ──────
const DEFINITION_PATTERNS = [
  // "X" means / shall mean Y
  /"([^"]{3,60})"\s+(?:means|shall\s+mean|shall\s+include)\s+(.{20,400}?)(?:\.|;|$)/gi,
  // As used in this section/article, "X" means Y
  /as\s+used\s+in\s+this\s+(?:section|article|chapter|part|subdivision)[,:]?\s*"([^"]{3,60})"\s+(?:means|refers\s+to|includes|has\s+the\s+meaning)\s+(.{20,400}?)(?:\.|;|$)/gi,
  // For purposes of this section, "X" means Y
  /for\s+(?:purposes|the\s+purpose)\s+of\s+this\s+(?:section|article|chapter|part|subdivision)[,:]?\s*"([^"]{3,60})"\s+(?:means|refers\s+to|includes|has\s+the\s+meaning)\s+(.{20,400}?)(?:\.|;|$)/gi,
  // "X" has the meaning set forth in / as defined in
  /"([^"]{3,60})"\s+has\s+the\s+meaning\s+(?:set\s+forth\s+in|as\s+defined\s+in|given\s+in)\s+(.{10,300}?)(?:\.|;|$)/gi,
  // The term "X" means/includes Y
  /the\s+term\s+"([^"]{3,60})"\s+(?:means|includes|refers\s+to|shall\s+mean)\s+(.{20,400}?)(?:\.|;|$)/gi,
  // "X" is defined as Y
  /"([^"]{3,60})"\s+is\s+defined\s+as\s+(.{20,400}?)(?:\.|;|$)/gi,
  // X shall be construed to mean Y (no quotes)
  /(\b[A-Z][a-z]+(?:\s+[a-z]+){0,3})\s+shall\s+be\s+construed\s+to\s+mean\s+(.{20,300}?)(?:\.|;|$)/gi,
];

async function main() {
  console.log('=== Legal Definitions Backfill ===\n');

  const existing = await sql`SELECT count(*) AS c FROM legal_definitions`;
  console.log(`Current legal_definitions: ${existing[0].c} rows`);

  const seenKeys = new Set();
  let glossaryInserts = 0;
  let patternInserts = 0;

  // ── Strategy 1: Glossary term matching ────────────────────────────────
  console.log('\n--- Strategy 1: Glossary term matching ---');
  const glossary = await sql`SELECT id, term FROM legal_glossary ORDER BY length(term) DESC`;
  console.log(`Glossary terms: ${glossary.length}`);

  for (const gt of glossary) {
    const term = gt.term;
    if (term.length < 4) continue;

    const matchingChunks = await sql`
      SELECT c.id AS chunk_id, c.legal_node_id, c.chunk_text
      FROM legal_chunks c
      WHERE c.chunk_text ILIKE ${'%' + term + '%'}
      LIMIT 10
    `;

    for (const chunk of matchingChunks) {
      const normalizedText = normalize(chunk.chunk_text);
      const termRegex = flexTermRegex(term);
      const match = termRegex.exec(normalizedText);
      if (!match) continue;

      const key = `glossary:${term.toLowerCase()}:${chunk.legal_node_id}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      // Extract context around the match
      const matchIdx = match.index;
      const start = Math.max(0, matchIdx - 60);
      const end = Math.min(normalizedText.length, matchIdx + term.length + 200);
      let excerpt = normalizedText.substring(start, end).trim();
      if (start > 0) excerpt = '...' + excerpt;
      if (end < normalizedText.length) excerpt += '...';

      const defId = crypto.randomUUID();
      try {
        await sql`
          INSERT INTO legal_definitions (id, term, normalized_term, defined_in_node_id, definition_text, confidence)
          VALUES (${defId}, ${term}, ${term.toLowerCase()}, ${chunk.legal_node_id}, ${excerpt}, ${0.7})
          ON CONFLICT DO NOTHING
        `;
        glossaryInserts++;
      } catch { /* skip */ }
    }
  }
  console.log(`Glossary matches inserted: ${glossaryInserts}`);

  // ── Strategy 2: Pattern-based extraction ──────────────────────────────
  console.log('\n--- Strategy 2: Pattern-based extraction ---');

  const defChunks = await sql`
    SELECT c.id, c.legal_node_id, c.chunk_text
    FROM legal_chunks c
    WHERE c.chunk_text ILIKE '%shall mean%'
       OR c.chunk_text ILIKE '%means and includes%'
       OR c.chunk_text ILIKE '%as used in this%'
       OR c.chunk_text ILIKE '%is defined as%'
       OR c.chunk_text ILIKE '%shall include%'
       OR c.chunk_text ILIKE '%for purposes of this%'
       OR c.chunk_text ILIKE '%the term%'
       OR c.chunk_text ILIKE '%has the meaning%'
       OR c.chunk_text ILIKE '%shall be construed%'
  `;
  console.log(`Chunks with definitional language: ${defChunks.length}`);

  for (const chunk of defChunks) {
    const normalizedText = normalize(chunk.chunk_text);

    for (const pattern of DEFINITION_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(normalizedText)) !== null) {
        const term = match[1].trim();
        const definitionText = match[2].trim();

        if (term.length < 3 || term.length > 80) continue;
        if (definitionText.length < 10) continue;
        // Skip if term is just numbers or punctuation
        if (/^\d+$/.test(term)) continue;

        const key = `pattern:${term.toLowerCase()}:${chunk.legal_node_id}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        const defId = crypto.randomUUID();
        const fullDef = `${term}: ${definitionText}`;
        try {
          await sql`
            INSERT INTO legal_definitions (id, term, normalized_term, defined_in_node_id, definition_text, confidence)
            VALUES (${defId}, ${term}, ${term.toLowerCase()}, ${chunk.legal_node_id}, ${fullDef}, ${0.9})
            ON CONFLICT DO NOTHING
          `;
          patternInserts++;
          if (patternInserts <= 5) {
            console.log(`  Found: "${term}" → ${definitionText.slice(0, 80)}...`);
          }
        } catch { /* skip */ }
      }
    }
  }
  console.log(`Pattern-extracted definitions: ${patternInserts}`);

  // ── Summary ──────────────────────────────────────────────────────────
  const finalCount = await sql`SELECT count(*) AS c FROM legal_definitions`;
  console.log(`\n=== Done ===`);
  console.log(`Total legal_definitions: ${finalCount[0].c} (was ${existing[0].c})`);

  // Show sample
  const samples = await sql`
    SELECT term, substring(definition_text, 1, 100) AS def_preview, confidence
    FROM legal_definitions
    ORDER BY confidence DESC, term
    LIMIT 10
  `;
  if (samples.length > 0) {
    console.log('\nSample definitions:');
    for (const s of samples) {
      console.log(`  [${s.confidence}] ${s.term}: ${s.def_preview}...`);
    }
  }

  await sql.end();
}

main().catch(err => { console.error(err); process.exit(1); });
