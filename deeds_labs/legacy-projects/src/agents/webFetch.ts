// src/agents/webFetch.ts
import fetch from 'node-fetch';

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT ?? 'http://localhost:4002';
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY ?? 'minioadmin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY ?? 'minioadmin';
const MINIO_BUCKET = process.env.MINIO_BUCKET ?? 'web-crawls';

export interface FetchedPage {
  url: string;
  status: number;
  html: string;
  text: string;
  minioKey?: string; // Optional MinIO storage key
}

/**
 * Optional: Upload crawled data to MinIO bucket for persistence
 */
async function uploadToMinIO(key: string, data: string): Promise<void> {
  // Note: This is a simplified example. For production, use @aws-sdk/client-s3
  // Install: npm install @aws-sdk/client-s3
  // Then use S3Client with MinIO endpoint

  const url = `${MINIO_ENDPOINT}/${MINIO_BUCKET}/${key}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      // In production, add proper AWS S3 auth headers
    },
    body: JSON.stringify({ data, timestamp: new Date().toISOString() }),
  });

  if (!response.ok) {
    console.warn(`⚠️ MinIO upload failed for ${key}: ${response.status}`);
  } else {
    console.log(`✅ Uploaded to MinIO: ${key}`);
  }
}

/**
 * Very simple HTML → text cleaner.
 * For better quality you can later swap in a library like "node-readability"
 * or "unified + rehype-parse + remark-stringify".
 */
function stripHtml(html: string): string {
  // Remove scripts/styles
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Remove tags
  html = html.replace(/<\/?[^>]+(>|$)/g, '');
  // Collapse whitespace
  html = html.replace(/\s+/g, ' ');
  return html.trim();
}

export async function fetchAndParse(url: string, storeInMinIO: boolean = false): Promise<FetchedPage> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'YoRHaLegalAI/1.0 (+https://localhost)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  const html = await res.text();
  const text = stripHtml(html);

  const page: FetchedPage = {
    url,
    status: res.status,
    html,
    text,
  };

  if (storeInMinIO) {
    const key = `crawl-${Date.now()}-${Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '')}.json`;
    try {
      await uploadToMinIO(key, JSON.stringify(page));
      page.minioKey = key;
    } catch (error) {
      console.warn(`⚠️ Failed to store in MinIO:`, error);
    }
  }

  return page;
}

/**
 * Optional: tiny "one-hop" crawler: fetch a page, pull out same-domain links.
 */
export async function crawlOneLevel(
  url: string,
  maxLinks = 5,
): Promise<{ root: FetchedPage; links: FetchedPage[] }> {
  const root = await fetchAndParse(url);

  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  const links: string[] = [];
  let match: RegExpExecArray | null;

  const origin = new URL(url).origin;

  while ((match = linkRegex.exec(root.html)) !== null && links.length < maxLinks) {
    const href = match[1];
    if (!href || href.startsWith('#') || href.startsWith('mailto:')) continue;
    let absolute: string;
    try {
      absolute = new URL(href, origin).toString();
    } catch {
      continue;
    }
    if (!absolute.startsWith(origin)) continue;
    if (!links.includes(absolute)) links.push(absolute);
  }

  const fetchedLinks: FetchedPage[] = [];
  for (const link of links) {
    try {
      fetchedLinks.push(await fetchAndParse(link));
    } catch {
      // ignore individual failures
    }
  }

  return { root, links: fetchedLinks };
}