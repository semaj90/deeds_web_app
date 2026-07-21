/**
 * Local Deep Research Orchestrator
 * Autonomous research pipeline: web search → document extraction → synthesis
 */

import { searchViaSearXNG, fetchAndExtractText, aggregateDocuments, type WebSearchResult, type ExtractedDocument } from './web-search-client';
import { callGemma4Stream } from '../ollama';

export interface LDRResult {
  synthesis: string;
  sources: Array<{ url: string; title: string }>;
  confidence: number;
  durationMs: number;
  stage: 'search' | 'extract' | 'synthesis';
  error?: string;
}

export interface LDRConfig {
  maxWebResults?: number;
  maxDocumentsToFetch?: number;
  maxContextTokens?: number;
  temperature?: number;
  timeout?: number;
}

const DEFAULT_CONFIG: Required<LDRConfig> = {
  maxWebResults: 15,
  maxDocumentsToFetch: 10,
  maxContextTokens: 3000,
  temperature: 0.3,
  timeout: 30000 // 30 seconds total
};

/**
 * Execute full Local Deep Research pipeline
 */
export async function runLocalDeepResearch(
  query: string,
  config: LDRConfig = {}
): Promise<LDRResult> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    // Stage 1: Web Search
    console.log(`[LDR] Starting web search for query: "${query}"`);
    const webResults = await searchViaSearXNG(query, mergedConfig.maxWebResults);

    if (webResults.length === 0) {
      return {
        synthesis: `No web search results found for: "${query}"`,
        sources: [],
        confidence: 0.0,
        durationMs: Date.now() - startTime,
        stage: 'search',
        error: 'No search results'
      };
    }

    console.log(`[LDR] Found ${webResults.length} web results`);

    // Stage 2: Document Extraction (parallel fetch)
    console.log(`[LDR] Extracting content from top ${mergedConfig.maxDocumentsToFetch} results`);
    const extractionPromises = webResults
      .slice(0, mergedConfig.maxDocumentsToFetch)
      .map(r => fetchAndExtractText(r.url));

    const extractedDocs = (await Promise.allSettled(extractionPromises))
      .filter((result) => result.status === 'fulfilled' && result.value !== null)
      .map((result) => (result as PromiseFulfilledResult<ExtractedDocument>).value);

    if (extractedDocs.length === 0) {
      return {
        synthesis: `Found web results but could not extract content for: "${query}"`,
        sources: webResults.slice(0, 3).map(r => ({ url: r.url, title: r.title })),
        confidence: 0.3,
        durationMs: Date.now() - startTime,
        stage: 'extract',
        error: 'Document extraction failed'
      };
    }

    console.log(`[LDR] Successfully extracted ${extractedDocs.length} documents`);

    // Stage 3: Synthesis via Gemma4
    console.log(`[LDR] Calling Gemma4 for synthesis`);
    const contextString = aggregateDocuments(extractedDocs);
    const systemPrompt = buildSystemPrompt(query);
    const userPrompt = buildUserPrompt(query, contextString);

    const synthesisResult = await callGemma4Synthesis(systemPrompt, userPrompt, mergedConfig.temperature);

    const result: LDRResult = {
      synthesis: synthesisResult.text,
      sources: extractedDocs.map(d => ({ url: d.url, title: d.title })),
      confidence: calculateConfidence(extractedDocs, synthesisResult.confidence),
      durationMs: Date.now() - startTime,
      stage: 'synthesis'
    };

    console.log(`[LDR] Pipeline complete in ${result.durationMs}ms, confidence: ${result.confidence.toFixed(2)}`);
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[LDR] Pipeline error:`, errorMsg);

    return {
      synthesis: `Local Deep Research failed: ${errorMsg}`,
      sources: [],
      confidence: 0.0,
      durationMs: Date.now() - startTime,
      stage: 'synthesis',
      error: errorMsg
    };
  }
}

/**
 * Build system prompt for legal domain synthesis
 */
function buildSystemPrompt(query: string): string {
  return `You are a legal research assistant. Your task is to synthesize web search results into a coherent, accurate legal answer.

Guidelines:
- Focus on the most relevant and authoritative sources
- Cite specific legal rules, statutes, and precedents where mentioned
- Flag any contradictions or uncertainties in the sources
- Organize the answer by topic (rules, procedures, exceptions, etc.)
- Keep the answer clear and practical for legal practitioners

Query: ${query}`;
}

/**
 * Build user prompt with aggregated web content
 */
function buildUserPrompt(query: string, context: string): string {
  return `Based on these web search results, please synthesize a comprehensive answer to the following legal question:

Question: ${query}

Web Search Results:
${context}

