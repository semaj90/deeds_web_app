/**
 * Unified Entity Extractor — Consolidates entity extraction across the codebase
 * Exposes a pluggable registry for custom patterns and delegates to Ollama for legal NL.
 */

import { createHash } from 'crypto';
import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { getOllamaEndpoint } from '$lib/server/utils/ollama-endpoint.js';
import { getRedis } from '$lib/server/redis.js';
import { z } from 'zod';
import { CACHE_KEYS, CACHE_TTL } from '../cache/cache-config.js';

export type EntityType = 
  | 'EMAIL' 
  | 'PHONE' 
  | 'DATE' 
  | 'CITATION' 
  | 'STATUTE' 
  | 'MONEY'
  | 'SSN'
  | 'CREDIT_CARD'
  | 'URL'
  | 'DOCKET'
  | 'ADDRESS'
  | 'PERSON'
  | 'ORG'
  | 'LOCATION'
  | 'CASE'
  | 'COURT';

export interface Entity {
  type: EntityType;
  value: string;
  confidence: number;
  position?: { start: number; end: number };
  source: 'llm' | 'regex' | 'custom';
}

export interface EntityExtractionRequest {
  text: string;
  types?: EntityType[];
  minConfidence?: number;
  useLLM?: boolean;
}

export interface EntityExtractionResult {
  entities: Entity[];
  textHash: string;
  extractorUsed: 'regex' | 'llm' | 'hybrid';
  executionTimeMs: number;
}

// Zod schema for structured output
const entityResponseSchema = z.object({
  entities: z.array(z.object({
    text: z.string(),
    label: z.string(),
    score: z.number().optional(),
  })),
});
const entityJsonSchema = z.toJSONSchema(entityResponseSchema);

const MODEL = 'gemma3:270m';

