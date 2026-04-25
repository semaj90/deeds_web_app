/**
 * PDF Parser & Web Crawler Service
 * Handles document ingestion for Enhanced RAG system
 */

import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { redisVectorService, VectorDocument } from './redis-vector-service.js';

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: {
    title?: string;
    source: string;
    type: 'pdf' | 'web' | 'text';
    page?: number;
    chunk_index: number;
    timestamp: string;
    [key: string]: any;
  };
}

export interface ParsedDocument {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, any>;
  chunks: DocumentChunk[];
}

export interface CrawlOptions {
  maxPages?: number;
  followLinks?: boolean;
  waitTime?: number;
  selector?: string;
  excludePatterns?: RegExp[];
}

export class DocumentIngestionService {
  private maxChunkSize = 1000; // characters per chunk
  private chunkOverlap = 200; // overlap between chunks

  constructor() {}

  /**
   * Parse PDF file and extract text
   */
  async parsePDF(filePath: string, options: { maxPages?: number } = {}): Promise<ParsedDocument> {
    try {
      console.log(`📄 Parsing PDF: ${filePath}`);

      const fileBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(fileBuffer, {
        max: options.maxPages || 0, // 0 = all pages
      });

      const filename = path.basename(filePath, '.pdf');
      const documentId = this.generateDocumentId(filePath);

      const chunks = this.chunkText(pdfData.text, {
        source: filePath,
        type: 'pdf',
        title: filename,
        pages: pdfData.numpages,
      });

      const result: ParsedDocument = {
        id: documentId,
        title: filename,
        content: pdfData.text,
        metadata: {
          source: filePath,
          type: 'pdf',
          pages: pdfData.numpages,
          fileSize: fileBuffer.length,
          timestamp: new Date().toISOString(),
        },
        chunks,
      };

      console.log(`✅ PDF parsed: ${chunks.length} chunks from ${pdfData.numpages} pages`);
      return result;
    } catch (error) {
      console.error(`❌ Error parsing PDF ${filePath}:`, error);
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }

  /**
   * Crawl web page and extract content
   */
  async crawlWebPage(url: string, options: CrawlOptions = {}): Promise<ParsedDocument> {
    const browser = await chromium.launch({ headless: true });

    try {
      console.log(`🌐 Crawling webpage: ${url}`);

      const page = await browser.newPage();

      // Set user agent and viewport
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.setViewportSize({ width: 1200, height: 800 });

      await page.goto(url, { waitUntil: 'networkidle' });

      // Wait for additional time if specified
      if (options.waitTime) {
        await page.waitForTimeout(options.waitTime);
      }

      // Get page content
      const content = await page.content();
      const title = await page.title();

      // Parse with cheerio for better text extraction
      const $ = cheerio.load(content);

      // Remove scripts, styles, and other non-content elements
      $('script, style, nav, header, footer, aside, .ad, .advertisement').remove();

      // Extract text from specific selector if provided
      const textContent = options.selector ? $(options.selector).text() : $('body').text();

      const cleanText = this.cleanText(textContent);
      const documentId = this.generateDocumentId(url);

      const chunks = this.chunkText(cleanText, {
        source: url,
        type: 'web',
        title: title || 'Web Page',
      });

      const result: ParsedDocument = {
        id: documentId,
        title: title || 'Web Page',
        content: cleanText,
        metadata: {
          source: url,
          type: 'web',
          title,
          crawlDate: new Date().toISOString(),
          wordCount: cleanText.split(/\s+/).length,
        },
        chunks,
      };

      console.log(`✅ Web page crawled: ${chunks.length} chunks from ${url}`);
      return result;
    } catch (error) {
      console.error(`❌ Error crawling ${url}:`, error);
      throw new Error(`Failed to crawl webpage: ${error.message}`);
    } finally {
      await browser.close();
    }
  }

  /**
   * Crawl multiple pages from a website
   */
  async crawlWebsite(startUrl: string, options: CrawlOptions = {}): Promise<ParsedDocument[]> {
    const { maxPages = 10, followLinks = true, excludePatterns = [] } = options;
    const visited = new Set<string>();
    const toVisit = [startUrl];
    const results: ParsedDocument[] = [];

    const browser = await chromium.launch({ headless: true });

    try {
      while (toVisit.length > 0 && results.length < maxPages) {
        const url = toVisit.shift()!;

        if (visited.has(url)) continue;
        visited.add(url);

        // Check if URL matches exclude patterns
        if (excludePatterns.some((pattern) => pattern.test(url))) {
          console.log(`⏭️ Skipping excluded URL: ${url}`);
          continue;
        }

        try {
          const doc = await this.crawlWebPage(url, options);
          results.push(<any>(<any>doc));

          // Find additional links if followLinks is enabled
          if (followLinks && results.length < maxPages) {
            const page = await browser.newPage();
            await page.goto(url, { waitUntil: 'networkidle' });

            const links = await page.$$eval(
              'a[href]',
              (elements) =>
                elements
                  .map((el) => el.getAttribute('href'))
                  .filter((href) => href && href.startsWith('http'))
                  .slice(0, 5) // Limit links per page
            );

            // Add new links to visit
            links.forEach((link) => {
              if (!visited.has(link) && !toVisit.includes(link)) {
                toVisit.push(<any>(<any>link));
              }
            });

            await page.close();
          }
        } catch (error) {
          console.error(`❌ Error crawling ${url}:`, error);
        }
      }

      console.log(`✅ Website crawl complete: ${results.length} pages crawled`);
      return results;
    } finally {
      await browser.close();
    }
  }

  /**
   * Store document in vector database with embeddings
   */
  async storeDocument(
    document: ParsedDocument,
    embeddingFunction: (text: string) => Promise<number[]>
  ): Promise<void> {
    console.log(`💾 Storing document: ${document.title}`);

    const vectorDocs: VectorDocument[] = [];

    // Create vector documents for each chunk
    for (const chunk of document.chunks) {
      try {
        const embedding = await embeddingFunction(chunk.content);

        vectorDocs.push(<any>(<any>{
          id: chunk.id,
          embedding,
          metadata: chunk.metadata,
          content: chunk.content,
          ttl: 7200, // 2 hours default TTL
        }));
      } catch (error) {
        console.error(`❌ Error generating embedding for chunk ${chunk.id}:`, error);
      }
    }

    // Batch store all chunks
    if (vectorDocs.length > 0) {
      await redisVectorService.storeBatch(vectorDocs);
      console.log(`✅ Stored ${vectorDocs.length} chunks for document: ${document.title}`);
    }
  }

  /**
   * Chunk text into smaller pieces with overlap
   */
  private chunkText(text: string, baseMetadata: Record<string, any>): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const words = text.split(/\s+/);

    let currentChunk = '';
    let currentWords: string[] = [];
    let chunkIndex = 0;

    for (let i = 0; i < words.length; i++) {
      currentWords.push(<any>(<any>words[i]));
      currentChunk = currentWords.join(' ');

      // Check if chunk is large enough
      if (currentChunk.length >= this.maxChunkSize || i === words.length - 1) {
        if (currentChunk.trim()) {
          const chunkId = `${baseMetadata.source}_chunk_${chunkIndex}`;

          chunks.push(<any>(<any>{
            id: this.generateDocumentId(chunkId),
            content: currentChunk.trim(),
            metadata: {
              ...baseMetadata,
              chunk_index: chunkIndex,
              timestamp: new Date().toISOString(),
            },
          }));

          chunkIndex++;
        }

        // Start new chunk with overlap
        if (i < words.length - 1) {
          const overlapWords = Math.min(
            Math.floor(this.chunkOverlap / 5), // Approximate words for overlap
            currentWords.length
          );

          currentWords = currentWords.slice(-overlapWords);
          currentChunk = currentWords.join(' ');
        } else {
          currentWords = [];
          currentChunk = '';
        }
      }
    }

    return chunks;
  }

  /**
   * Clean and normalize text content
   */
  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\n\s*\n/g, '\n') // Remove empty lines
      .trim();
  }

  /**
   * Generate consistent document ID from source
   */
  private generateDocumentId(source: string): string {
    return crypto.createHash('md5').update(source).digest('hex');
  }

  /**
   * Get supported file types
   */
  getSupportedTypes(): string[] {
    return ['pdf', 'txt', 'html', 'web'];
  }

  /**
   * Health check for the service
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test Redis connection
      const redisHealthy = await redisVectorService.healthCheck();

      // Test browser availability
      const browser = await chromium.launch({ headless: true });
      await browser.close();

      return redisHealthy;
    } catch (error) {
      console.error('Document ingestion service health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const documentIngestionService = new DocumentIngestionService();

// Export for use in other services
export default documentIngestionService;
