export type QueryEntities = {
  identifiers: string[];
  paths: string[];
  error_codes: string[];
  exact_phrases: string[];
};

export function extractQueryEntities(query: string): QueryEntities {
  const identifiers = Array.from(query.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)).map((m) => m[0]);
  const paths = Array.from(query.matchAll(/(?:[A-Za-z]:)?[\\/][^\s'"`]+/g)).map((m) => m[0]);
  const error_codes = Array.from(query.matchAll(/\b[A-Z]{2,}_[A-Z0-9_]+\b/g)).map((m) => m[0]);
  const exact_phrases = Array.from(query.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
  return { identifiers, paths, error_codes, exact_phrases };
}

