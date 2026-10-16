/**
 * RG-Atlas Search Pipeline — Type Contracts
 * Based on Section 3 of docs/design/2026-05-11_rg-atlas-search-pipeline.md
 */
import { z } from 'zod';

export const rgSearchAtlasOptionsSchema = z.object({
  query: z.string().trim().min(1).max(512).describe('Search query (regex for Stage 1, NL for stages 4-8)'),
  paths: z.array(z.string().trim().min(1).max(256)
    .refine((value) => !value.includes(String.fromCharCode(0)) && !/^(?:[\\/]|[A-Za-z]:)/.test(value)
      && !value.split(/[\\/]+/).includes('..'), 'Paths must stay inside the repository'))
    .max(8).optional().describe('Repository-relative directory paths'),
  fileTypes: z.array(z.string().trim().regex(/^\.[A-Za-z0-9_-]{1,16}$/))
    .max(16).optional().describe('File extensions (e.g. [".ts", ".svelte"])'),
  variantCount: z.number().int().min(1).max(5).optional().describe('Number of query variations to generate (default: 3)'),
  topKPerLane: z.number().int().min(1).max(100).optional().describe('Hits to fetch per variant from Qdrant (default: 20)'),
  enableMarcoRerank: z.boolean().optional().describe('Enable the configured cross-encoder reranking tier'),
  enableLangExtract: z.boolean().optional().describe('Enable LangExtract GRPO validation'),
  persist: z.boolean().optional().describe('Persist result to PostgreSQL for replay (default: true)'),
  weights: z.object({
    marco: z.number().finite().min(0).max(1),
    karpathy: z.number().finite().min(0).max(1),
    cos: z.number().finite().min(0).max(1),
    lang: z.number().finite().min(0).max(1)
  }).strict().optional().describe('Weights for final blend score')
}).strict();

export interface RgSearchAtlasOptions {
  /** Search query — regex for stage 1, NL for stages 4-8 */
  query:             string;
  /** Directories to scan in stage 1. Default: ['sveltekit-frontend/src']. */
  paths?:            string[];
  /** File-type filter for rg. Default: ['ts', 'svelte']. */
  fileTypes?:        string[];
  /** Multi-query variant count for stage 4. Default 3. */
  variantCount?:     number;
  /** Top-K per Qdrant variant in stage 6. Default 20. */
  topKPerLane?:      number;
  /** Toggle configured cross-encoder rerank (stage 7). Default true. */
  enableMarcoRerank?: boolean;
  /** Toggle LangExtract validation (stage 8). Default true. */
  enableLangExtract?: boolean;
  /** Persist run + hits to Postgres. Default true. */
  persist?:          boolean;
  /** Final blend weights. Default { marco:0.4, karpathy:0.3, cos:0.2, lang:0.1 }. */
  weights?:          { marco: number; karpathy: number; cos: number; lang: number };
  /** Optional user ID for persistence */
  userId?:           number;
}

export interface RankedHit {
  filePath:       string;
  lineNumber?:    number;     // when rg-derived
  snippet?:       string;
  source:         'rg' | 'qdrant' | 'union';
  scores: {
    rgMatch:      number;     // 1 if rg hit, 0 if qdrant-only
    karpathy:     number;     // blend from gpu:karpathy:scores (0 if not in hash)
    qdrantCosine: number;     // raw Qdrant cosine score
    marco:        number;     // configured cross-encoder pointwise score (0-1)
    langExtract:  number;     // grounding score from langextract-reranker (0-1)
    final:        number;     // weighted blend, the order key
  };
  clusterId:      number;     // k-means cluster from stage 5 (or -1 if none)
  langExtractEntities?: Array<{
    type: string;
    text: string;
    sourceOffset: [number, number];
  }>;
}

export interface RgSearchAtlasResult {
  /** Stable run ID written to Postgres. Format: rg_<unix_ms>_<uuid8> */
  runId:        string;
  query:        string;
  hits:         RankedHit[];
  clusters: Array<{
    id:        number;
    centroid:  number[];      // 768-dim
    memberFiles: string[];
  }>;
  diagnostics: {
    rgMs:           number;
    embedMs:        number;
    gpuMs:          number;
    qdrantMs:       number;
    marcoMs:        number;
    langExtractMs:  number;
    totalMs:        number;
    rgHitCount:     number;
    qdrantHitCount: number;
    finalHitCount:  number;
    persistedToDb:  boolean;
  };
}
