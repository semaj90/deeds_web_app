import type { apiFetch } from '../clients/api-client.js';
export async function getMetricsText(): Promise<string> {
    // TODO: ACE: Async function without await (check if async is needed)
 return apiFetch('http://localhost:8080/metrics');
}


