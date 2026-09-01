import { ENV } from '$lib/server/env.server.js';
import { validateExternalUrl } from '$lib/server/security/url-validator.js';

export interface WebEvidenceSidecarDocument {
  url: string;
  title: string;
  text: string;
  sourceRevision: string;
  provider: string;
  extractedAt: string;
  canonicalAuthority: false;
  writesPerformed: false;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function stringValue(record: UnknownRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function booleanValue(record: UnknownRecord, ...keys: string[]): boolean | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
  }
  return null;
}

function collectText(record: UnknownRecord): string {
  const direct = stringValue(record, 'text', 'content', 'markdown');
  if (direct) return direct;

  const chunks = record.chunks;
  if (!Array.isArray(chunks)) return '';

  return chunks
    .map((chunk) => {
      if (typeof chunk === 'string') return chunk;
      const item = asRecord(chunk);
      return item ? stringValue(item, 'text', 'content', 'markdown') ?? '' : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function getSidecarBaseUrl(): string {
  return (
    ENV.NLP_SIDECAR_URL?.trim() ||
    ENV.MINIFORGE_SIDECAR_URL?.trim() ||
    ENV.LANGEXTRACT_URL?.trim() ||
    'http://127.0.0.1:8095'
  ).replace(/\/$/, '');
}

/**
 * Read-only acquisition through the bounded Pydantic/FastAPI web-evidence route.
 *
 * This is not an evidence-promotion boundary. The adapter rejects any response
 * that claims canonical authority or reports writes, and requires the Python
 * sidecar to provide a content-derived source revision before the result is
 * admitted to the TypeScript LDR pipeline.
 */
export async function fetchWebEvidenceFromSidecar(
  url: string,
  options: { maximumChunks?: number; provider?: 'beautifulsoup' | 'firecrawl' } = {}
): Promise<WebEvidenceSidecarDocument | null> {
  const urlCheck = validateExternalUrl(url);
  if (!urlCheck.valid) {
    throw new Error(urlCheck.error ?? 'invalid_url');
  }

  const body: Record<string, unknown> = {
    url,
    maximum_chunks: Math.max(1, Math.min(options.maximumChunks ?? 8, 32)),
  };
  if (options.provider) body.provider = options.provider;

  let response: Response;
  try {
    response = await fetch(`${getSidecarBaseUrl()}/evidence/web`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return null;
  }

  const record = asRecord(parsed);
  if (!record) return null;

  const sourceRevision = stringValue(record, 'source_revision', 'sourceRevision');
  const canonicalAuthority = booleanValue(record, 'canonical_authority', 'canonicalAuthority');
  const writesPerformed = booleanValue(record, 'writes_performed', 'writesPerformed');
  const text = collectText(record);

  if (!sourceRevision || canonicalAuthority !== false || writesPerformed !== false || !text.trim()) {
    return null;
  }

  return {
    url: stringValue(record, 'url', 'source_ref', 'sourceRef') ?? url,
    title: stringValue(record, 'title') ?? 'Untitled',
    text,
    sourceRevision,
    provider: stringValue(record, 'provider', 'source') ?? 'beautifulsoup',
    extractedAt:
      stringValue(record, 'extracted_at', 'extractedAt', 'fetched_at', 'fetchedAt') ??
      new Date().toISOString(),
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
