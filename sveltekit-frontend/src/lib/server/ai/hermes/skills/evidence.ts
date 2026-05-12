import type { SkillRecipe } from './registry.js';

export const EVIDENCE_SKILLS: Record<string, SkillRecipe> = {
  ingest_pdf: {
    id: 'ingest_pdf',
    family: 'Evidence',
    description: 'Ingest a PDF file, extract text, and chunk for indexing',
    tools: [{ name: 'ingest:pdf' }, { name: 'search:vector' }]
  },
  ingest_video: {
    id: 'ingest_video',
    family: 'Evidence',
    description: 'Ingest a video file, extract audio and keyframes',
    tools: [{ name: 'ingest:video' }, { name: 'batch:run' }]
  },
  transcribe_audio: {
    id: 'transcribe_audio',
    family: 'Evidence',
    description: 'Transcribe audio evidence using Whisper',
    tools: [{ name: 'transcribe:audio' }]
  },
  extract_keyframes: {
    id: 'extract_keyframes',
    family: 'Evidence',
    description: 'Extract visual keyframes from video evidence',
    tools: [{ name: 'ingest:video' }]
  },
  OCR_images: {
    id: 'OCR_images',
    family: 'Evidence',
    description: 'Perform OCR on image evidence or PDF scans',
    tools: [{ name: 'extract:metadata' }]
  },
  tag_evidence: {
    id: 'tag_evidence',
    family: 'Evidence',
    description: 'Auto-tag evidence items with relevant legal categories',
    tools: [{ name: 'llm:generate' }]
  },
  build_timeline: {
    id: 'build_timeline',
    family: 'Evidence',
    description: 'Construct a chronological timeline from multiple evidence items',
    tools: [
      { name: 'search:sql', args: (input) => ({ query: `SELECT * FROM evidence WHERE case_id = '${input.caseId}'` }) },
      { name: 'extract:metadata' },
      { name: 'llm:generate', args: (input) => ({ prompt: `Synthesize a timeline from these items: ${JSON.stringify(input.results)}` }) }
    ]
  },
  verify_chain_of_custody: {
    id: 'verify_chain_of_custody',
    family: 'Evidence',
    description: 'Verify audit trails for evidence items to ensure integrity',
    tools: [
      { name: 'search:sql', args: (input) => ({ query: `SELECT * FROM warden_audit_log WHERE evidence_id = '${input.evidenceId}'` }) },
      { name: 'llm:generate', args: (input) => ({ prompt: `Audit this log for gaps: ${JSON.stringify(input.results)}` }) }
    ]
  },
  extract_entities_from_transcript: {
    id: 'extract_entities_from_transcript',
    family: 'Evidence',
    description: 'Identify and extract key entities from transcribed audio',
    tools: [
      { name: 'search:sql', args: (input) => ({ query: `SELECT text FROM whisper_segments WHERE evidence_id = '${input.evidenceId}'` }) },
      { name: 'llm:generate', args: (input) => ({ prompt: `Extract entities (people, locations, dates) from: ${JSON.stringify(input.results)}` }) }
    ]
  },
  cluster_evidence_by_topic: {
    id: 'cluster_evidence_by_topic',
    family: 'Evidence',
    description: 'Group evidence items by semantic topic using vector embeddings',
    tools: [
      { name: 'search:vector', args: (input) => ({ query: input.topic, limit: 20 }) },
      { name: 'topology:summary', args: (input) => ({ topK: 5 }) }
    ]
  },
  cross_reference_witnesses: {
    id: 'cross_reference_witnesses',
    family: 'Evidence',
    description: 'Identify contradictions or confirmations between witness statements',
    tools: [{ name: 'search:vector' }, { name: 'llm:generate' }]
  },
  find_missing_evidence: {
    id: 'find_missing_evidence',
    family: 'Evidence',
    description: 'Identify gaps in the evidence chain for a case',
    tools: [{ name: 'llm:generate' }]
  }
};
