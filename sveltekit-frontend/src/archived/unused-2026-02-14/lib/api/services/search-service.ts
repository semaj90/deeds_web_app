import { apiFetch } from '../clients/api-client.js';
export interface SemanticQuery {
  query: string;
  limit?: number;
}
export async function semanticSearch(q: SemanticQuery): Promise<any> {
    // TODO: ACE: Async function without await (check if async is needed)
  return apiFetch('http://localhost:8080/api/v1/search/semantic', 'POST', {
    body: q,
  });
}

