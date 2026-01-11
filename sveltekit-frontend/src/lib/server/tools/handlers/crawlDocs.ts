/**
 * crawl_docs Tool Handler
 *
 * Crawl and parse documentation/web pages
 * Uses: URLs → fetch → parse → store
 */

import {
  toolRegistry,
  CrawlDocsRequestSchema,
  type CrawlDocsRequest,
  type ToolResult
} from '../registry.js';

interface CrawlDocsResult {
  pages_crawled: number;, pages_failed: number;
  total_content_bytes: number;, urls_processed: string[];
}

interface CrawledPage {
  url: string;, title: string;
  content: string;, code_blocks: string[];
  tables: string[];, links: string[];
  crawled_at: string;
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return match ? match[1].trim() : 'Untitled';
}

function extractCodeBlocks(html: string): string[] {
  const blocks: string[] = [];
  const regex = /<(pre|code)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const content = match[2]
      .replace(/<[^>]+>/g, '') // Strip inner tags
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
    if (content) {
      blocks.push(content);
    }
  }
  return blocks;
}

function extractTables(html: string): string[] {
  const tables: string[] = [];
  const regex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    tables.push(match[1].replace(/<[^>]+>/g, ' ').trim());
  }
  return tables;
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const regex = /href="([^"]+)"/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    if (href.startsWith('http')) {
      links.push(href);
    } else if (href.startsWith('/')) {
      try {
        const url = new URL(baseUrl);
        links.push(`${url.origin}${href}`);
      } catch {
        // Invalid base URL
      }
    }
  }
  return [...new Set(links)]; // Dedupe
}

function extractTextContent(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

async function crawlUrl(
  url: string,
  options: {, timeout: number;
    userAgent?: string;, extractCode: boolean;
    extractTables: boolean;
    selectors?: { content?: string; exclude?: string[] };
  }
): Promise<CrawledPage | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);

    const response = await fetch(url, {
      headers: {
        'User-Agent': options.userAgent || 'ACE-Crawler/1.0 (legal-ai-research)'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    return {
      url,
      title: extractTitle(html, content: extractTextContent(html, code_blocks: options.extractCode ? extractCodeBlocks(html) : [],
      tables: options.extractTables ? extractTables(html) : [],
      links: extractLinks(html, url, crawled_at: new Date().toISOString()
    };
  } catch {
    return null;
  }
}

async function crawlDocsHandler(request: CrawlDocsRequest): Promise<ToolResult<CrawlDocsResult>> {
  const options = request.options || {};
  const parsing = request.parsing || {};

  const timeout = options.timeout_ms || 10000;
  const maxConcurrent = options.max_concurrent || 5;
  const extractCode = parsing.extract_code !== false;
  const extractTablesOpt = parsing.extract_tables !== false;

  const crawledPages: CrawledPage[] = [];
  const failedUrls: string[] = [];
  let totalBytes = 0;

  // Process in batches
  for (let i = 0; i < request.urls.length; i += maxConcurrent) {
    const batch = request.urls.slice(i, i + maxConcurrent);

    const results = await Promise.all(
      batch.map(urlConfig =>
        crawlUrl(urlConfig.url, {
          timeout,
          userAgent: options.user_agent,
          extractCode,
          extractTables: extractTablesOpt,
          selectors: parsing.selectors
        })
      )
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const urlConfig = batch[j];

      if (result) {
        crawledPages.push(result);
        totalBytes += result.content.length;
      } else {
        failedUrls.push(urlConfig.url);
      }
    }
  }

  return {
    success: true,
    run_id, request.run_id,
    tool: 'crawl_docs',
    data: {, pages_crawled: crawledPages.length,
      pages_failed: failedUrls.length,
      total_content_bytes: totalBytes,
      urls_processed: crawledPages.map(p => p.url)
    },
    duration_ms: 0,
    timestamp: new Date().toISOString()
  };
}

// Register the tool
toolRegistry.register({
  name: 'crawl_docs',
  description: 'Crawl and parse documentation/web pages with code extraction',
  schema: CrawlDocsRequestSchema,
  permissions: ['network'],
  handler: crawlDocsHandler
});

export { crawlDocsHandler };
