/**
 * Hermes Batch Skills
 * 
 * Recipes for high-volume data processing.
 */

import type { SkillRecipe } from './registry.js';

export const BATCH_SKILLS: Record<string, SkillRecipe> = {
  'batch_ingest_folder': {
    id: 'batch_ingest_folder',
    family: 'Batch',
    description: 'Bulk ingest all files from a directory into the evidence pipeline',
    tools: [
      {
        name: 'shell:run',
        args: (input) => ({
          command: `npm run ingest:folder -- --path=${input.path}`
        })
      }
    ]
  },
  'batch_transcribe': {
    id: 'batch_transcribe',
    family: 'Batch',
    description: 'Queue multiple audio/video files for transcription',
    tools: [
      {
        name: 'batch:run',
        args: (input) => ({
          tool: 'transcribe:audio',
          items: input.files,
          concurrency: 2
        })
      }
    ]
  },
  'batch_embed': {
    id: 'batch_embed',
    family: 'Batch',
    description: 'Generate embeddings for a list of text chunks',
    tools: [
      {
        name: 'batch:run',
        args: (input) => ({
          tool: 'gpu:embed',
          items: input.texts,
          concurrency: 10
        })
      }
    ]
  },
  'batch_export_jsonl': {
    id: 'batch_export_jsonl',
    family: 'Batch',
    description: 'Export all graph data (Cluster/Chunk/Transcript/Video) to Neo4j JSONL',
    tools: [
      {
        name: 'graph:export_jsonl',
        args: (input) => ({
          path: input.path || `/tmp/batch_export_${Date.now()}.jsonl`
        })
      }
    ]
  }
};
