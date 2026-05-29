/**
 * Unified Entity Extractor — 3 implementations → 1 pluggable registry
 *
 * Consolidates entity extraction across regex, LLM, and hybrid patterns.
 * Replaces:
 * - entity-extraction.ts (regex-based)
 * - nlp-entity-extractor.ts (LLM-based)
 * - hybrid-entity-analyzer.ts (combined)
 *
 * Single API: entityExtractor.extract(text, types)
 */

import { cacheTTL } from './shared-cache-api';
import { CACHE_KEYS, CACHE_TTL, EntitySchema } from './cache-config';
import crypto from 'crypto';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════════

export type EntityType = 'EMAIL' | 'PHONE' | 'DATE' | 'CITATION' | 'STATUTE' | 'MONEY';

export interface Entity {
  type: EntityType;
  value: string;
  confidence: number;
  position?: { start: number; end: number };
}

export interface EntityExtractionRequest {
  text: string;
  types?: EntityType[];
  minConfidence?: number;
}

export interface EntityExtractionResult {
  entities: Entity[];
  textHash: string;
  extractorUsed: 'regex' | 'llm' | 'hybrid';
  executionTimeMs: number;
}

// ═══════════════════════════════════════════════════════════════════════
// Extractor Interface
// ═══════════════════════════════════════════════════════════════════════

interface IEntityExtractor {
  extract(text: string, types?: EntityType[]): Promise<Entity[]>;
}

// ═══════════════════════════════════════════════════════════════════════
// Regex-Based Extractor (fast, deterministic)
// ═══════════════════════════════════════════════════════════════════════

class RegexExtractor implements IEntityExtractor {
  private patterns: Record<EntityType, RegExp> = {
    EMAIL: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    PHONE: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    DATE: /\b(?:(?:(?:1[6-9]|[2-9]\d)\d{2})[-/.](?:0?[13456789]|1[012])[-/.](?:0?[1-9]|[12]\d|3[01])|(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[13456789]|1[012])[-/.](?:(?:1[6-9]|[2-9]\d)\d{2}))\b/g,
    CITATION: /\b\d+\s+(?:U\.S\.|F\.\d?d|Cal\.|N\.Y\.|etc\.)\s+\d+\b/g,
    STATUTE: /\b(?:§|Sec\.|Section|Art\.|Article)\s+[0-9.-]+\b/gi,
    MONEY: /[$£€]\s*[0-9]+(?:,?[0-9]{3})*(?:\.\d{2})?\b/g,
  };

  async extract(text: string, types?: EntityType[]): Promise<Entity[]> {
    const entities: Entity[] = [];
    const typesToExtract = types || Object.keys(this.patterns) as EntityType[];

    for (const type of typesToExtract) {
      const regex = this.patterns[type];
      if (!regex) continue;

      let match;
      while ((match = regex.exec(text)) !== null) {
        entities.push({
          type,
          value: match[0],
          confidence: 0.95, // Regex is highly confident
          position: { start: match.index, end: match.index + match[0].length },
        });
      }
    }

    return entities;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LLM-Based Extractor (accurate, slower)
// ═══════════════════════════════════════════════════════════════════════

class LLMExtractor implements IEntityExtractor {
  async extract(text: string, types?: EntityType[]): Promise<Entity[]> {
    try {
      // Call LLM service for entity extraction
      const response = await fetch('/api/ai/extract-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          types: types || ['EMAIL', 'PHONE', 'CITATION', 'STATUTE', 'MONEY'],
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM extraction failed: ${response.status}`);
      }

      const result = await response.json();
      return result.entities || [];
    } catch (err) {
      console.warn('[LLMExtractor] Fallback to regex:', err);
      return [];
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Hybrid Extractor (regex + LLM fallback)
// ═══════════════════════════════════════════════════════════════════════

class HybridExtractor implements IEntityExtractor {
  private regex: RegexExtractor;
  private llm: LLMExtractor;

  constructor() {
    this.regex = new RegexExtractor();
    this.llm = new LLMExtractor();
  }

  async extract(text: string, types?: EntityType[]): Promise<Entity[]> {
    // Start with fast regex extraction
    const regexEntities = await this.regex.extract(text, types);

    // If regex found enough entities, return early
    if (regexEntities.length >= 5) {
      return regexEntities;
    }

    // Otherwise, use LLM for better coverage
    const llmEntities = await this.llm.extract(text, types);

    // Merge and deduplicate
    const merged = new Map<string, Entity>();
    const allEntities = [...regexEntities, ...llmEntities];

    allEntities.forEach((entity) => {
      const key = `${entity.type}:${entity.value}`;
      const existing = merged.get(key);
      // Keep the one with higher confidence
      if (!existing || entity.confidence > existing.confidence) {
        merged.set(key, entity);
      }
    });

    return Array.from(merged.values());
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Main API
// ═══════════════════════════════════════════════════════════════════════

class EntityExtractorUnified {
  private extractors: Map<string, IEntityExtractor> = new Map();
  private defaultExtractor: IEntityExtractor;

  constructor() {
    // Initialize built-in extractors
    this.extractors.set('regex', new RegexExtractor());
    this.extractors.set('llm', new LLMExtractor());
    this.extractors.set('hybrid', new HybridExtractor());

    // Default to hybrid (best balance)
    this.defaultExtractor = this.extractors.get('hybrid')!;
  }

  register(name: string, extractor: IEntityExtractor): void {
    this.extractors.set(name, extractor);
  }

  useExtractor(name: string): void {
    const extractor = this.extractors.get(name);
    if (!extractor) {
      throw new Error(`Unknown extractor: ${name}`);
    }
    this.defaultExtractor = extractor;
  }

  async extract(request: EntityExtractionRequest): Promise<EntityExtractionResult> {
    const startTime = Date.now();

    // Generate cache key
    const hash = crypto.createHash('sha256').update(request.text).digest('hex');
    const cacheKey = CACHE_KEYS.ENTITIES(hash);

    // Use shared cache
    const entities = await cacheTTL(
      cacheKey,
      CACHE_TTL.ENTITY,
      () => this.defaultExtractor.extract(request.text, request.types),
      {
        onMiss: (key) => {
          console.debug(`[EntityExtractor] MISS: ${key}`);
        },
        onError: (err) => {
          console.warn(`[EntityExtractor] Cache error:`, err);
        },
      }
    );

    // Filter by confidence if requested
    const filtered =
      request.minConfidence !== undefined
        ? entities.filter((e) => e.confidence >= request.minConfidence!)
        : entities;

    return {
      entities: filtered,
      textHash: hash,
      extractorUsed: 'hybrid',
      executionTimeMs: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════

export const entityExtractor = new EntityExtractorUnified();

// ═══════════════════════════════════════════════════════════════════════
// Convenience Functions
// ═══════════════════════════════════════════════════════════════════════

export async function extractEntities(text: string, types?: EntityType[]): Promise<Entity[]> {
  const result = await entityExtractor.extract({ text, types });
  return result.entities;
}

export async function extractEntitiesWithMetadata(
  text: string,
  types?: EntityType[]
): Promise<EntityExtractionResult> {
  return entityExtractor.extract({ text, types });
}

// ═══════════════════════════════════════════════════════════════════════
// Clear Cache
// ═══════════════════════════════════════════════════════════════════════

import { getRedis } from '$lib/server/redis';

export async function clearEntityCache(): Promise<number> {
  const redis = getRedis();
  const keys = await redis.keys('entities:*');
  if (keys.length > 0) {
    return redis.del(...keys);
  }
  return 0;
}
