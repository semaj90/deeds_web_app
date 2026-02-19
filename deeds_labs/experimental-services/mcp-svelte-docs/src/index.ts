#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RouteInfo {
  path: string;
  title: string;
  content: string;
  lastModified: string;
  wordCount: number;
  hasDynamicContent: boolean;
}

interface CrawlResult {
  timestamp: string;
  baseUrl: string;
  totalRoutes: number;
  routes: RouteInfo[];
  summary: {
    totalWords: number;
    avgWordsPerRoute: number;
    routesWithDynamicContent: number;
  };
}

class MCPSvelteDocsCrawler {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private baseUrl: string = 'http://localhost:5173';
  private crawlResults: CrawlResult[] = [];
  private watchedFiles: Set<string> = new Set();
  private fileWatcher: fs.FSWatcher | null = null;

  constructor() {
    this.initializeFileWatcher();
  }

  private initializeFileWatcher() {
    // Watch for changes in key documentation files
    const watchPaths = [
      'mcp-svelte-docs.txt',
      'svelte_med.txt',
      'llms.txt',
      'README.md',
      'docs/**/*.md',
      'src/**/*.ts',
      'src/**/*.svelte'
    ];

    // Start file watcher for documentation changes
    this.watchDocumentationFiles();
  }

  private async watchDocumentationFiles() {
    try {
      // Watch the entire workspace for documentation changes
      const watchDir = path.resolve(__dirname, '../..');

      this.fileWatcher = fs.watch(watchDir, { recursive: true }, (eventType, filename) => {
        if (filename && this.shouldProcessFile(filename)) {
          console.log(`Documentation file changed: ${filename}`);
          this.triggerEmbedding(filename);
        }
      });

      console.log('File watcher started for documentation changes');

    } catch (error) {
      console.error('Failed to start file watcher:', error);
    }
  }

  private shouldProcessFile(filename: string): boolean {
    const docExtensions = ['.txt', '.md', '.ts', '.svelte'];
    const docFiles = ['mcp-svelte-docs', 'svelte_med', 'llms', 'README'];

    const ext = path.extname(filename).toLowerCase();
    const basename = path.basename(filename, ext);

    return docExtensions.includes(ext) ||
           docFiles.some(doc => basename.includes(doc)) ||
           filename.includes('docs/');
  }

