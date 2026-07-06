/**
 * Shared lexical / semantic tuple extractor.
 *
 * This is intentionally conservative:
 * - structural extraction comes from AST lanes
 * - lexical extraction comes from regex / token heuristics
 * - ontology/topology labels are derived from stable packet fields
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'can', 'that', 'this', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
  'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'some', 'any',
]);

const NOUN_SUFFIXES = ['tion', 'sion', 'ment', 'ness', 'ity', 'ism', 'ship', 'ence', 'ance', 'ure', 'graph', 'node', 'cache', 'queue'];
const VERB_SUFFIXES = ['ize', 'ise', 'ify', 'ate', 'ing', 'ed', 'load', 'write', 'read', 'sync', 'train', 'rank', 'search', 'route'];
const ADJ_SUFFIXES = ['al', 'ic', 'ive', 'ous', 'ary', 'ful', 'less', 'able', 'ible', 'ish', 'ary', 'ant', 'ent'];

export function normalizeText(value) {
  return String(value ?? '').trim();
}

export function tokenizeWords(text) {
  const normalized = normalizeText(text).toLowerCase();
  return normalized
    .replace(/[^\w\s_-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

export function extractWordClasses(words) {
  const nouns = [];
  const verbs = [];
  const adjectives = [];

  for (const word of words) {
    if (NOUN_SUFFIXES.some((suffix) => word.endsWith(suffix))) nouns.push(word);
    if (VERB_SUFFIXES.some((suffix) => word.endsWith(suffix))) verbs.push(word);
    if (ADJ_SUFFIXES.some((suffix) => word.endsWith(suffix))) adjectives.push(word);
  }

  return {
    nouns: [...new Set(nouns)].slice(0, 20),
    verbs: [...new Set(verbs)].slice(0, 20),
    adjectives: [...new Set(adjectives)].slice(0, 20),
  };
}

export function extractLexicalTuples(text) {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) {
    return { keywords: [], ngrams: [], trigrams: [], engrams: [], nouns: [], verbs: [], adjectives: [] };
  }

  const words = tokenizeWords(normalized);
  const classes = extractWordClasses(words);

  const keywords = [...new Set(words.slice(0, 20))];

  const ngrams = [];
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i <= words.length - n; i++) {
      const gram = words.slice(i, i + n).join('_');
      if (gram.length > 3) ngrams.push(gram);
    }
  }

  const cleanText = normalized.replace(/\s+/g, '_');
  const trigrams = [];
  for (let i = 0; i < cleanText.length - 2; i++) {
    trigrams.push(cleanText.substring(i, i + 3));
  }

  const entityMatches = [
    ...(normalized.match(/[a-z]+[A-Z][a-zA-Z]*/g) || []),
    ...(normalized.match(/[a-z_]+\/[a-z_\/]+/g) || []),
    ...(normalized.match(/[A-Z][a-z]+/g) || []),
    ...(normalized.match(/_[a-z_]+/g) || []),
  ];

  return {
    keywords,
    ngrams: [...new Set(ngrams)].slice(0, 30),
    trigrams: [...new Set(trigrams)].slice(0, 30),
    engrams: [...new Set(entityMatches.filter((value) => value.length > 2))].slice(0, 15),
    nouns: classes.nouns,
    verbs: classes.verbs,
    adjectives: classes.adjectives,
  };
}

export function extractOntologyTuple(packet = {}) {
  const featureId = normalizeText(packet.feature_id);
  const featureLabel = normalizeText(packet.feature_label);
  const titleLabel = normalizeText(packet.title_label || packet.summary || featureLabel || featureId);
  const titleId = normalizeText(packet.title_id);
  const domainClass = normalizeText(packet.domain_class || packet.domain || packet.metadata?.domain_class);
  const topologyLabel = normalizeText(
    packet.topology_label ||
    (packet.community_id != null ? `community:${packet.community_id}` : '') ||
    (packet.som_row != null && packet.som_col != null ? `som:${packet.som_row}:${packet.som_col}` : '')
  );

  return {
    feature_id: featureId || null,
    feature_label: featureLabel || null,
    title_id: titleId || null,
    title_label: titleLabel || null,
    domain_class: domainClass || null,
    ontology_label: normalizeText(packet.ontology_label || null) || null,
    topology_label: topologyLabel || null,
  };
}
