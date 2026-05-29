import { existsSync } from 'fs';
import { config as loadEnv } from 'dotenv';
import { JSDOM } from 'jsdom';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import { generateSparseVector } from '../src/lib/server/vector/bm42-sparse.ts';

for (const envFile of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  const envPath = resolve(process.cwd(), envFile);
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }
}

interface BuilderOptions {
  query: string;
  maxWebResults: number;
  wikiLimit: number;
  chunkSize: number;
  overlap: number;
  collection: string;
  dryRun: boolean;
  seedUrls: string[];
  youtubeUrls: string[];
  useWebSearch: boolean;
  useWikipedia: boolean;
}

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: 'google' | 'duckduckgo' | 'searxng';
}

interface WikipediaResult {
  title: string;
  snippet: string;
  url: string;
  pageId: number;
}

interface SourceDocument {
  title: string;
  url: string;
  content: string;
  source: string;
}

const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const SEARXNG_URL = process.env.SEARXNG_URL;
const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_SEARCH_CX = process.env.GOOGLE_SEARCH_CX;

const qdrant = new QdrantClient({ url: QDRANT_URL });
let collectionSupportsSparse: boolean | null = null;

function parseArgs(argv: string[]): BuilderOptions {
  const options: BuilderOptions = {
    query: 'Karpathy LLM wiki',
    maxWebResults: 5,
    wikiLimit: 3,
    chunkSize: 900,
    overlap: 150,
    collection: 'knowledge_base',
    dryRun: false,
    seedUrls: [],
    youtubeUrls: [],
    useWebSearch: true,
    useWikipedia: true,
  };
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--query' && next) {
      options.query = next;
      index += 1;
    } else if (arg === '--max-web-results' && next) {
      options.maxWebResults = Number(next);
      index += 1;
    } else if (arg === '--wiki-limit' && next) {
      options.wikiLimit = Number(next);
      index += 1;
    } else if (arg === '--chunk-size' && next) {
      options.chunkSize = Number(next);
      index += 1;
    } else if (arg === '--overlap' && next) {
      options.overlap = Number(next);
      index += 1;
    } else if (arg === '--collection' && next) {
      options.collection = next;
      index += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--seed-url' && next) {
      options.seedUrls.push(next);
      index += 1;
    } else if (arg === '--youtube' && next) {
      options.youtubeUrls.push(next);
      index += 1;
    } else if (arg === '--no-web') {
      options.useWebSearch = false;
    } else if (arg === '--no-wikipedia') {
      options.useWikipedia = false;
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    let wikiLimitFromTail: number | undefined;
    let maxWebFromTail: number | undefined;
    const queryParts = [...positional];

    const last = queryParts.at(-1);
    if (last && /^\d+$/.test(last)) {
      wikiLimitFromTail = Number(last);
      queryParts.pop();
    }

    const nextTail = queryParts.at(-1);
    if (nextTail && /^\d+$/.test(nextTail)) {
      maxWebFromTail = Number(nextTail);
      queryParts.pop();
    }

    if (queryParts.length > 0 && options.query === 'Karpathy LLM wiki') {
      options.query = queryParts.join(' ');
    }
    if (typeof maxWebFromTail === 'number') {
      options.maxWebResults = maxWebFromTail;
    }
    if (typeof wikiLimitFromTail === 'number') {
      options.wikiLimit = wikiLimitFromTail;
    }
  }

  return options;
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    headers: {
      'User-Agent': 'DeedsLegalAI/1.0 (knowledge builder)',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  return response.json();
}

async function searxngSearch(query: string, maxResults: number): Promise<WebSearchResult[]> {
  if (!SEARXNG_URL) {
    return [];
  }

  const searchUrl = new URL('/search', SEARXNG_URL);
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('format', 'json');
  searchUrl.searchParams.set('categories', 'general');

  const data = await fetchJson(searchUrl.toString());
  if (!Array.isArray(data.results)) {
    return [];
  }

  return data.results.slice(0, maxResults).map((result: Record<string, unknown>) => ({
    title: String(result.title ?? ''),
    url: String(result.url ?? ''),
    snippet: String(result.content ?? ''),
    source: 'searxng' as const,
  }));
}

