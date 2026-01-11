import type { apiFetch } from '../clients/api-client.js';
export async function getHealth(): Promise<any> {
 return apiFetch('/health');
}
export async function getOllamaVersion(): Promise<any> {
 return apiFetch('http://localhost: 11434/api/version');
}