  private async triggerEmbedding(filename: string) {
    try {
      const fullPath = path.resolve(__dirname, '../..', filename);

      // Check if file exists and is not too large
      const stats = await fs.stat(fullPath);
      if (stats.size > 10 * 1024 * 1024) { // 10MB limit
        console.log(`Skipping large file: ${filename}`);
        return;
      }

      // Call the embedding service
      const embeddingServicePath = path.resolve(__dirname, '../embedding-service/embedding_service.py');
      const pythonProcess = spawn('python3', [embeddingServicePath, '--file', fullPath], {
        stdio: 'inherit',
        cwd: path.dirname(embeddingServicePath)
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`Successfully processed: ${filename}`);
        } else {
          console.error(`Failed to process: ${filename}`);
        }
      });

    } catch (error) {
      console.error(`Error triggering embedding for ${filename}:`, error);
    }
  }

  async initializeBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'MCP-Svelte-Docs-Crawler/1.0'
      });
    }
  }

  async closeBrowser(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async crawlSvelteKitRoutes(): Promise<string[]> {
    const routes: string[] = ['/'];

    try {
      await this.initializeBrowser();
      if (!this.context) return routes;

      const page = await this.context.newPage();

      // Start with homepage
      await page.goto(this.baseUrl, { waitUntil: 'networkidle' });

      // Extract all links from the page
      const links = await page.$$eval('a[href]', (anchors) =>
        anchors.map(a => (a as HTMLAnchorElement).href)
      );

      // Filter and normalize routes
      for (const link of links) {
        try {
          const url = new URL(link, this.baseUrl);
          if (url.origin === this.baseUrl && !url.hash) {
            const path = url.pathname;
            if (!routes.includes(path) && path !== '/favicon.ico') {
              routes.push(path);
            }
          }
        } catch (error) {
          // Invalid URL, skip
        }
      }

      await page.close();
    } catch (error) {
      console.error('Error crawling routes:', error);
    }

    return routes;
  }

  async analyzeRoute(path: string): Promise<RouteInfo> {
    let page: Page | null = null;

    try {
      await this.initializeBrowser();
      if (!this.context) {
        throw new Error('Browser context not initialized');
      }

      page = await this.context.newPage();

      // Navigate to the route
      const response = await page.goto(`${this.baseUrl}${path}`, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      if (!response) {
        throw new Error('No response received');
      }

      // Get page title
      const title = await page.title();

      // Extract text content
      const content = await page.$eval('body', (body) => body.textContent || '');

      // Check for dynamic content indicators
      const hasDynamicContent = await page.$('[data-dynamic], [data-live], .loading, .spinner') !== null;

      // Get last modified time (if available)
      const lastModified = response.headers()['last-modified'] || new Date().toISOString();

      // Count words
      const wordCount = content.trim().split(/\s+/).length;

      return {
        path,
        title,
        content: content.trim(),
        lastModified,
        wordCount,
        hasDynamicContent
      };

    } catch (error) {
      return {
        path,
        title: 'Error',
        content: `Failed to load route: ${error instanceof Error ? error.message : String(error)}`,
        lastModified: new Date().toISOString(),
        wordCount: 0,
        hasDynamicContent: false
      };
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  async performFullCrawl(): Promise<CrawlResult> {
    console.log('Starting full SvelteKit documentation crawl...');

    const routes = await this.crawlSvelteKitRoutes();
    console.log(`Found ${routes.length} routes to analyze`);

    const routeResults: RouteInfo[] = [];

    for (const route of routes) {
      console.log(`Analyzing route: ${route}`);
      const result = await this.analyzeRoute(route);
      routeResults.push(result);

      // Trigger embedding for the route content if it's documentation
      if (this.isDocumentationRoute(route, result)) {
        await this.saveRouteContent(result);
        this.triggerEmbedding(`route-${route.replace(/\//g, '_')}.txt`);
      }
    }

    const totalWords = routeResults.reduce((sum, r) => sum + r.wordCount, 0);
    const avgWordsPerRoute = totalWords / routeResults.length;
    const routesWithDynamicContent = routeResults.filter(r => r.hasDynamicContent).length;

    const result: CrawlResult = {
      timestamp: new Date().toISOString(),
      baseUrl: this.baseUrl,
      totalRoutes: routes.length,
      routes: routeResults,
      summary: {
        totalWords,
        avgWordsPerRoute,
        routesWithDynamicContent
      }
    };

    this.crawlResults.push(result);
    console.log('Crawl complete!');

    return result;
  }

  private isDocumentationRoute(route: string, result: RouteInfo): boolean {
    // Consider routes as documentation if they contain significant text content
    return result.wordCount > 50 &&
           !route.includes('/api/') &&
           !route.includes('/auth/') &&
           !result.title.toLowerCase().includes('error');
  }

  private async saveRouteContent(result: RouteInfo): Promise<void> {
    try {
      const filename = `route-${result.path.replace(/\//g, '_')}.txt`;
      const filepath = path.resolve(__dirname, '../docs', filename);

      // Ensure docs directory exists
      await fs.mkdir(path.dirname(filepath), { recursive: true });

      const content = `# ${result.title}\n\nPath: ${result.path}\nLast Modified: ${result.lastModified}\nWord Count: ${result.wordCount}\nDynamic Content: ${result.hasDynamicContent}\n\n${result.content}`;

      await fs.writeFile(filepath, content, 'utf-8');
      console.log(`Saved route content: ${filename}`);

    } catch (error) {
      console.error(`Failed to save route content for ${result.path}:`, error);
    }
  }

  getLatestCrawl(): CrawlResult | null {
    return this.crawlResults.length > 0 ? this.crawlResults[this.crawlResults.length - 1] : null;
  }

  async cleanup(): Promise<void> {
    await this.closeBrowser();
    if (this.fileWatcher) {
      this.fileWatcher.close();
    }
  }
}

// MCP Server Implementation
class MCPSvelteDocsServer {
  private crawler: MCPSvelteDocsCrawler;
  private server: Server;

  constructor() {
    this.crawler = new MCPSvelteDocsCrawler();

    this.server = new Server(
      {
        name: 'mcp-svelte-docs-crawler',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'crawl_sveltekit_docs',
            description: 'Crawl all SvelteKit routes and extract documentation content',
            inputSchema: {
              type: 'object',
              properties: {
                baseUrl: {
                  type: 'string',
                  description: 'Base URL of the SvelteKit application (default: http://localhost:5173)',
                },
                includeApiRoutes: {
                  type: 'boolean',
                  description: 'Whether to include API routes in the crawl (default: false)',
                },
              },
            },
          },
          {
            name: 'analyze_route_content',
            description: 'Analyze the content of a specific SvelteKit route',
            inputSchema: {
              type: 'object',
              properties: {
                route: {
                  type: 'string',
                  description: 'Route path to analyze',
                },
                baseUrl: {
                  type: 'string',
                  description: 'Base URL of the SvelteKit application (default: http://localhost:5173)',
                },
              },
              required: ['route'],
            },
          },
          {
            name: 'trigger_doc_embedding',
            description: 'Trigger embedding generation for documentation files',
            inputSchema: {
              type: 'object',
              properties: {
                files: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List of documentation files to process',
                },
              },
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'crawl_sveltekit_docs':
            const crawlResult = await this.crawler.performFullCrawl();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(crawlResult, null, 2),
                },
              ],
            };

          case 'analyze_route_content':
            if (!args) throw new Error('Arguments missing');
            const route = args.route as string;
            const routeResult = await this.crawler.analyzeRoute(route);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(routeResult, null, 2),
                },
              ],
            };

          case 'trigger_doc_embedding':
            if (!args) throw new Error('Arguments missing');
            const files = (args.files as string[]) || [];
            // Trigger embeddings for specified files
            for (const file of files) {
              this.crawler['triggerEmbedding'](file);
            }
            return {
              content: [
                {
                  type: 'text',
                  text: `Triggered embedding for ${files.length} files`,
                },
              ],
            };

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Svelte Docs Crawler server started');
  }

  async cleanup() {
    await this.crawler.cleanup();
  }
}

// Main execution
async function main() {
  const server = new MCPSvelteDocsServer();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down MCP Svelte Docs Crawler...');
    await server.cleanup();
    process.exit(0);
  });

  await server.run();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { MCPSvelteDocsCrawler, MCPSvelteDocsServer };