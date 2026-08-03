/**
 * LangExtract Client - legacy compatibility wrapper.
 *
 * The old subprocess bridge has been retired. This adapter now delegates to the
 * shared HTTP Parent Atlas sidecar contract so callers keep working without
 * relying on local Python script execution or cwd-sensitive temp files.
 */

import { ENV } from '$lib/server/env.server.js';
import { createLangExtractClient } from '$lib/server/atlas/ai/langextract-client.js';
import type {
  LangExtractAnalyzeRequest,
} from '$lib/server/atlas/ai/langextract-transport.js';
import type { ExtractedClaim, ExtractedEntity, LangExtractRequest, LangExtractResult } from './langextract-types.js';

export type LangExtractClientOptions = {
  baseUrl?: string;
  timeoutMs?: number;
};

function normalizeSourceType(sourceType: LangExtractRequest['sourceType']): LangExtractAnalyzeRequest['source_type'] {
  switch (sourceType) {
    case 'docling_markdown':
    case 'docling_json':
    case 'ocr_text':
    case 'transcript':
    case 'plain_text':
      return sourceType;
    default:
      return 'general';
  }
}

export class LangExtractClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly client: ReturnType<typeof createLangExtractClient>;

  constructor(opts: LangExtractClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? ENV.MINIFORGE_SIDECAR_URL ?? ENV.LANGEXTRACT_URL ?? 'http://127.0.0.1:8095';
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.client = createLangExtractClient(this.baseUrl);
  }

  async extract(input: LangExtractRequest): Promise<LangExtractResult> {
    try {
      return await this.extractViaHttpSidecar(input);
    } catch (err) {
      console.warn('[LangExtract] Extraction failed:', (err as Error).message);
      return this.failOpenResult(input.evidenceId);
    }
  }

  private async extractViaHttpSidecar(input: LangExtractRequest): Promise<LangExtractResult> {
    const extracted = await this.client.analyze(
      {
        text: input.text,
        source_type: normalizeSourceType(input.sourceType),
        extraction_mode: 'full',
        document_id: input.evidenceId,
        source_ref: input.caseId,
        packet_key: input.evidenceId,
        language: 'en',
        max_chars: Math.max(10_000, input.text.length),
      },
      { timeoutMs: this.timeoutMs }
    );

    return {
      entities: this.mapEntities(extracted.entities ?? []),
      events: [],
      claims: this.mapClaims(extracted.concepts ?? [], extracted.entities ?? []),
      crime_signals: [],
      summary: this.buildSummary(input, extracted.entities ?? [], extracted.relationships ?? [], extracted.concepts ?? []),
      warnings: (extracted.entities ?? []).length === 0
        ? ['LangExtract sidecar returned no entities; continuing with empty extraction']
        : [],
    };
  }

  private failOpenResult(evidenceId: string): LangExtractResult {
    return {
      entities: [],
      events: [],
      claims: [],
      crime_signals: [],
      summary: '',
      warnings: ['LangExtract unavailable; continuing with empty extraction']
    };
  }

  private mapEntities(entities: Array<{ text?: string; label?: string; confidence?: number; source?: string }>): ExtractedEntity[] {
    return entities.map((entity) => ({
      type: this.normalizeEntityType(entity.label ?? 'contact'),
      text: entity.text ?? '',
      confidence: typeof entity.confidence === 'number' ? entity.confidence : 0,
      role_or_context: entity.source ? `source:${entity.source}` : undefined,
    }));
  }

  private mapClaims(concepts: string[], entities: Array<{ text?: string }>): ExtractedClaim[] {
    return concepts.map((concept) => ({
      claim: concept,
      kind: 'unknown',
      confidence: entities.length > 0 ? 0.5 : 0.25,
    }));
  }

  private normalizeEntityType(label: string): ExtractedEntity['type'] {
    const normalized = label.toLowerCase();
    switch (normalized) {
      case 'person':
      case 'organization':
      case 'location':
      case 'date':
      case 'time':
      case 'statute':
      case 'case':
      case 'charge':
      case 'weapon':
      case 'vehicle':
      case 'property':
      case 'medical':
      case 'digital_account':
      case 'amount':
      case 'contact':
        return normalized;
      default:
        return 'contact';
    }
  }

  private buildSummary(
    input: LangExtractRequest,
    entities: Array<{ text?: string }>,
    relationships: Array<unknown>,
    concepts: string[]
  ): string {
    return [
      `LangExtract sidecar summary for ${input.evidenceId}`,
      `${entities.length} entities`,
      `${relationships.length} relationships`,
      `${concepts.length} concepts`,
    ].join(' • ');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.health();
      return response.ready;
    } catch {
      return false;
    }
  }
}

let client: LangExtractClient | null = null;

export function getLangExtractClient(opts?: LangExtractClientOptions): LangExtractClient {
  if (!client) {
    client = new LangExtractClient(opts);
  }
  return client;
}
