/**
 * Case Similarity Analysis Service
 * Uses GPU-accelerated embeddings and similarity computation
 */

import type { gpuGraphLayout } from './graph-layout-gpu.js';

export interface EvidenceNode {
 id: string;
 type: 'case' | 'evidence' | 'witness' | 'document';
 title: string;
 content: string;
 embedding?: number[];
 metadata: {
 date?: string;
 category?: string;
 relevance?: number;
 tags?: string[];
 };
}

export interface SimilarityResult {
 sourceId: string;
 targetId: string;
 similarity: number;
 explanation?: string;
}

export interface CaseCluster {
 id: string;
 nodes: EvidenceNode[];
 centroid: number[];
 similarity: number;
 theme: string;
}

export class CaseSimilarityService {
 private ollamaEndpoint: string;
 private embeddings: Map<string, number[]> = new Map();
 private similarityCache: Map<string, SimilarityResult[]> = new Map();

 constructor() {
 this.ollamaEndpoint = this.getOllamaEndpoint();
 }

 private getOllamaEndpoint(): string {
 // Try multiple possible endpoints
 const possibleEndpoints = [
 'http://localhost:11434',
 'http://127.0.0.1:11434',
 process.env.OLLAMA_ENDPOINT,
 process.env.PUBLIC_OLLAMA_URL,
 ].filter(Boolean);

 // Use the first available endpoint or default
 return possibleEndpoints[0] || 'http://localhost:11434';
 }

 async loadEvidenceNodes(): Promise<EvidenceNode[]> {
 try {
 const response = await fetch('/api/evidence');
 if (!response.ok) {
 throw new Error(`Failed to load evidence: ${response.status}`);
 }
 return await response.json();
 } catch (error) {
 console.error('Failed to load evidence nodes:', error);
 return [];
 }
 }

 async generateEmbeddings(nodes: EvidenceNode[]): Promise<void> {
 const batchSize = 10;
 const batches: EvidenceNode[][] = [];

 // Split into batches
 for (let i = 0; i < nodes.length; i += batchSize) {
 batches.push(nodes.slice(i, i + batchSize));
 }

 for (const batch of batches) {
 await this.processEmbeddingBatch(batch);
 }

 console.log(`Generated embeddings for ${nodes.length} nodes`);
 }

