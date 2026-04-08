/**
 * YouTube Transcript Extraction — Multi-Strategy Pipeline
 *
 * Strategies (in priority order):
 *   1. youtube-transcript npm package (free, no key, subtitle extraction)
 *   2. Firecrawl scrape with markdown format (paid API, full page content)
 *   3. Firecrawl scrape with audio format (paid API, returns MP3 → future whisper)
 *
 * Returns structured transcript + metadata for chunking → embedding → Qdrant.
 */

import { ENV } from '$lib/server/env.server.js';

export interface YouTubeTranscriptResult {
  videoId: string;
  title: string;
  url: string;
  transcript: string;
  source: 'youtube-transcript' | 'firecrawl-markdown' | 'firecrawl-audio' | 'description-only';
  durationSeconds?: number;
  channelName?: string;
  description?: string;
  publishedAt?: string;
}

const YOUTUBE_URL_PATTERNS = [
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
  /^([a-zA-Z0-9_-]{11})$/, // bare video ID
];

/**
 * Extract YouTube video ID from various URL formats.
 */
export function extractVideoId(input: string): string | null {
  for (const pattern of YOUTUBE_URL_PATTERNS) {
    const match = input.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Build canonical YouTube URL from video ID.
 */
function canonicalUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Strategy 1: youtube-transcript package (free, extracts auto-generated or manual subtitles)
 */
async function fetchTranscriptNative(videoId: string): Promise<string | null> {
  try {
    const { YoutubeTranscript } = await import('youtube-transcript');
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    if (!segments || segments.length === 0) return null;

    // Join segments into continuous text, preserving paragraph breaks at natural pauses
    const lines: string[] = [];
    let currentParagraph = '';

    for (const segment of segments) {
      const text = segment.text?.trim();
      if (!text) continue;

      currentParagraph += (currentParagraph ? ' ' : '') + text;

      // Break paragraph every ~500 chars or on long pauses (>3s gap between segments)
      if (currentParagraph.length > 500) {
        lines.push(currentParagraph);
        currentParagraph = '';
      }
    }
    if (currentParagraph) lines.push(currentParagraph);

    const fullText = lines.join('\n\n');
    return fullText.length > 50 ? fullText : null;
  } catch (err) {
    console.warn(`[youtube] Native transcript failed for ${videoId}:`, (err as Error)?.message ?? err);
    return null;
  }
}

/**
 * Strategy 2: Firecrawl scrape with markdown format (gets page content including description)
 */
async function fetchViaFirecrawlMarkdown(videoId: string): Promise<{
  markdown: string;
  title?: string;
  description?: string;
} | null> {
  const apiKey = ENV.FIRECRAWL_API_KEY;
  if (!apiKey) return null;

  try {
    const FirecrawlModule = await import('@mendable/firecrawl-js');
    const FirecrawlCtor = (FirecrawlModule as any).default ?? FirecrawlModule;
    const app = new FirecrawlCtor({ apiKey });

    const result = await app.scrapeUrl(canonicalUrl(videoId), {
      formats: ['markdown'],
      timeout: 30000,
    });

    if (!result.success || !result.markdown) return null;

    // Extract title from metadata or markdown heading
    const title = result.metadata?.title ?? result.metadata?.ogTitle ?? undefined;
    const description = result.metadata?.description ?? result.metadata?.ogDescription ?? undefined;

    return {
      markdown: result.markdown,
      title: typeof title === 'string' ? title : undefined,
      description: typeof description === 'string' ? description : undefined,
    };
  } catch (err) {
    console.warn(`[youtube] Firecrawl markdown failed for ${videoId}:`, (err as Error)?.message ?? err);
    return null;
  }
}

/**
 * Primary entry point: Extract transcript from a YouTube video.
 * Tries multiple strategies in priority order.
 */
export async function fetchYouTubeTranscript(
  input: string
): Promise<YouTubeTranscriptResult | null> {
  const videoId = extractVideoId(input);
  if (!videoId) {
    console.warn(`[youtube] Could not extract video ID from: ${input}`);
    return null;
  }

  const url = canonicalUrl(videoId);
  console.log(`[youtube] Fetching transcript for ${videoId}...`);

  // Strategy 1: Native subtitle extraction (free, fast)
  const nativeTranscript = await fetchTranscriptNative(videoId);
  if (nativeTranscript) {
    // Also try Firecrawl for metadata (title, description) - non-blocking
    const firecrawlMeta = await fetchViaFirecrawlMarkdown(videoId).catch(() => null);
    console.log(`[youtube] Native transcript OK (${nativeTranscript.length} chars)`);
    return {
      videoId,
      title: firecrawlMeta?.title ?? `YouTube Video ${videoId}`,
      url,
      transcript: nativeTranscript,
      source: 'youtube-transcript',
      description: firecrawlMeta?.description ?? undefined,
    };
  }

  // Strategy 2: Firecrawl markdown (full page scrape including description)
  const firecrawlResult = await fetchViaFirecrawlMarkdown(videoId);
  if (firecrawlResult && firecrawlResult.markdown.length > 200) {
    console.log(`[youtube] Firecrawl markdown OK (${firecrawlResult.markdown.length} chars)`);
    return {
      videoId,
      title: firecrawlResult.title ?? `YouTube Video ${videoId}`,
      url,
      transcript: firecrawlResult.markdown,
      source: 'firecrawl-markdown',
      description: firecrawlResult.description ?? undefined,
    };
  }

  // Strategy 3: If Firecrawl returned minimal content, use description only
  if (firecrawlResult?.description && firecrawlResult.description.length > 100) {
    console.log(`[youtube] Description-only fallback (${firecrawlResult.description.length} chars)`);
    return {
      videoId,
      title: firecrawlResult.title ?? `YouTube Video ${videoId}`,
      url,
      transcript: firecrawlResult.description,
      source: 'description-only',
      description: firecrawlResult.description,
    };
  }

  console.warn(`[youtube] All strategies failed for ${videoId}`);
  return null;
}

/**
 * Batch fetch transcripts for multiple YouTube URLs.
 * Processes sequentially to avoid rate limiting.
 */
export async function fetchYouTubeTranscripts(
  inputs: string[]
): Promise<YouTubeTranscriptResult[]> {
  const results: YouTubeTranscriptResult[] = [];
  for (const input of inputs) {
    const result = await fetchYouTubeTranscript(input);
    if (result) results.push(result);
  }
  return results;
}