Please provide a well-structured answer that:
1. Directly addresses the question
2. Cites specific legal authorities and sources
3. Highlights any limitations or exceptions
4. Notes any recent changes or pending legislation if mentioned`;
}

/**
 * Call Gemma4 for synthesis via llama-server
 */
async function callGemma4Synthesis(
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<{ text: string; confidence: number }> {
  const llmUrl = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090/v1';
  const model = process.env.LLAMA_SERVER_MODEL || 'gemma4-legal-iq4xs-direct.gguf';

  try {
    const res = await fetch(`${llmUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature,
        max_tokens: 1024,
        stream: false
      })
    });

    if (!res.ok) {
      throw new Error(`Gemma4 request failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { completion_tokens?: number };
    };

    const text = data.choices?.[0]?.message?.content || '';
    const completionTokens = data.usage?.completion_tokens || 512;

    // Estimate confidence based on response quality
    const confidence = estimateConfidence(text, completionTokens);

    return { text, confidence };
  } catch (err) {
    console.error('[LDR] Gemma4 synthesis error:', err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/**
 * Estimate synthesis confidence based on response characteristics
 */
function estimateConfidence(text: string, completionTokens: number): number {
  let score = 0.7; // Base confidence

  // Penalize very short responses (likely incomplete)
  if (text.length < 200) {
    score -= 0.2;
  }

  // Reward longer, more detailed responses
  if (text.length > 1000) {
    score += 0.1;
  }

  // Reward responses that cite sources
  const citationPatterns = [/FRE\s+\d+/gi, /U\.S\.C\.\s+§/gi, /statute|code|regulation/gi];
  const citationCount = citationPatterns.reduce((sum, pattern) => sum + (text.match(pattern) || []).length, 0);
  score += Math.min(citationCount * 0.05, 0.15);

  // Penalize responses with warning signs
  if (text.toLowerCase().includes('i cannot') || text.toLowerCase().includes('i do not know')) {
    score -= 0.3;
  }

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, score));
}

/**
 * Calculate overall confidence for LDR result
 */
function calculateConfidence(docs: ExtractedDocument[], synthesisConfidence: number): number {
  // Weight: 60% synthesis quality, 40% source quality
  const sourceQuality = Math.min(docs.length / 5, 1.0); // Normalized by expected 5+ sources
  const documentQuality = docs.reduce((sum, doc) => sum + Math.min(doc.wordCount / 500, 1.0), 0) / docs.length;

  return 0.6 * synthesisConfidence + 0.4 * (sourceQuality * 0.5 + documentQuality * 0.5);
}

/**
 * Stream Gemma4 synthesis (for real-time UI updates)
 */
export async function streamLocalDeepResearchSynthesis(
  query: string,
  onChunk: (chunk: string) => void,
  config: LDRConfig = {}
): Promise<LDRResult> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    // Stages 1-2: Web search + extraction (non-streaming)
    const webResults = await searchViaSearXNG(query, mergedConfig.maxWebResults);
    if (webResults.length === 0) {
      onChunk('No web search results found.');
      return {
        synthesis: 'No web search results found.',
        sources: [],
        confidence: 0.0,
        durationMs: Date.now() - startTime,
        stage: 'search',
        error: 'No results'
      };
    }

    const extractionPromises = webResults
      .slice(0, mergedConfig.maxDocumentsToFetch)
      .map(r => fetchAndExtractText(r.url));

    const extractedDocs = (await Promise.allSettled(extractionPromises))
      .filter((result) => result.status === 'fulfilled' && result.value !== null)
      .map((result) => (result as PromiseFulfilledResult<ExtractedDocument>).value);

    if (extractedDocs.length === 0) {
      onChunk('Could not extract content from search results.');
      return {
        synthesis: 'Could not extract content.',
        sources: webResults.slice(0, 3).map(r => ({ url: r.url, title: r.title })),
        confidence: 0.3,
        durationMs: Date.now() - startTime,
        stage: 'extract',
        error: 'Extraction failed'
      };
    }

    // Stage 3: Stream Gemma4 synthesis
    const contextString = aggregateDocuments(extractedDocs);
    const systemPrompt = buildSystemPrompt(query);
    const userPrompt = buildUserPrompt(query, contextString);

    const llmUrl = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090/v1';
    const model = process.env.LLAMA_SERVER_MODEL || 'gemma4-legal-iq4xs-direct.gguf';

    const res = await fetch(`${llmUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: mergedConfig.temperature,
        max_tokens: 1024,
        stream: true
      })
    });

    if (!res.ok) {
      throw new Error(`Gemma4 streaming failed: ${res.status}`);
    }

    let fullText = '';
    const decoder = new TextDecoder();
    let buf = '';

    if (res.body) {
      for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
        buf += decoder.decode(chunk, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') break;

          try {
            const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              onChunk(content);
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    }

    return {
      synthesis: fullText,
      sources: extractedDocs.map(d => ({ url: d.url, title: d.title })),
      confidence: estimateConfidence(fullText, fullText.split(/\s+/).length),
      durationMs: Date.now() - startTime,
      stage: 'synthesis'
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    onChunk(`\n\n[Error: ${errorMsg}]`);

    return {
      synthesis: `Error: ${errorMsg}`,
      sources: [],
      confidence: 0.0,
      durationMs: Date.now() - startTime,
      stage: 'synthesis',
      error: errorMsg
    };
  }
}
