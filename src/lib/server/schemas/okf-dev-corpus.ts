import { z } from 'zod';

export const OkfDevDomainClassEnum = z.enum([
  'documentation',
  'tool',
  'workflow',
  'agent',
  'database',
  'retrieval',
  'graph',
  'gpu',
  'cache',
  'configuration',
  'error_fixing',
  'other',
]);

export const OkfDevApiRecommendationSchema = z.object({
  api: z.string().min(1),
  recommendation: z.string().min(1),
  rationale: z.string().min(1),
});

export const OkfDevCorpusEntrySchema = z.object({
  schema_version: z.literal('okf.dev.corpus.v1'),
  source_id: z.string().min(1),
  source_ref: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  domain_class: OkfDevDomainClassEnum,
  focus_tags: z.array(z.string().min(1)).default([]),
  llm_synthesis: z.string().min(1),
  llm_output: z.record(z.string(), z.unknown()).default({}),
  kanban: z
    .object({
      board: z.string().min(1),
      lane: z.string().min(1),
      status: z.string().min(1),
    })
    .default({ board: 'okf-dev', lane: 'backlog', status: 'open' }),
  taskboard: z
    .object({
      task_id: z.string().min(1),
      title: z.string().min(1),
      status: z.string().min(1),
    })
    .default({ task_id: 'okf-dev', title: 'OKF dev corpus', status: 'open' }),
  agentic_error_fixing: z
    .object({
      symptom: z.string().min(1),
      likely_fix: z.string().min(1),
      validation: z.string().min(1),
    })
    .default({
      symptom: 'docs ingestion gap',
      likely_fix: 'Use Firecrawl scrape with bounded manifest and schema validation',
      validation: 'Validate emitted corpus entry with Zod',
    }),
  canonical_api_recommendations: z.array(OkfDevApiRecommendationSchema).default([]),
  content_hash: z.string().min(1),
  markdown_path: z.string().min(1),
  fetched_at: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type OkfDevCorpusEntry = z.infer<typeof OkfDevCorpusEntrySchema>;
export type OkfDevDomainClass = z.infer<typeof OkfDevDomainClassEnum>;
