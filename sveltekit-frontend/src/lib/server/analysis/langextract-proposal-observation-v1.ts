import { z } from 'zod';
import {
  requestLangExtractAnalyze,
  type LangExtractAnalyzeResponse,
} from '../atlas/ai/langextract-transport.js';

const inputSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
  enabled: z.boolean(),
}).strict();

export type LangExtractProposalObservationV1 = {
  ok: boolean;
  status: 'OBSERVED' | 'DISABLED' | 'UNAVAILABLE' | 'INVALID_INPUT';
  source: 'langextract-8095';
  factCount: number;
  facts: {
    entities: LangExtractAnalyzeResponse['entities'];
    relationships: LangExtractAnalyzeResponse['relationships'];
    concepts: string[];
    features: NonNullable<LangExtractAnalyzeResponse['features']>;
    chunks: NonNullable<LangExtractAnalyzeResponse['chunks']>;
  };
  errorCode?: 'LANGEXTRACT_REQUEST_FAILED';
};

const emptyFacts: LangExtractProposalObservationV1['facts'] = {
  entities: [],
  relationships: [],
  concepts: [],
  features: [],
  chunks: [],
};

export async function runLangExtractProposalObservationV1(
  input: unknown,
  request: typeof requestLangExtractAnalyze = requestLangExtractAnalyze,
): Promise<LangExtractProposalObservationV1> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, status: 'INVALID_INPUT', source: 'langextract-8095', factCount: 0, facts: emptyFacts };
  }
  if (!parsed.data.enabled) {
    return { ok: false, status: 'DISABLED', source: 'langextract-8095', factCount: 0, facts: emptyFacts };
  }

  try {
    const response = await request({
      text: parsed.data.text,
      source_type: 'general',
      extraction_mode: 'full',
      max_chars: 10_000,
    }, { timeoutMs: 30_000 });
    const facts = {
      entities: response.entities.slice(0, 20),
      relationships: response.relationships.slice(0, 20),
      concepts: response.concepts.slice(0, 20),
      features: (response.features ?? []).slice(0, 20),
      chunks: (response.chunks ?? []).slice(0, 20),
    };
    const factCount = Math.min(60, Object.values(facts).reduce((count, rows) => count + rows.length, 0));
    return { ok: true, status: 'OBSERVED', source: 'langextract-8095', factCount, facts };
  } catch {
    return {
      ok: false,
      status: 'UNAVAILABLE',
      source: 'langextract-8095',
      factCount: 0,
      facts: emptyFacts,
      errorCode: 'LANGEXTRACT_REQUEST_FAILED',
    };
  }
}
