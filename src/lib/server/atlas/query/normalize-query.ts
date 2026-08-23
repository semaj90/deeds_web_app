export function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

