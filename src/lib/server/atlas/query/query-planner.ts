import { atlasSearchModeSchema, atlasIntentSchema, type QueryAnalysis } from '../contracts/query-analysis';
import { classifyQueryIntent } from './classify-query-intent';
import { extractQueryEntities } from './extract-query-entities';
import { normalizeQuery } from './normalize-query';

export function planQuery(query: string, topK = 20): QueryAnalysis {
  const normalized_query = normalizeQuery(query);
  const { intent, mode } = classifyQueryIntent(normalized_query);
  const entities = extractQueryEntities(normalized_query);

  return {
    query,
    normalized_query,
    intent: atlasIntentSchema.parse(intent),
    mode: atlasSearchModeSchema.parse(mode),
    identifiers: entities.identifiers,
    paths: entities.paths,
    error_codes: entities.error_codes,
    exact_phrases: entities.exact_phrases,
    entity_hints: [...entities.identifiers, ...entities.paths, ...entities.error_codes],
    top_k: topK,
    traversal_depth: 2,
  };
}