async function googleSearch(query: string, maxResults: number): Promise<WebSearchResult[]> {
  if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_CX) {
    return [];
  }

  const params = new URLSearchParams({
    key: GOOGLE_SEARCH_API_KEY,
    cx: GOOGLE_SEARCH_CX,
    q: query,
    num: String(Math.min(maxResults, 10)),
  });

  const data = await fetchJson(`https://www.googleapis.com/customsearch/v1?${params}`);
  const items = Array.isArray(data.items) ? data.items : [];

  return items.slice(0, maxResults).map((item: Record<string, unknown>) => ({
    title: String(item.title ?? ''),
    url: String(item.link ?? ''),
    snippet: String(item.snippet ?? ''),
    source: 'google' as const,
  }));
}

async function duckDuckGoSearch(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    no_html: '1',
    skip_disambig: '1',
  });

  const data = await fetchJson(`https://api.duckduckgo.com/?${params}`);
  const results: WebSearchResult[] = [];

  if (data.Abstract && data.AbstractURL) {
    results.push({
      title: String(data.Heading ?? query),
      url: String(data.AbstractURL),
      snippet: String(data.Abstract),
      source: 'duckduckgo',
    });
  }

  const relatedTopics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
  for (const topic of relatedTopics) {
    if (results.length >= maxResults) {
      break;
    }

    if (topic && typeof topic === 'object' && 'Text' in topic && 'FirstURL' in topic) {
      results.push({
        title: String((topic as Record<string, unknown>).Text ?? '').slice(0, 100),
        url: String((topic as Record<string, unknown>).FirstURL ?? ''),
        snippet: String((topic as Record<string, unknown>).Text ?? ''),
        source: 'duckduckgo',
      });
    }
  }

  return results.slice(0, maxResults);
}

async function searchWeb(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const searxResults = await searxngSearch(query, maxResults).catch(() => []);
  if (searxResults.length > 0) {
    return searxResults;
  }

  const googleResults = await googleSearch(query, maxResults).catch(() => []);
  if (googleResults.length > 0) {
    return googleResults;
  }

  return duckDuckGoSearch(query, maxResults).catch(() => []);
}

async function searchWikipedia(query: string, limit: number): Promise<WikipediaResult[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: String(Math.min(limit, 10)),
    srprop: 'snippet',
    format: 'json',
    origin: '*',
  });

  const data = await fetchJson(`https://en.wikipedia.org/w/api.php?${params}`);
  const items = Array.isArray(data?.query?.search) ? data.query.search : [];

  return items.map((item: Record<string, unknown>) => ({
    title: String(item.title ?? ''),
    snippet: String(item.snippet ?? '').replace(/<[^>]*>/g, ''),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(item.title ?? '').replace(/ /g, '_'))}`,
    pageId: Number(item.pageid ?? 0),
  }));
}

async function getWikipediaExcerpt(pageId: number, maxChars: number = 1800): Promise<string> {
  const params = new URLSearchParams({
    action: 'query',
    pageids: String(pageId),
    prop: 'extracts',
    exintro: '1',
    explaintext: '1',
    exchars: String(maxChars),
    format: 'json',
    origin: '*',
  });

  const data = await fetchJson(`https://en.wikipedia.org/w/api.php?${params}`);
  const pages = data?.query?.pages ?? {};
  const page = pages[String(pageId)];
  return String(page?.extract ?? '');
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

async function fetchPageText(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) {
    return '';
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    headers: {
      'User-Agent': 'DeedsLegalAI/1.0 (knowledge builder)',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const body = await response.text();

  if (contentType.includes('text/plain')) {
    return normalizeWhitespace(body);
  }

  const dom = new JSDOM(body);
  const document = dom.window.document;
  for (const selector of ['script', 'style', 'noscript', 'svg']) {
    document.querySelectorAll(selector).forEach((node) => node.remove());
  }

  const main = document.querySelector('main, article, [role="main"]') ?? document.body;
  return normalizeWhitespace(main?.textContent ?? '');
}

function deriveTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split('/').filter(Boolean).at(-1) ?? parsed.hostname;
    return decodeURIComponent(lastSegment.replace(/[-_]/g, ' '));
  } catch {
    return url;
  }
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += chunkSize - overlap) {
    const chunk = text.slice(index, index + chunkSize).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }
  return chunks;
}

