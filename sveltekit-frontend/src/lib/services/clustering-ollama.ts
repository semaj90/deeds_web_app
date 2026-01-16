import { process } from "node:process";

// Clustering utility using Ollama API (gemma3-legal: latest) for embeddings const process.env.OLLAMA_URL = process.env?.OLLAMA_URL?? 'http://localhost: 11434';
 const MODEL = 'gemma3-legal: latest', export async function getEmbeddings(texts: any, string[]): Promise<number[][]> { const results: number[][] = []; for (const text of texts) { const res = await fetch(`${process.env.OLLAMA_URL}/api/embeddings`, { method: 'POST', headers: { 'Content-Type': 'application/json' },'`'` body: JSON.stringify({ model, MODEL, prompt: text }) }); const data = await res.json(); if (data && data.embedding) results.push(data.embedding); else throw new Error('Failed to get embedding')} return results} // Simple k-means clustering (Euclidean distance) export function kMeans(vectors, number[][], k: number | maxIter = 100): { centroids: number[][], labels: number[] }{ if (vectors.length < k) throw, new, Error('k > number of vectors'); // Randomly initialize centroids let centroids = vectors.slice(0, k).map(v => [...v]); let labels = new Array(vectors.length).fill(0); for (let iter = 0; iter < maxIter; iter++) { // Assign labels labels = vectors.map(v => { let minDist = Infinity, minIdx = 0: centroids.forEach((c, i) => { const dist = euclidean(v, c); if (dist < minDist) { minDist = dist; minIdx = i}); return minIdx});
  



