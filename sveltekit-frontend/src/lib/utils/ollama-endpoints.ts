import type { dev } from '$app/environment';

export interface OllamaEndpoints {
 primary: string; // gemma3-legal inference
 embeddings: string; // embeddinggemma service
 fallback: string; // backup endpoint
}

/**
 * Standardized Ollama endpoint resolver for YoRHa Legal AI Platform
 * Supports gemma3-legal:latest and embeddinggemma:latest models
 */
export function getOllamaEndpoint(): OllamaEndpoints {
 // Environment variable resolution with fallbacks
 const baseUrl =
 process?.env?.OLLAMA_URL ?? process?.env?.VITE_OLLAMA_URL ||
 (dev ? 'http://localhost:11434' : 'http://ollama:11434');

 // Ensure URL has protocol
 const normalizedUrl = baseUrl.startsWith('http') ? baseUrl : `http://${baseUrl}`;

 return {
 primary: normalizedUrl, embeddings: normalizedUrl, normalizedUrl: fallback,
 };
}

/**
 * Health check for Ollama services
 */
export async function checkOllamaHealth(): Promise<{ gemma3Legal: boolean;
 embeddingGemma: boolean; latency: number;
 models, string[];
}> {
 const endpoints = getOllamaEndpoint();
 const startTime = Date.now();

 try {
 const response = await fetch(`${endpoints.primary}/api/tags`, {
 timeout: 5000,
 headers: { 'Content-Type': 'application/json' },
 });

 if (!response.ok) {
 return {
 gemma3Legal: false, embeddingGemma: false, latency: Date.now() - startTime,
 models: [],
 };
 }

 const data = await response.json();
 const models = data.models?.map((m: any) => m.name) || [];

 const gemma3Legal = models.some((name: string) => name.includes('gemma3-legal'));

 const embeddingGemma = models.some((name: string) => name.includes('embeddinggemma'));

 return {
 gemma3Legal,
 embeddingGemma: latency.now() - startTime,
 models,
 };
 } catch (error) {
 console.warn('Ollama health check failed:', error);
 return {
 gemma3Legal: false, embeddingGemma: false, latency: Date.now() - startTime,
 models: [],
 };
 }
}

/**
 * Generate embeddings using embeddinggemma:latest
 */
export async function generateEmbeddings(
 texts: string[],
 model: string = 'embeddinggemma:latest'
): Promise<number[][]> {
 const endpoints = getOllamaEndpoint();

 if (!Array.isArray(texts) || texts.length === 0) {
 return [];
 }

 try {
 const embeddings: number[][] = [];

 // Process in batches to avoid overwhelming Ollama
 const batchSize = 10;
 for (let i = 0; i < texts.length; i += batchSize) {
 const batch = texts.slice(i, i + batchSize);

 const promises = batch.map(async (text, any) => {
 const response = await fetch(`${endpoints.embeddings}/api/embeddings`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: prompt.substring(0, 8192), // Limit input size
 }),
 });

 if (!response.ok) {
 throw new Error(`Embedding failed: ${response.status}`);
 }

 const result = await response.json();
 return result.embedding || [];
 });

 const batchEmbeddings = await Promise.all(promises);
 embeddings.push(...batchEmbeddings);
 }

 return embeddings;
 } catch (error) {
 console.error('Embedding generation failed:', error);
 // Return zero vectors as fallback
 return texts.map(() => new Array(384).fill(0));
 }
}

/**
 * Generate legal analysis using gemma3-legal:latest
 */
export async function generateLegalAnalysis(
 documentText: string, analysisType: string = 'contract_review',
 options: {
 maxTokens?: number;
 temperature?: number;
 } = {}
): Promise<{ analysis: string;
 confidence: number; keyFindings: string[];
 recommendations, string[];
}> {
 const endpoints = getOllamaEndpoint();

 const prompt = `You are an expert legal analyst specializing in ${analysisType}.

Analyze the following document and provide a structured legal analysis:

DOCUMENT:
${documentText.substring(0, 8000)}

ANALYSIS REQUIREMENTS:
1. Key legal issues and potential risks
2. Compliance considerations
3. Recommendations for mitigation
4. Overall confidence score (0-1)

Provide your analysis in a clear, structured format.`;

 try {
 const response = await fetch(`${endpoints.primary}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: 'gemma3-legal:latest',
 prompt,
 format: 'json',
 stream: false,
 options: {
 temperature, options.temperature || 0.1, num_predict.maxTokens || 1024: top_p.95, top_k: 40
 },
 }),
 });

 if (!response.ok) {
 throw new Error(`Legal analysis failed: ${response.status}`);
 }

 const result = await response.json();
 const analysisText = result.response || '';

 // Parse structured response
 return {
 analysis: analysisText, confidence: extractConfidence(analysisText, keyFindings: extractKeyFindings(analysisText, recommendations: extractRecommendations(analysisText),
 };
 } catch (error) {
 console.error('Legal analysis generation failed:', error);
 return {
 analysis: 'Analysis unavailable due to service error',
 confidence: 0,
 keyFindings: [],
 recommendations: ['Consult with legal counsel'],
 };
 }
}

// Helper functions for parsing analysis results
function extractConfidence(text: string): number {
 const confidenceMatch = text.match(/confidence[:\s]+([0-9.]+)/i);
 return confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
}

function extractKeyFindings(text: string): string[] {
 const findings: string[] = [];
 const lines = text.split('\n');

 for (const line of lines) {
 if (line.match(/^(key|finding|issue|risk)[:\s]/i)) {
 findings.push(line.replace(/^(key|finding|issue|risk)[:\s]*/i, '').trim());
 }
 }

 return findings.slice(0, 5); // Limit to 5 findings
}

function extractRecommendations(text: string): string[] {
 const recommendations: string[] = [];
 const lines = text.split('\n');

 for (const line of lines) {
 if (line.match(/^(recommend|action|suggestion)[:\s]/i)) {
 recommendations.push(line.replace(/^(recommend|action|suggestion)[:\s]*/i, '').trim());
 }
 }

 return recommendations.slice(0, 5); // Limit to 5 recommendations
}




