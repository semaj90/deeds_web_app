import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface RouteInfo {
  path: string;
  title: string;
  status: number;
  loadTime: number;
  hasErrors: boolean;
  accessibilityIssues: string[];
  deadLinks: string[];
}

interface AuditResult {
  timestamp: string;
  totalRoutes: number;
  successfulRoutes: number;
  failedRoutes: number;
  routes: RouteInfo[];
  summary: {
    avgLoadTime: number;
    totalErrors: number;
    totalDeadLinks: number;
    accessibilityScore: number;
  };
}

class MCPPlaywrightAuditor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private baseUrl: string = 'http://localhost:5173';
  private auditResults: AuditResult[] = [];

  constructor() {
    this.initializeExpressServer();
  }

  private initializeExpressServer() {
    const app = express();
    app.use(cors());
    app.use(express.json());

    // WebSocket server for real-time updates
    const wss = new WebSocket.Server({ port: 8081 });

    wss.on('connection', (ws) => {
      console.log('MCP Playwright Auditor WebSocket connected');

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === 'start_audit') {
            const result = await this.runFullAudit();
            ws.send(JSON.stringify({
              type: 'audit_complete',
              result
            }));
          }
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            error: error.message
          }));
        }
      });
    });

    app.get('/health', (req, res) => {
      res.json({ status: 'ok', auditor: 'mcp-playwright' });
    });

    app.get('/latest-audit', (req, res) => {
      const latest = this.auditResults[this.auditResults.length - 1];
      res.json(latest || { error: 'No audits run yet' });
    });

    app.post('/audit', async (req, res) => {
      try {
        const result = await this.runFullAudit();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.listen(8082, () => {
      console.log('MCP Playwright Auditor server running on port 8082');
      console.log('WebSocket server running on port 8081');
    });
  }

  async initializeBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'MCP-Playwright-Auditor/1.0'
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

  async crawlRoutes(): Promise<string[]> {
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

  async auditRoute(path: string): Promise<RouteInfo> {
    const startTime = Date.now();
    let page: Page | null = null;

    try {
      await this.initializeBrowser();
      if (!this.context) {
        throw new Error('Browser context not initialized');
      }

      page = await this.context.newPage();

      // Enable console logging
      const consoleMessages: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleMessages.push(msg.text());
        }
      });

      // Navigate to the route
      const response = await page.goto(`${this.baseUrl}${path}`, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      const loadTime = Date.now() - startTime;
      const status = response?.status() || 0;

      // Get page title
      const title = await page.title();

      // Check for JavaScript errors
      const hasErrors = consoleMessages.length > 0;

      // Basic accessibility check
      const accessibilityIssues = await this.checkAccessibility(page);

      // Check for dead links
      const deadLinks = await this.checkDeadLinks(page);

      return {
        path,
        title,
        status,
        loadTime,
        hasErrors,
        accessibilityIssues,
        deadLinks
      };

    } catch (error) {
      return {
        path,
        title: 'Error',
        status: 0,
        loadTime: Date.now() - startTime,
        hasErrors: true,
        accessibilityIssues: [`Navigation failed: ${error.message}`],
        deadLinks: []
      };
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  async checkAccessibility(page: Page): Promise<string[]> {
    const issues: string[] = [];

    try {
      // Check for missing alt text on images
      const imagesWithoutAlt = await page.$$eval('img:not([alt])', imgs => imgs.length);
      if (imagesWithoutAlt > 0) {
        issues.push(`${imagesWithoutAlt} images missing alt text`);
      }

      // Check for missing lang attribute
      const hasLang = await page.$eval('html', el => !!(el as HTMLElement).lang);
      if (!hasLang) {
        issues.push('Missing lang attribute on html element');
      }

      // Check for heading hierarchy
      const headings = await page.$$eval('h1,h2,h3,h4,h5,h6', headings => {
        return headings.map(h => ({
          tag: h.tagName,
          text: h.textContent?.trim() || ''
        }));
      });

      if (headings.length === 0) {
        issues.push('No headings found on page');
      }

    } catch (error) {
      issues.push(`Accessibility check failed: ${error.message}`);
    }

    return issues;
  }

  async checkDeadLinks(page: Page): Promise<string[]> {
    const deadLinks: string[] = [];

    try {
      const links = await page.$$eval('a[href]', anchors =>
        anchors.map(a => (a as HTMLAnchorElement).href)
      );

      for (const link of links.slice(0, 10)) { // Check first 10 links
        try {
          const response = await axios.head(link, { timeout: 5000 });
          if (response.status >= 400) {
            deadLinks.push(link);
          }
        } catch (error) {
          deadLinks.push(link);
        }
      }
    } catch (error) {
      // Skip dead link checking if it fails
    }

    return deadLinks;
  }

  async runFullAudit(): Promise<AuditResult> {
    console.log('Starting full audit...');

    const routes = await this.crawlRoutes();
    console.log(`Found ${routes.length} routes to audit`);

    const routeResults: RouteInfo[] = [];

    for (const route of routes) {
      console.log(`Auditing route: ${route}`);
      const result = await this.auditRoute(route);
      routeResults.push(result);
    }

    const successfulRoutes = routeResults.filter(r => r.status === 200).length;
    const failedRoutes = routeResults.length - successfulRoutes;

    const totalLoadTime = routeResults.reduce((sum, r) => sum + r.loadTime, 0);
    const avgLoadTime = totalLoadTime / routeResults.length;

    const totalErrors = routeResults.filter(r => r.hasErrors).length;
    const totalDeadLinks = routeResults.reduce((sum, r) => sum + r.deadLinks.length, 0);
    const totalAccessibilityIssues = routeResults.reduce((sum, r) => sum + r.accessibilityIssues.length, 0);

    // Simple accessibility score (lower is better)
    const accessibilityScore = Math.max(0, 100 - (totalAccessibilityIssues * 10));

    const result: AuditResult = {
      timestamp: new Date().toISOString(),
      totalRoutes: routes.length,
      successfulRoutes,
      failedRoutes,
      routes: routeResults,
      summary: {
        avgLoadTime,
        totalErrors,
        totalDeadLinks,
        accessibilityScore
      }
    };

    this.auditResults.push(result);
    console.log('Audit complete!');

    return result;
  }

  getLatestAudit(): AuditResult | null {
    return this.auditResults.length > 0 ? this.auditResults[this.auditResults.length - 1] : null;
  }

  async cleanup(): Promise<void> {
    await this.closeBrowser();
  }
}

// MCP Server Implementation
class MCPPlaywrightServer {
  private auditor: MCPPlaywrightAuditor;
  private server: Server;

  constructor() {
    this.auditor = new MCPPlaywrightAuditor();

    this.server = new Server(
      {
        name: 'mcp-playwright-auditor',
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
            name: 'audit_sveltekit_routes',
            description: 'Audit all SvelteKit routes for performance, accessibility, and dead links',
            inputSchema: {
              type: 'object',
              properties: {
                baseUrl: {
                  type: 'string',
                  description: 'Base URL of the SvelteKit application (default: http://localhost:5173)',
                },
              },
            },
          },
          {
            name: 'crawl_routes',
            description: 'Crawl and discover all routes in the SvelteKit application',
            inputSchema: {
              type: 'object',
              properties: {
                baseUrl: {
                  type: 'string',
                  description: 'Base URL of the SvelteKit application (default: http://localhost:5173)',
                },
              },
            },
          },
          {
            name: 'check_route_health',
            description: 'Check the health of a specific route',
            inputSchema: {
              type: 'object',
              properties: {
                route: {
                  type: 'string',
                  description: 'Route path to check',
                },
                baseUrl: {
                  type: 'string',
                  description: 'Base URL of the SvelteKit application (default: http://localhost:5173)',
                },
              },
              required: ['route'],
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
          case 'audit_sveltekit_routes':
            const auditResult = await this.auditor.runFullAudit();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(auditResult, null, 2),
                },
              ],
            };

          case 'crawl_routes':
            const routes = await this.auditor.crawlRoutes();
            return {
              content: [
                {
                  type: 'text',
                  text: `Discovered routes: ${routes.join(', ')}`,
                },
              ],
            };

          case 'check_route_health':
            const routeResult = await this.auditor.auditRoute(args.route);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(routeResult, null, 2),
                },
              ],
            };

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
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
    console.error('MCP Playwright Auditor server started');
  }

  async cleanup() {
    await this.auditor.cleanup();
  }
}

// Main execution
async function main() {
  const server = new MCPPlaywrightServer();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down MCP Playwright Auditor...');
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

export { MCPPlaywrightAuditor, MCPPlaywrightServer };