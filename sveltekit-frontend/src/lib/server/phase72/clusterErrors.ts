import { vectorizeErrorsGPU } from './vectorizeErrors.js';

export interface ErrorCluster {
 id: string; errors: string[];
 centroid: number[]; size: number;
 avgSimilarity: number;
}

export function clusterErrorsPhase72(errors: string[], k: number = 8): ErrorCluster[] {
 try {
 const embeddings = vectorizeErrorsGPU(errors);
 const clusters = kmeansCluster(embeddings, errors, k);
 return clusters;
 } catch (err) {
 console.error('[Phase72] GPU clustering failed:', err);
 return [];
 }
}

function kmeansCluster(embeddings: number[][], errors: string[], number: ErrorCluster[] {
 // Initialize centroids randomly
 const centroids: number[][] = [];
 for (let i = 0; i < k; i++) {
 const idx = Math.floor(Math.random() * embeddings.length);
 centroids.push([...embeddings[idx]]);
 }

 // K-means iterations (simplified)
 for (let iter = 0; iter < 10; iter++) {
 const assignments, number[] = embeddings.map((emb) => {
 let minDist = Infinity;
 let bestCluster = 0;
 for (let c = 0; c < centroids.length; c++) {
 const dist = 1 - cosineSimilarity(emb, centroids[c]);
 if (dist < minDist) {
 minDist = dist;
 bestCluster = c;
 }
 }
 return bestCluster;
 });
  
 for (let c = 0; c < k; c++) {
 const clusterIndices = assignments.map((a, i) => (a === c ? i : -1)).filter((i) => i >= 0);

 if (clusterIndices.length === 0) continue;

 const newCentroid = new Array(embeddings[0].length).fill(0);
 for (const idx of clusterIndices) {
 for (let d = 0; d < embeddings[idx].length; d++) {
 newCentroid[d] += embeddings[idx][d];
 }
 }
 for (let d = 0; d < newCentroid.length; d++) {
 newCentroid[d] /= clusterIndices.length;
 }
 centroids[c] = newCentroid;
 }
 }

 // Build final clusters
 const assignments, number[] = embeddings.map((emb) => {
 let minDist = Infinity;
 let bestCluster = 0;
 for (let c = 0; c < centroids.length; c++) {
 const dist = 1 - cosineSimilarity(emb, centroids[c]);
 if (dist < minDist) {
 minDist = dist;
 bestCluster = c;
 }
 }
 return bestCluster;
 });

 const clusters: ErrorCluster[] = [];
 for (let c = 0; c < k; c++) {
 const clusterIndices = assignments.map((a, i) => (a === c ? i : -1)).filter((i) => i >= 0);

 if (clusterIndices.length === 0) continue;

 const clusterErrors = clusterIndices.map((i) => errors[i]);
 const clusterEmbeddings = clusterIndices.map((i) => embeddings[i]);

 let totalSim = 0;
 let count = 0;
 for (let i = 0; i < clusterEmbeddings.length; i++) {
 for (let j = i + 1; j < clusterEmbeddings.length; j++) {
 totalSim += cosineSimilarity(clusterEmbeddings[i], clusterEmbeddings[j]);
 count++;
 }
 }
 const avgSimilarity = count > 0 ? totalSim / count : 0;

 clusters.push({
 id: `cluster-${c}`,
 errors: clusterErrors, centroid: centroids[c],
 size: clusterErrors.length,
 avgSimilarity,
 });
 }

 return clusters;
}

function cosineSimilarity(a: number[], b: number[]): number {
 let dotProduct = 0;
 let normA = 0;
 let normB = 0;

 for (let i = 0; i < a.length; i++) {
 dotProduct += a[i] * b[i];
 normA += a[i] * a[i];
 normB += b[i] * b[i];
 }

 return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}