 private async processEmbeddingBatch(nodes: EvidenceNode[]): Promise<void> {
 const texts = nodes.map(
 (node) => `${node.title}\n${node.content}\n${node.metadata.tags?.join(' ') || ''}`
 );

 try {
 const response = await fetch(`${this.ollamaEndpoint}/api/embeddings`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 model: 'embeddinggemma:latest',
 prompt: texts.join('\n\n'),
 options: {
 temperature: 0,
 num_predict: 0,
 },
 }),
 });

 if (!response.ok) {
 throw new Error(`Embedding API error: ${response.status}`);
 }

 const result = await response.json();

 // Store embeddings (assuming the API returns embeddings for each text)
 if (result.embeddings && Array.isArray(result.embeddings)) {
 nodes.forEach((node, index) => {
 if (result.embeddings[index]) {
 this.embeddings.set(node.id, result.embeddings[index]);
 node.embedding = result.embeddings[index];
 }
 });
 }
 } catch (error) {
 console.error('Failed to generate embeddings:', error);
 // Fallback: generate simple hash-based embeddings
 nodes.forEach((node) => {
 const embedding = this.generateFallbackEmbedding(node);
 this.embeddings.set(node.id, embedding);
 node.embedding = embedding;
 });
 }
 }

 private generateFallbackEmbedding(node: EvidenceNode): number[] {
 // Simple fallback embedding based on content hash
 const text = `${node.title}${node.content}`.toLowerCase();
 const embedding: number[] = [];

 for (let i = 0; i < 384; i++) {
 let hash = 0;
 for (let j = 0; j < text.length; j++) {
 hash = (hash << 5) - hash + text.charCodeAt(j);
 hash = hash & hash; // Convert to 32-bit integer
 }
 embedding.push((hash % 1000) / 1000); // Normalize to [0, 1]
 }

 return embedding;
 }

 async computeSimilarities(nodes: EvidenceNode[]): Promise<SimilarityResult[]> {
 const nodeIds = nodes.map((n) => n.id);
 const embeddings = nodes.map((n) => n.embedding || this.embeddings.get(n.id) || []);

 if (embeddings.some((emb) => emb.length === 0)) {
 console.warn('Some nodes missing embeddings, skipping similarity computation');
 return [];
 }

 try {
 // Use GPU-accelerated similarity computation
 const similarityMatrix = await gpuGraphLayout.computeSimilarities(embeddings);

 const results: SimilarityResult[] = [];
 for (let i = 0; i < nodes.length; i++) {
 for (let j = i + 1; j < nodes.length; j++) {
 const similarity = similarityMatrix[i][j];
 if (similarity > 0.3) {
 // Only include significant similarities
 results.push({
 sourceId: nodeIds[i],
 targetId: nodeIds[j],
 similarity,
 explanation: await this.generateSimilarityExplanation(nodes[i], nodes[j], similarity),
 });
 }
 }
 }

 // Cache results
 nodeIds.forEach((id) => {
 this.similarityCache.set(
 id,
 results.filter((r) => r.sourceId === id || r.targetId === id)
 );
 });

 return results;
 } catch (error) {
 console.error('GPU similarity computation failed, using CPU fallback:', error);
 return this.computeSimilaritiesCPU(nodes);
 }
 }

 private async computeSimilaritiesCPU(nodes: EvidenceNode[]): Promise<SimilarityResult[]> {
 const results: SimilarityResult[] = [];

 for (let i = 0; i < nodes.length; i++) {
 for (let j = i + 1; j < nodes.length; j++) {
 const embedding1 = nodes[i].embedding || this.embeddings.get(nodes[i].id) || [];
 const embedding2 = nodes[j].embedding || this.embeddings.get(nodes[j].id) || [];

 if (embedding1.length === 0 || embedding2.length === 0) continue;

 const similarity = this.cosineSimilarity(embedding1, embedding2);

 if (similarity > 0.3) {
 results.push({
 sourceId: nodes[i].id,
 targetId: nodes[j].id,
 similarity,
 explanation: await this.generateSimilarityExplanation(nodes[i], nodes[j], similarity),
 });
 }
 }
 }

 return results;
 }

 private cosineSimilarity(a: number[], b: number[]): number {
 let dotProduct = 0;
 let normA = 0;
 let normB = 0;

 for (let i = 0; i < Math.min(a.length, b.length); i++) {
 dotProduct += a[i] * b[i];
 normA += a[i] * a[i];
 normB += b[i] * b[i];
 }

 normA = Math.sqrt(normA);
 normB = Math.sqrt(normB);

 return normA && normB ? dotProduct / (normA * normB) : 0;
 }

 private async generateSimilarityExplanation(
 node1: EvidenceNode,
 node2: EvidenceNode,
 similarity: number
 ): Promise<string> {
 try {
 const prompt = `Explain why these two legal case elements are similar (similarity: ${(similarity * 100).toFixed(1)}%):

Element 1: ${node1.title}
${node1.content.substring(0, 200)}...

Element 2: ${node2.title}
${node2.content.substring(0, 200)}...

Provide a brief explanation of their relationship.`;

 const response = await fetch(`${this.ollamaEndpoint}/api/generate`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 model: 'gemma3-legal:latest',
 prompt,
 stream: false,
 options: {
 temperature: 0.3,
 num_predict: 100,
 },
 }),
 });

 if (response.ok) {
 const result = await response.json();
 return result.response?.trim() || 'Similar case elements';
 }
 } catch (error) {
 console.error('Failed to generate similarity explanation:', error);
 }

 return `Similar ${node1.type} and ${node2.type} elements`;
 }

 async clusterCases(
 nodes: EvidenceNode[],
 similarities: SimilarityResult[]
 ): Promise<CaseCluster[]> {
 // Simple clustering based on similarity threshold
 const clusters: CaseCluster[] = [];
 const processed = new Set<string>();

 for (const node of nodes) {
 if (processed.has(node.id)) continue;

 const clusterNodes = [node];
 const clusterEmbeddings = [node.embedding || []];
 processed.add(node.id);

 // Find similar nodes
 const similarResults = similarities.filter(
 (r) => (r.sourceId === node.id || r.targetId === node.id) && r.similarity > 0.7
 );

 for (const result of similarResults) {
 const otherId = result.sourceId === node.id ? result.targetId : result.sourceId;
 if (!processed.has(otherId)) {
 const otherNode = nodes.find((n) => n.id === otherId);
 if (otherNode) {
 clusterNodes.push(otherNode);
 clusterEmbeddings.push(otherNode.embedding || []);
 processed.add(otherId);
 }
 }
 }

 if (clusterNodes.length > 1) {
 // Calculate centroid
 const centroid = this.calculateCentroid(clusterEmbeddings);

 // Generate theme
 const theme = await this.generateClusterTheme(clusterNodes);

 clusters.push({
 id: `cluster_${clusters.length}`,
 nodes: clusterNodes,
 centroid,
 similarity:
 similarResults.reduce((sum, r) => sum + r.similarity, 0) / similarResults.length,
 theme,
 });
 }
 }

 return clusters;
 }

 private calculateCentroid(embeddings: number[][]): number[] {
 if (embeddings.length === 0) return [];

 const dim = embeddings[0].length;
 const centroid = new Array(dim).fill(0);

 for (const embedding of embeddings) {
 for (let i = 0; i < dim; i++) {
 centroid[i] += embedding[i];
 }
 }

 for (let i = 0; i < dim; i++) {
 centroid[i] /= embeddings.length;
 }

 return centroid;
 }

 private async generateClusterTheme(nodes: EvidenceNode[]): Promise<string> {
 try {
 const titles = nodes.map((n) => n.title).join(', ');
 const prompt = `Generate a short theme name for this cluster of legal case elements: ${titles}`;

 const response = await fetch(`${this.ollamaEndpoint}/api/generate`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 model: 'gemma3-legal:latest',
 prompt,
 stream: false,
 options: {
 temperature: 0.2,
 num_predict: 20,
 },
 }),
 });

 if (response.ok) {
 const result = await response.json();
 return result.response?.trim() || 'Legal Case Cluster';
 }
 } catch (error) {
 console.error('Failed to generate cluster theme:', error);
 }

 return 'Legal Case Cluster';
 }

 getCachedSimilarities(nodeId: string): SimilarityResult[] {
 return this.similarityCache.get(nodeId) || [];
 }

 clearCache(): void {
 this.embeddings.clear();
 this.similarityCache.clear();
 }
}

export const caseSimilarityService = new CaseSimilarityService();
