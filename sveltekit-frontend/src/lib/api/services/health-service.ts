import type { apiFetch } from '../clients/api-client.js';
export async function getHealth(): Promise<any> {
    // TODO: ACE: Async function without await (check if async is needed)
 return apiFetch('/health');
}
export async function getOllamaVersion(): Promise<any> {
    // TODO: ACE: Async function without await (check if async is needed)
 return apiFetch('http://localhost:11434/api/version');
}


