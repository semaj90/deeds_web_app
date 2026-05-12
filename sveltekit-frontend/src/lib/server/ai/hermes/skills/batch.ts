import type { SkillRecipe } from './registry.js';

export const BATCH_SKILLS: Record<string, SkillRecipe> = {
  batch_metadata_extraction: {
    id: 'batch_metadata_extraction',
    family: 'Batch',
    description: 'Process a folder of documents to extract structured metadata in parallel',
    tools: [{ name: 'batch:run', args: (input) => ({ tool: 'extract:metadata', path: input.path }) }]
  },
  background_report_generation: {
    id: 'background_report_generation',
    family: 'Batch',
    description: 'Trigger an asynchronous deep research report for a specific topic',
    tools: [{ name: 'shell:run', args: (input) => ({ command: `npm run research:report -- --topic "${input.topic}"` }) }]
  },
  bulk_reindex_evidence: {
    id: 'bulk_reindex_evidence',
    family: 'Batch',
    description: 'Re-index a specific set of evidence items into the vector store',
    tools: [{ name: 'shell:run' }]
  },
  multi_file_repair_loop: {
    id: 'multi_file_repair_loop',
    family: 'Batch',
    description: 'Run an autonomous repair loop across multiple files identified with lint errors',
    tools: [{ name: 'batch:run', args: (input) => ({ tool: 'code:repair', files: input.files }) }]
  },
  periodic_cache_warmup: {
    id: 'periodic_cache_warmup',
    family: 'Batch',
    description: 'Pre-load hot data into Redis cache based on predicted agent needs',
    tools: [{ name: 'search:redis' }, { name: 'search:couchdb' }]
  },
  scheduled_backup_sync: {
    id: 'scheduled_backup_sync',
    family: 'Batch',
    description: 'Trigger a backup synchronization between local storage and SeaweedFS S3',
    tools: [{ name: 'shell:run' }]
  },
  batch_token_audit: {
    id: 'batch_token_audit',
    family: 'Batch',
    description: 'Calculate token costs and usage metrics for a specific project or mission',
    tools: [{ name: 'llm:generate' }]
  },
  automated_vulnerability_scan: {
    id: 'automated_vulnerability_scan',
    family: 'Batch',
    description: 'Run a suite of static analysis tools to find security flaws in the codebase',
    tools: [{ name: 'shell:run' }]
  },
  bulk_tag_update: {
    id: 'bulk_tag_update',
    family: 'Batch',
    description: 'Update tags or categories for a large set of wiki cards or documents',
    tools: [{ name: 'search:couchdb' }, { name: 'memory:write_note' }]
  },
  parallel_translation_pipeline: {
    id: 'parallel_translation_pipeline',
    family: 'Batch',
    description: 'Translate a set of legal documents into multiple languages in parallel',
    tools: [{ name: 'batch:run', args: (input) => ({ tool: 'llm:translate', docs: input.docs }) }]
  },
  batch_link_validation: {
    id: 'batch_link_validation',
    family: 'Batch',
    description: 'Verify the integrity of cross-references and links across the knowledge base',
    tools: [{ name: 'search:couchdb' }, { name: 'shell:run' }]
  }
};