async function ensureKnowledgeCollection(collection: string): Promise<void> {
  try {
    const existing = await qdrant.getCollection(collection);
    const sparseConfig = (existing as { config?: { sparse_vectors?: Record<string, unknown> } })
      ?.config?.sparse_vectors;
    collectionSupportsSparse = Boolean(
      sparseConfig && typeof sparseConfig === 'object' && Object.keys(sparseConfig).length > 0
    );
    if (!collectionSupportsSparse) {
      try {
        await qdrant.updateCollection(collection, {
          sparse_vectors: { bm25: {} },
        });
        collectionSupportsSparse = true;
        console.log('[kb-builder] Added sparse vector support to existing collection');
      } catch {
        console.warn('[kb-builder] Could not add sparse vectors; using dense-only');
      }
    }
    return;
  } catch {
    console.log('[kb-builder] Creating new collection with dense + sparse vectors');
    await qdrant.createCollection(collection, {
      vectors: {
        size: 768,
        distance: 'Cosine',
      },
      sparse_vectors: {
        bm25: {},
      },
    });
    collectionSupportsSparse = true;
  }
}

async function upsertPoint(
  collection: string,
  pointId: string,
  embedding: number[],
  sparse: ReturnType<typeof generateSparseVector>,
  payload: Record<string, unknown>
): Promise<void> {
  const EXPECTED_DIM = Number(process.env.EMBED_DIM ?? '768');
  if (!Array.isArray(embedding) || embedding.length !== EXPECTED_DIM) {
    console.warn(
      `[kb-builder] Skipping upsert for ${pointId}: invalid embedding dimension ${Array.isArray(embedding) ? embedding.length : typeof embedding} (expected ${EXPECTED_DIM})`
    );
    return;
  }
  if (collectionSupportsSparse !== false) {
    try {
      await qdrant.upsert(collection, {
        points: [
          {
            id: pointId,
            vector: {
              '': embedding,
              bm25: sparse,
            },
            payload,
          },
        ],
      });
      collectionSupportsSparse = true;
      return;
    } catch (error) {
      collectionSupportsSparse = false;
      console.warn(
        '[kb-builder] sparse upsert unavailable; retrying dense-only:',
        error instanceof Error ? error.message : error
      );
    }
  }

  await qdrant.upsert(collection, {
    points: [
      {
        id: pointId,
        vector: embedding,
        payload,
      },
    ],
  });
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: text.slice(0, 8_000),
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed: ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data.embedding)) {
    throw new Error('Embedding response missing vector');
  }

  return data.embedding as number[];
}

