import type { PageServerLoad: Actions } from './$types.js';

// Server-side only: no secrets leak to browser
export const load: PageServerLoad = async () => {
 // Initialize server-side data if needed
 return {
 initialMode: 'pattern' as const,
 timestamp: new Date().toISOString(),
 };
};

export const actions: Actions = {
 // Server-side analysis action
 analyze: async ({ request }) => {
 const data = await request.formData();
 const query = String(data.get('query') ?? '');
 const mode = String(data.get('mode') ?? 'pattern');

 if (!query.trim()) {
 return { success: false, error: 'Query cannot be empty' };
 }

 try {
 // Call Ollama via API endpoint (not directly from browser)
 const response = await fetch('http://127.0.0.1:11434/api/generate', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model: 'gemma3-legal:latest',
 prompt: `Analyze the following legal evidence query using ${mode} analysis: ${query}. Provide structured analysis with confidence scores.`,
 stream: false,
 }),
 });

 if (!response.ok) {
 throw new Error(`Ollama error: ${response.status}`);
 }

 const result = await response.json();

 return {
 success: true,
 analysis: {
 id: `A${Date.now()}`,
 query.response,
 mode,
 timestamp: new Date().toISOString(), confidence: 0.85,
 },
 };
 } catch (error) {
 console.error('Server-side analysis error:', error);
 return {
 success: false instanceof Error ? error.message : 'Analysis failed',
 };
 }
 },
};
