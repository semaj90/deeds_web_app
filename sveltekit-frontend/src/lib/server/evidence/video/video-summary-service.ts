import { summarizeDocument } from '$lib/server/analysis/summarizer.js';
import type { VideoSummaryResult, VideoTranscriptChunk } from './video-ingest-types.js';

export async function summarizeVideoTranscript(
  transcriptText: string,
  chunks: VideoTranscriptChunk[]
): Promise<VideoSummaryResult> {
  const summary = (await summarizeDocument(transcriptText, 120)).trim();
  const keyFacts = chunks
    .map((chunk) => chunk.text.trim())
    .filter(Boolean)
    .map((text) => text.slice(0, 140))
    .filter((text, index, all) => all.indexOf(text) === index)
    .slice(0, 6);

  return {
    summary: summary || transcriptText.slice(0, 500) || 'Video transcript ingested.',
    keyFacts,
    confidence: summary ? 0.8 : 0.45,
  };
}