export class EntityExtractorUnified {
  private customPatterns: Map<string, RegExp> = new Map();
  private regexPatterns: Record<string, RegExp> = {
    EMAIL: /[\w.-]+@[\w.-]+\.[A-Za-z]{2,6}/g,
    PHONE: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    DATE: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g,
    CITATION: /\b\d+\s+(?:U\.S\.|F\.\d?d|Cal\.|N\.Y\.|etc\.)\s+\d+\b/g,
    STATUTE: /(?:§|Section|Sec\.)\s*\d+(?:\.\d+)?(?:\([a-z]\))?|\b\d{1,2}\s+U\.?S\.?C\.?\s*§?\s*\d+(?:\([a-z]\))?/gi,
    MONEY: /\$[\d,]+(?:\.\d{2})?/g,
    SSN: /\b\d{3}-\d{2}-\d{4}\b/g,
    CREDIT_CARD: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    URL: /https?:\/\/[^\s<>"{}|\\^`[\]]+/g,
    DOCKET: /\b(?:Case\s+)?No\.\s*\d{1,2}:\d{2}-[a-z]{2,3}-\d{4,6}(?:-[A-Z]+)?\b/gi,
    ADDRESS: /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Way|Ct|Court|Pl|Place)\.?(?:\s*,?\s*(?:Suite|Ste|Apt|Unit|#)\s*\d+)?\b/g,
  };

  /**
   * Register a custom regex pattern for entity extraction
   */
  registerPattern(name: string, pattern: RegExp): void {
    this.customPatterns.set(name, pattern);
  }

  /**
   * Extract entities using Regex patterns
   */
  extractViaRegex(text: string, types?: EntityType[]): Entity[] {
    const entities: Entity[] = [];
    const activeTypes = types || (Object.keys(this.regexPatterns) as EntityType[]);

    const pushEntity = (match: RegExpExecArray, type: EntityType, score: number) => {
      entities.push({
        type,
        value: match[0],
        confidence: score,
        position: { start: match.index, end: match.index + match[0].length },
        source: 'regex',
      });
    };

    // Run standard regexes
    for (const type of activeTypes) {
      const pattern = this.regexPatterns[type];
      if (!pattern) continue;
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        pushEntity(match, type, 0.95);
      }
    }

    // Run custom regexes
    for (const [name, pattern] of this.customPatterns.entries()) {
      if (types && !types.includes(name as any)) continue;
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          type: name as any,
          value: match[0],
          confidence: 0.9,
          position: { start: match.index, end: match.index + match[0].length },
          source: 'custom',
        });
      }
    }

    return entities;
  }

  /**
   * Extract entities via Gemma4 RotorQuant at :8090 (streaming)
   */
  async extractViaLLM(text: string, types?: EntityType[]): Promise<Entity[]> {
    const systemPrompt = `You are a legal document entity extractor. Extract named entities and return ONLY a valid JSON object (no markdown, no explanations).`;

    const userPrompt = `Extract named entities from this legal document. Return a JSON object with format: {"entities": [{"text": "...", "label": "PERSON|ORG|LOCATION|DATE|STATUTE|CASE|COURT|MONEY|EMAIL|PHONE"}]}
Only extract entities clearly present. Do not fabricate.

Text (first 8000 chars):
${text.slice(0, 8000)}`;

    const gemma4Url = process.env.GEMMA4_URL || 'http://127.0.0.1:8090';

    try {
      return await traceLLM('entity-extraction-unified', { model: 'gemma4-legal-iq4xs-direct.gguf', prompt: text.slice(0, 500) }, async (gen) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90_000);

        try {
          const res = await fetch(`${gemma4Url}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gemma4-legal-iq4xs-direct.gguf',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              max_tokens: 2048,
              temperature: 0.1,
              stream: true,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!res.ok) {
            gen.end({ output: 'gemma4-error', level: 'WARNING' });
            return [];
          }

          // Parse streaming SSE response
          let accumulated = '';
          const decoder = new TextDecoder();
          let buffer = '';

          if (!res.body) {
            gen.end({ output: 'no-body', level: 'WARNING' });
            return [];
          }

          const reader = res.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';

              for (const line of lines) {
                if (!line.trim().startsWith('data:')) continue;
                const payload = line.slice(5).trim();
                if (payload === '[DONE]') break;

                try {
                  const parsed = JSON.parse(payload);
                  const content = parsed.choices?.[0]?.delta?.content ?? '';
                  accumulated += content;
                } catch {
                  // Skip malformed lines
                }
              }
            }
          } finally {
            reader.releaseLock();
          }

          // Parse JSON response
          const jsonMatch = accumulated.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            gen.end({ output: 'no-json', level: 'WARNING' });
            return [];
          }

          const parsed = JSON.parse(jsonMatch[0]);
          const arr = Array.isArray(parsed.entities) ? parsed.entities : [];
          const entities = arr
            .filter((e: any) => typeof e?.text === 'string' && typeof e?.label === 'string' && e.text.length > 0)
            .map((e: any) => ({
              type: e.label as EntityType,
              value: e.text,
              confidence: 0.9,
              source: 'llm' as const,
            }));

          gen.end({ output: `${entities.length} entities`, level: 'DEFAULT' });
          return entities;
        } finally {
          clearTimeout(timeoutId);
        }
      });
    } catch (err) {
      console.warn('[EntityExtractorUnified] Gemma4 extraction failed:', err);
      return [];
    }
  }

  /**
   * Main API: Pluggable extraction with Redis caching
   */
  async extract(request: EntityExtractionRequest): Promise<EntityExtractionResult> {
    const startTime = Date.now();
    const hash = createHash('sha256').update(request.text).digest('hex');
    const cacheKey = CACHE_KEYS.ENTITIES(hash);
    const redis = getRedis();

    // 1. Try Cache
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as Entity[];
        return {
          entities: this.filterResults(parsed, request),
          textHash: hash,
          extractorUsed: 'hybrid',
          executionTimeMs: Date.now() - startTime,
        };
      }
    } catch {
      // Ignore cache errors
    }

    // 2. Perform Extraction
    const regexEntities = this.extractViaRegex(request.text, request.types);
    let llmEntities: Entity[] = [];

    if (request.useLLM !== false) {
      llmEntities = await this.extractViaLLM(request.text, request.types);
    }

    // Deduplicate and merge
    const merged = new Map<string, Entity>();
    const all = [...regexEntities, ...llmEntities];

    for (const ent of all) {
      const key = `${ent.type}:${ent.value}`.toLowerCase();
      const existing = merged.get(key);
      if (!existing || ent.confidence > existing.confidence) {
        merged.set(key, ent);
      }
    }

    const finalEntities = Array.from(merged.values());

    // 3. Set Cache (fire-and-forget)
    redis.setex(cacheKey, CACHE_TTL.ENTITY, JSON.stringify(finalEntities)).catch(() => {});

    return {
      entities: this.filterResults(finalEntities, request),
      textHash: hash,
      extractorUsed: request.useLLM !== false ? 'hybrid' : 'regex',
      executionTimeMs: Date.now() - startTime,
    };
  }

  private filterResults(entities: Entity[], request: EntityExtractionRequest): Entity[] {
    let results = entities;
    if (request.minConfidence !== undefined) {
      results = results.filter((e) => e.confidence >= request.minConfidence!);
    }
    if (request.types && request.types.length > 0) {
      results = results.filter((e) => request.types!.includes(e.type));
    }
    return results;
  }
}

export const entityExtractor = new EntityExtractorUnified();
