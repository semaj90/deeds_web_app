import crypto from 'node:crypto';

const STOP_WORDS = new Set('a an and are as at be been being by can could did do does for from had has have how i if in into is it its may might more most no not of on or our out should so than that the their them then there these they this to was we were what when where which who will with would you your'.split(' '));
const sha256 = value => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

function removeFencedCode(text) {
  return text.replace(/(^|\n)[ \t]*(```|~~~)[^\n]*\n[\s\S]*?\n[ \t]*\2[^\n]*(?=\n|$)/g, '$1 ');
}

function identifierTerms(text) {
  const found = new Map();
  const expression = /\$[\p{L}_][\p{L}\p{N}_$]*(?:\/[\p{L}_][\p{L}\p{N}_$-]*)*|[\p{L}_$][\p{L}\p{N}_$]*(?:(?:\.|\/)[\p{L}_$][\p{L}\p{N}_$]*)+/gu;
  for (const match of text.matchAll(expression)) {
    const literal = match[0];
    found.set(literal, (found.get(literal) ?? 0) + 1);
    const split = literal.replace(/^\$/, '').split(/[./_$-]+/).flatMap(part => part.replace(/([a-z\d])([A-Z])/g, '$1 $2').split(/\s+/)).filter(Boolean);
    for (const part of split) found.set(part.toLowerCase(), (found.get(part.toLowerCase()) ?? 0) + 1);
  }
  return found;
}

function proseTerms(text) {
  const prose = removeFencedCode(text).replace(/`[^`]*`/g, ' ').replace(/!?(\[[^\]]*\])\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ').replace(/[#>*_~|]/g, ' ');
  return prose.toLowerCase().match(/[\p{L}][\p{L}\p{N}_-]*/gu)?.filter(term => term.length > 1 && !STOP_WORDS.has(term)) ?? [];
}

function ngramCounts(tokens, maxN) {
  const counts = new Map();
  for (let start = 0; start < tokens.length; start += 1) {
    for (let size = 1; size <= maxN && start + size <= tokens.length; size += 1) {
      const term = tokens.slice(start, start + size).join(' ');
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  return counts;
}

function rankDocuments(documents, field, topK) {
  const documentCount = documents.length;
  const documentFrequency = new Map();
  for (const document of documents) for (const term of document[field].keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  return documents.map(document => ({
    id: document.id,
    topTerms: [...document[field]].map(([term, termFrequency]) => ({
      term,
      termFrequency,
      documentFrequency: documentFrequency.get(term),
      score: Number((Math.log1p(termFrequency) * Math.log(1 + (documentCount + 1) / (documentFrequency.get(term) + 1))).toFixed(8)),
    })).sort((a, b) => b.score - a.score || a.term.localeCompare(b.term)).slice(0, topK),
  }));
}

export function buildSveltekitDocsTermsV1({ rawFiles, hierarchy, topK = 30 }) {
  if (!Number.isInteger(topK) || topK < 1 || topK > 500) throw new Error('SVELTEKIT_TERMS_TOP_K_INVALID');
  const hierarchyByPath = new Map(hierarchy.pages.map(page => [page.rawPath.replaceAll('\\', '/'), page]));
  const documents = rawFiles.map(file => {
    const path = file.path.replaceAll('\\', '/');
    const page = hierarchyByPath.get(path);
    const prose = proseTerms(file.text);
    const terms = new Map(ngramCounts(prose, 3));
    const identifiers = identifierTerms(file.text);
    for (const [term, count] of identifiers) terms.set(`id:${term}`, count);
    return { id: page?.page ?? path, section: page?.section ?? null, path, terms, identifiers, proseTokenCount: prose.length };
  });
  const sections = [...new Set(documents.map(document => document.section).filter(Boolean))].sort();
  const sectionRankings = sections.map(section => ({
    section,
    ...{ pages: rankDocuments(documents.filter(document => document.section === section).map(document => ({ id: document.id, terms: document.terms })), 'terms', topK) },
  }));
  const identifierRankings = documents.map(document => ({
    id: document.id,
    identifiers: [...document.identifiers].map(([term, count]) => ({ term, count })).sort((a, b) => b.count - a.count || a.term.localeCompare(b.term)).slice(0, topK),
  }));
  const rankedPages = rankDocuments(documents.map(document => ({ id: document.id, terms: document.terms })), 'terms', topK);
  const corpusTerms = new Map();
  for (const document of documents) for (const [term, count] of document.terms) corpusTerms.set(term, (corpusTerms.get(term) ?? 0) + count);
  const inputDigest = sha256(Buffer.from(JSON.stringify(documents.map(({ id, path, proseTokenCount, terms }) => ({
    id, path, proseTokenCount, terms: [...terms].sort(([a], [b]) => a.localeCompare(b)),
  })).sort((a, b) => a.id.localeCompare(b.id))), 'utf8'));
  return {
    schema: 'atlas.sveltekit-docs-terms.v1',
    status: hierarchy.status === 'HIERARCHY_MAPPED_WITH_COHORT_LIMITS' && documents.every(document => document.section) ? 'TERMS_COMPLETE_FOR_PINNED_COHORT' : 'TERMS_PARTIAL',
    formula: 'score = ln(1 + tf) * ln(1 + (N + 1) / (df + 1)); documents are pages; ties sort by term ascending',
    ngramRange: [1, 3],
    identifierPolicy: 'Preserve full identifier as id:<literal>; emit lowercase split parts separately; fenced-code prose excluded.',
    counts: { pages: documents.length, proseTokens: documents.reduce((sum, document) => sum + document.proseTokenCount, 0), uniqueCorpusTerms: corpusTerms.size, uniqueIdentifiers: new Set(documents.flatMap(document => [...document.identifiers.keys()])).size },
    topTermsPerPage: rankedPages,
    topTermsPerSection: sectionRankings,
    topTermsCorpus: [...corpusTerms].map(([term, count]) => ({ term, termFrequency: count, documentFrequency: documents.filter(document => document.terms.has(term)).length }))
      .map(term => ({ ...term, score: Number((Math.log1p(term.termFrequency) * Math.log(1 + (documents.length + 1) / (term.documentFrequency + 1))).toFixed(8)) }))
      .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term)).slice(0, topK),
    identifiersPerPage: identifierRankings,
    inputChecksum: inputDigest,
    canonicalAuthority: false,
    datastoreWritesAttempted: 0,
    datastoreWritesCommitted: 0,
  };
}
