import { z } from 'zod';

export const AgenticWorkflowIdentitySchema = z.object({
  agentic_workflow_id: z.string().uuid(),
  workflow_key: z.string().min(1),
  workflow_version: z.number().int().nonnegative(),
  schema_version: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional().nullable(),
}).strict();

export const AgenticWorkflowRunIdentitySchema = z.object({
  workflow_run_id: z.string().uuid(),
  agentic_workflow_id: z.string().uuid(),
  workspace_id: z.string().min(1),
  workspace_revision: z.number().int().nonnegative(),
  status: z.enum(['queued', 'running', 'waiting', 'complete', 'failed', 'cancelled']),
  trigger_type: z.string().min(1),
}).strict();

export const AtlasResearchRunIdentitySchema = z.object({
  research_run_id: z.string().uuid(),
  workflow_run_id: z.string().uuid(),
  question: z.string().min(1),
  strategy: z.string().min(1),
  research_profile: z.string().min(1),
  max_iterations: z.number().int().positive(),
  max_sources: z.number().int().positive(),
  status: z.enum(['planned', 'searching', 'acquiring', 'indexing', 'ready', 'failed']),
}).strict();

export const AtlasFetchAttemptIdentitySchema = z.object({
  fetch_id: z.string().uuid(),
  workflow_run_id: z.string().uuid(),
  research_run_id: z.string().uuid().optional().nullable(),
  requested_url: z.string().min(1),
  final_url: z.string().min(1),
  acquisition_mode: z.enum(['http_html', 'playwright_html', 'pdf_text', 'pdf_ocr', 'image_ocr', 'repository_file']),
  status: z.enum(['queued', 'fetching', 'fetched', 'rejected', 'failed']),
}).strict();

export const AtlasSourceRevisionIdentitySchema = z.object({
  source_revision_id: z.string().uuid(),
  web_source_id: z.string().uuid(),
  source_revision: z.string().min(1),
  final_url: z.string().min(1),
  canonical_url: z.string().min(1),
  content_digest: z.string().min(1),
  content_type: z.string().min(1),
  storage_uri: z.string().min(1),
}).strict();

export const AtlasExtractionIdentitySchema = z.object({
  extraction_id: z.string().uuid(),
  source_revision_id: z.string().uuid(),
  workflow_run_id: z.string().uuid().optional().nullable(),
  extraction_type: z.enum(['beautifulsoup_html', 'playwright_dom', 'pdf_text', 'pdf_ocr', 'image_ocr']),
  extractor_name: z.string().min(1),
  extractor_version: z.string().min(1),
  schema_version: z.string().min(1),
}).strict();

export const AtlasDocumentNodeIdentitySchema = z.object({
  document_node_id: z.string().min(1),
  extraction_id: z.string().uuid(),
  source_revision_id: z.string().uuid(),
  node_kind: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
}).strict();

export const AtlasChunkIdentitySchema = z.object({
  chunk_id: z.string().min(1),
  source_revision_id: z.string().uuid(),
  extraction_id: z.string().uuid(),
  document_node_ids: z.array(z.string().min(1)).min(1),
}).strict();

export const AtlasSynthesisIdentitySchema = z.object({
  synthesis_id: z.string().uuid(),
  workflow_run_id: z.string().uuid(),
  retrieval_run_id: z.string().uuid(),
  model_provider: z.string().min(1),
  model_name: z.string().min(1),
  model_revision: z.string().min(1),
}).strict();

export const AtlasWorkflowLineageBundleSchema = z.object({
  workflow: AgenticWorkflowIdentitySchema,
  workflowRun: AgenticWorkflowRunIdentitySchema,
  researchRun: AtlasResearchRunIdentitySchema,
  fetchAttempt: AtlasFetchAttemptIdentitySchema,
  sourceRevision: AtlasSourceRevisionIdentitySchema,
  extraction: AtlasExtractionIdentitySchema,
  documentNode: AtlasDocumentNodeIdentitySchema,
  chunk: AtlasChunkIdentitySchema,
  synthesis: AtlasSynthesisIdentitySchema,
}).strict();

export type AgenticWorkflowIdentity = z.infer<typeof AgenticWorkflowIdentitySchema>;
export type AgenticWorkflowRunIdentity = z.infer<typeof AgenticWorkflowRunIdentitySchema>;
export type AtlasResearchRunIdentity = z.infer<typeof AtlasResearchRunIdentitySchema>;
export type AtlasFetchAttemptIdentity = z.infer<typeof AtlasFetchAttemptIdentitySchema>;
export type AtlasSourceRevisionIdentity = z.infer<typeof AtlasSourceRevisionIdentitySchema>;
export type AtlasExtractionIdentity = z.infer<typeof AtlasExtractionIdentitySchema>;
export type AtlasDocumentNodeIdentity = z.infer<typeof AtlasDocumentNodeIdentitySchema>;
export type AtlasChunkIdentity = z.infer<typeof AtlasChunkIdentitySchema>;
export type AtlasSynthesisIdentity = z.infer<typeof AtlasSynthesisIdentitySchema>;
export type AtlasWorkflowLineageBundle = z.infer<typeof AtlasWorkflowLineageBundleSchema>;
