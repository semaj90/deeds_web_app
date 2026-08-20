import { createHash } from 'node:crypto';
import {
  archiveExternalDocCapture,
  externalDocPageCaptureSchema,
  type ArchivedExternalDocCaptureV1,
} from '@deeds/parent-atlas';
import { ENV } from '../../env.server.js';
import { createSeaweedColdObjectStore } from './seaweed-cold-object-store.js';

export type FirecrawlV2CaptureOptions = {
  sourceId: string;
  sourceRevision: string;
  url: string;
  namespace: string;
  endpointId?: string;
  bucket?: string;
  parserRevision?: string;
  producerRevision?: string;
  maximumAgeMs?: number;
  timeoutMs?: number;
};

type FirecrawlScrapeData = {
  markdown?: string;
  rawHtml?: string;
  screenshot?: string;
  links?: string[];
  changeTracking?: { changeStatus?: string } | Record<string, unknown>;
  metadata?: {
    title?: string;
    sourceURL?: string;
    url?: string;
    statusCode?: number;
    language?: string;
    [key: string]: unknown;
  };
};

function requireFirecrawlKey(): string {
  if (!ENV.FIRECRAWL_API_KEY) throw new Error('FIRECRAWL_API_KEY is not configured');
  return ENV.FIRECRAWL_API_KEY;
}

function deterministicCaptureId(input: {
  sourceId: string;
  sourceRevision: string;
  resolvedUrl: string;
  markdown: string;
}): string {
  const documentChecksum = createHash('sha256').update(input.markdown, 'utf8').digest('hex');
  const identity = createHash('sha256')
    .update(JSON.stringify({
      source_id: input.sourceId,
      source_revision: input.sourceRevision,
      resolved_url: input.resolvedUrl,
      document_checksum: documentChecksum,
    }), 'utf8')
    .digest('hex');
  return `firecrawl:${input.sourceId}:${identity.slice(0, 32)}`;
}

function screenshotMediaType(bytes: Uint8Array): string {
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return 'image/png';
}

async function decodeScreenshot(value: string | undefined, maximumBytes = 16 * 1024 * 1024): Promise<{ bytes: Uint8Array; mediaType: string } | null> {
  if (!value) return null;
  if (value.startsWith('data:')) {
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(value);
    if (!match) throw new Error('FIRECRAWL_SCREENSHOT_DATA_URL_INVALID');
    const bytes = new Uint8Array(Buffer.from(match[2], 'base64'));
    if (bytes.byteLength > maximumBytes) throw new Error('FIRECRAWL_SCREENSHOT_TOO_LARGE');
    return { bytes, mediaType: match[1] };
  }
  const response = await fetch(value, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`FIRECRAWL_SCREENSHOT_FETCH_FAILED:${response.status}`);
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (declaredLength > maximumBytes) throw new Error('FIRECRAWL_SCREENSHOT_TOO_LARGE');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) throw new Error('FIRECRAWL_SCREENSHOT_TOO_LARGE');
  return {
    bytes,
    mediaType: response.headers.get('content-type')?.split(';')[0] || screenshotMediaType(bytes),
  };
}

export async function captureExternalDocWithFirecrawlV2(options: FirecrawlV2CaptureOptions): Promise<ArchivedExternalDocCaptureV1> {
  const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireFirecrawlKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: options.url,
      formats: ['markdown', 'rawHtml', 'links', 'screenshot', 'changeTracking'],
      onlyMainContent: true,
      maxAge: options.maximumAgeMs ?? 86_400_000,
      timeout: options.timeoutMs ?? 60_000,
      removeBase64Images: true,
      blockAds: true,
      storeInCache: true,
    }),
    signal: AbortSignal.timeout((options.timeoutMs ?? 60_000) + 5_000),
  });
  const payload = await response.json() as { success?: boolean; data?: FirecrawlScrapeData; error?: string };
  if (!response.ok || payload.success === false || !payload.data) {
    throw new Error(`FIRECRAWL_V2_SCRAPE_FAILED:${response.status}:${payload.error ?? 'unknown'}`);
  }

  const data = payload.data;
  if (!data.markdown?.trim()) throw new Error('FIRECRAWL_V2_MARKDOWN_MISSING');
  const screenshot = await decodeScreenshot(data.screenshot);
  const resolvedUrl = data.metadata?.sourceURL ?? data.metadata?.url ?? options.url;
  const title = data.metadata?.title?.trim() || new URL(resolvedUrl).hostname;
  const changeStatus = data.changeTracking && typeof data.changeTracking === 'object'
    ? ('changeStatus' in data.changeTracking && typeof data.changeTracking.changeStatus === 'string' ? data.changeTracking.changeStatus : null)
    : null;
  const captureId = deterministicCaptureId({
    sourceId: options.sourceId,
    sourceRevision: options.sourceRevision,
    resolvedUrl,
    markdown: data.markdown,
  });

  const capture = externalDocPageCaptureSchema.parse({
    capture_id: captureId,
    source_id: options.sourceId,
    source_revision: options.sourceRevision,
    requested_url: options.url,
    resolved_url: resolvedUrl,
    title,
    language: data.metadata?.language ?? 'en',
    http_status: data.metadata?.statusCode ?? response.status,
    fetched_at: new Date().toISOString(),
    markdown: data.markdown,
    raw_html: data.rawHtml ?? null,
    screenshot_bytes: screenshot?.bytes ?? null,
    screenshot_media_type: screenshot?.mediaType ?? null,
    outgoing_urls: (data.links ?? []).filter((url): url is string => {
      try { new URL(url); return true; } catch { return false; }
    }),
    change_status: changeStatus,
    canonical_authority: false,
  });

  if (!ENV.SEAWEED_S3_BUCKET) throw new Error('SEAWEED_S3_BUCKET is not configured');
  return archiveExternalDocCapture({
    store: createSeaweedColdObjectStore(),
    capture,
    endpointId: options.endpointId ?? 'seaweed-s3',
    bucket: options.bucket ?? ENV.SEAWEED_S3_BUCKET,
    namespace: options.namespace,
    parserRevision: options.parserRevision ?? 'firecrawl-v2',
    producerRevision: options.producerRevision ?? 'parent-atlas-firecrawl-v2',
  });
}