function buildPointId(url: string, chunkIndex: number): string {
  // Qdrant requires UUID-format string IDs — derive a deterministic UUID from content hash
  const hex = createHash('sha1').update(`${url}#${chunkIndex}`).digest('hex');
  // Format first 32 hex chars as UUID v4-like: 8-4-4-4-12
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function collectDocuments(
  query: string,
  maxWebResults: number,
  wikiLimit: number
): Promise<SourceDocument[]> {
  const documents: SourceDocument[] = [];
  const seenUrls = new Set<string>();

  const webResults = await searchWeb(query, maxWebResults);
  for (const result of webResults) {
    if (!result.url || seenUrls.has(result.url)) {
      continue;
    }

    try {
      const content = await fetchPageText(result.url);
      if (content.length < 400) {
        continue;
      }

      seenUrls.add(result.url);
      documents.push({
        title: result.title,
        url: result.url,
        content,
        source: result.source,
      });
    } catch (error) {
      console.warn(
        `[kb-builder] Skipped ${result.url}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  const wikiResults = await searchWikipedia(query, wikiLimit);
  for (const result of wikiResults) {
    if (!result.url || seenUrls.has(result.url)) {
      continue;
    }

    try {
      const excerpt = await getWikipediaExcerpt(result.pageId);
      if (excerpt.length < 200) {
        continue;
      }

      seenUrls.add(result.url);
      documents.push({
        title: result.title,
        url: result.url,
        content: excerpt,
        source: 'wikipedia',
      });
    } catch (error) {
      console.warn(
        `[kb-builder] Skipped Wikipedia page ${result.title}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return documents;
}

async function collectSeedDocuments(seedUrls: string[]): Promise<SourceDocument[]> {
  const documents: SourceDocument[] = [];

  for (const url of seedUrls) {
    try {
      const content = await fetchPageText(url);
      if (content.length < 200) {
        continue;
      }

      documents.push({
        title: deriveTitleFromUrl(url),
        url,
        content,
        source: 'seed-url',
      });
    } catch (error) {
      console.warn(
        `[kb-builder] Skipped seed URL ${url}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return documents;
}

async function collectYouTubeDocuments(urls: string[]): Promise<SourceDocument[]> {
  if (urls.length === 0) return [];
  const documents: SourceDocument[] = [];

  // Dynamic import — youtube-transcript.ts uses ENV which may not be available in script context
  // We use the youtube-transcript npm package directly here
  let YTTranscript: any;
  try {
    YTTranscript = await import('youtube-transcript');
  } catch {
    console.warn('[kb-builder] youtube-transcript package not available, skipping YouTube sources');
    return [];
  }

  for (const url of urls) {
    try {
      // Extract video ID
      let videoId: string | null = null;
      const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      const bareMatch = url.match(/^([a-zA-Z0-9_-]{11})$/);
      videoId = watchMatch?.[1] ?? shortMatch?.[1] ?? bareMatch?.[1] ?? null;

      if (!videoId) {
        console.warn(`[kb-builder] Could not parse video ID from: ${url}`);
        continue;
      }

      console.log(`[kb-builder] Fetching YouTube transcript: ${videoId}`);
      const segments = await YTTranscript.YoutubeTranscript.fetchTranscript(videoId);
      if (!segments || segments.length === 0) {
        console.warn(`[kb-builder] No transcript found for ${videoId}`);
        continue;
      }

      // Join segments into paragraphs
      let transcript = '';
      for (const seg of segments) {
        const text = String(seg.text ?? '').trim();
        if (!text) continue;
        transcript += text + ' ';
        if (transcript.length > 0 && transcript.length % 500 < text.length) {
          transcript += '\n\n';
        }
      }
      transcript = transcript.trim();

      if (transcript.length < 100) {
        console.warn(
          `[kb-builder] Transcript too short for ${videoId} (${transcript.length} chars)`
        );
        continue;
      }

      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      documents.push({
        title: `YouTube: ${videoId}`,
        url: videoUrl,
        content: transcript,
        source: 'youtube',
      });
      console.log(`[kb-builder] YouTube transcript: ${videoId} (${transcript.length} chars)`);
    } catch (error) {
      console.warn(
        `[kb-builder] Skipped YouTube ${url}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return documents;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(
    `[kb-builder] query="${options.query}" collection=${options.collection} dryRun=${options.dryRun}`
  );

  const seededDocuments = await collectSeedDocuments(options.seedUrls);
  const youtubeDocuments = await collectYouTubeDocuments(options.youtubeUrls);
  const searchedDocuments =
    options.useWebSearch || options.useWikipedia
      ? await collectDocuments(
          options.query,
          options.useWebSearch ? options.maxWebResults : 0,
          options.useWikipedia ? options.wikiLimit : 0
        )
      : [];

  const documents = [...seededDocuments, ...youtubeDocuments, ...searchedDocuments].filter(
    (document, index, all) => all.findIndex((candidate) => candidate.url === document.url) === index
  );
  const chunks = documents.flatMap((document) => {
    const documentChunks = chunkText(document.content, options.chunkSize, options.overlap);
    return documentChunks.map((chunk, chunkIndex) => ({
      document,
      chunk,
      chunkIndex,
      chunkCount: documentChunks.length,
    }));
  });

  console.log(`[kb-builder] documents=${documents.length} chunks=${chunks.length}`);
  if (documents.length === 0 || chunks.length === 0) {
    throw new Error('No source documents were collected');
  }

  if (options.dryRun) {
    for (const preview of chunks.slice(0, 5)) {
      console.log(
        `[kb-builder] preview ${preview.document.source} ${preview.document.url} chunk=${preview.chunkIndex} chars=${preview.chunk.length}`
      );
    }
    return;
  }

  await ensureKnowledgeCollection(options.collection);

  let indexed = 0;
  for (const item of chunks) {
    const embedding = await generateEmbedding(item.chunk);
    const sparse = generateSparseVector(item.chunk);
    const pointId = buildPointId(item.document.url, item.chunkIndex);

    await upsertPoint(options.collection, pointId, embedding, sparse, {
      document_name: item.document.title,
      content: item.chunk,
      source: item.document.source,
      source_url: item.document.url,
      topic: options.query,
      chunk_index: item.chunkIndex,
      chunk_count: item.chunkCount,
      indexed_at: new Date().toISOString(),
      text: item.chunk.slice(0, 500),
    });

    indexed += 1;
    if (indexed % 10 === 0 || indexed === chunks.length) {
      console.log(`[kb-builder] indexed ${indexed}/${chunks.length}`);
    }
  }

  console.log(`[kb-builder] complete indexed=${indexed} collection=${options.collection}`);
}

main().catch((error) => {
  console.error('[kb-builder] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});