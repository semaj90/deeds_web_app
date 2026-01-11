import {  env  } from '$env /dynamic/private';

export default {
 async getOptimalModel(): Promise<string> {
 // For now, return a default model; in production, implement logic to select based on availability or performance
 return 'gemma';
 },

 async queryOllama(prompt: string): Promise<string> {
 try {
 const response = await fetch(`${env.OLLAMA_BASE_URL}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: 'gemma', prompt, stream: false }),
 });
 if (!response.ok) {
 throw new Error(`Ollama query failed: ${response.statusText}`);
 }
 const result = await response.json();
 return result.response || '';
 } catch (error) {
 console.error('Ollama query error:', error);
 throw error;
 }
 },
};
