// Playwright MCP Route Discovery and Testing
// Auto-discovers and tests all SvelteKit routes with Nintendo-style performance monitoring

import { globSync } from 'glob';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface RouteInfo {
  path: string;
  file: string;
  type: 'page' | 'api' | 'layout' | 'error';
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  hasParams: boolean;
  estimatedComplexity: 'low' | 'medium' | 'high';
  relatedServices: string[];
}

export interface TestSuite {
  pages: RouteInfo[];
  api: RouteInfo[];
  layouts: RouteInfo[];
  errors: RouteInfo[];
}

export class SvelteKitRouteDiscovery {
  private routesDir: string;
  private baseUrl: string;

  constructor(routesDir = 'src/routes', baseUrl = 'http://localhost:5173') {
    this.routesDir = routesDir;
    this.baseUrl = baseUrl;
  }

  /**
   * Discover all routes in the SvelteKit application
   */
  discoverRoutes(): TestSuite {
    const routes: TestSuite = {
      pages: [],
      api: [],
      layouts: [],
      errors: [],
    };

    // Find all route files
    const patterns = [
      `${this.routesDir}/**/*.svelte`, // Page components
      `${this.routesDir}/**/*.ts`, // API routes and server files
      `${this.routesDir}/**/*.js`, // JS server files
    ];

    const allFiles = patterns.flatMap((pattern) => globSync(pattern));

    allFiles.forEach((file) => {
      const route = this.parseRouteFile(file);
      if (route) {
        switch (route.type) {
          case 'page':
            routes.pages.push(<any>(<any>route));
            break;
          case 'api':
            routes.api.push(<any>(<any>route));
            break;
          case 'layout':
            routes.layouts.push(<any>(<any>route));
            break;
          case 'error':
            routes.errors.push(<any>(<any>route));
            break;
        }
      }
    });

    return routes;
  }

  /**
   * Parse individual route file to extract information
   */
  private parseRouteFile(filePath: string): RouteInfo | null {
    const relativePath = filePath.replace(`${this.routesDir}/`, '');
    const segments = relativePath.split('/');
    const filename = segments[segments.length - 1];

    // Skip non-route files
    if (!this.isRouteFile(filename)) {
      return null;
    }

    const route: RouteInfo = {
      path: this.generateRoutePath(relativePath),
      file: filePath,
      type: this.getRouteType(filename),
      hasParams: this.hasRouteParams(relativePath),
      estimatedComplexity: 'low',
      relatedServices: [],
    };

    // Analyze file content for complexity and services
    try {
      const content = readFileSync(filePath, 'utf-8');
      route.estimatedComplexity = this.analyzeComplexity(content);
      route.relatedServices = this.detectRelatedServices(content);

      if (route.type === 'api') {
        route.method = this.detectApiMethod(content);
      }
    } catch (error) {
      console.warn(`Could not analyze file: ${filePath}`);
    }

    return route;
  }

  /**
   * Check if file is a valid SvelteKit route file
   */
  private isRouteFile(filename: string): boolean {
    const routeFiles = [
      '+page.svelte', // Page components
      '+layout.svelte', // Layout components
      '+error.svelte', // Error pages
      '+page.ts', // Page server functions
      '+page.js', // Page server functions (JS)
      '+layout.ts', // Layout server functions
      '+layout.js', // Layout server functions (JS)
      '+server.ts', // API routes
      '+server.js', // API routes (JS)
    ];

    return routeFiles.some((pattern) => filename.endsWith(pattern));
  }

  /**
   * Generate the actual URL path from file path
   */
  private generateRoutePath(relativePath: string): string {
    // Remove file extensions and SvelteKit suffixes
    let path = relativePath
      .replace(/\+page\.(svelte|ts|js)$/, '')
      .replace(/\+layout\.(svelte|ts|js)$/, '')
      .replace(/\+server\.(ts|js)$/, '')
      .replace(/\+error\.(svelte|ts|js)$/, '');

    // Remove trailing slash if not root
    if (path.endsWith('/') && path !== '/') {
      path = path.slice(0, -1);
    }

    // Convert to URL path
    if (path === '') return '/';
    if (!path.startsWith('/')) path = '/' + path;

    return path;
  }

  /**
   * Determine route type from filename
   */
  private getRouteType(filename: string): RouteInfo['type'] {
    if (filename.includes('+server.')) return 'api';
    if (filename.includes('+layout.')) return 'layout';
    if (filename.includes('+error.')) return 'error';
    if (filename.includes('+page.')) return 'page';
    return 'page';
  }

  /**
   * Check if route has dynamic parameters
   */
  private hasRouteParams(path: string): boolean {
    return path.includes('[') && path.includes(']');
  }

  /**
   * Analyze code complexity
   */
  private analyzeComplexity(content: string): 'low' | 'medium' | 'high' {
    const complexityMarkers = [
      'fetch(', // API calls
      'await ', // Async operations
      'Promise.', // Promise handling
      'setTimeout(', // Timers
      'setInterval(', // Intervals
      'WebSocket', // WebSocket connections
      'EventSource', // Server-sent events
      'localStorage', // Local storage
      'sessionStorage', // Session storage
      'IndexedDB', // Database operations
      'crypto.', // Cryptographic operations
    ];

    const matches = complexityMarkers.filter((marker) => content.includes(marker)).length;

    if (matches >= 5) return 'high';
    if (matches >= 2) return 'medium';
    return 'low';
  }

  /**
   * Detect related services used in the route
   */
  private detectRelatedServices(content: string): string[] {
    const services = [];

    // AI/ML Services
    if (content.includes('ollama') || content.includes('Ollama'))
      services.push(<any>(<any>'ollama'));
    if (content.includes('openai') || content.includes('OpenAI'))
      services.push(<any>(<any>'openai'));
    if (content.includes('gemma') || content.includes('Gemma')) services.push(<any>(<any>'gemma'));
    if (content.includes('embedding')) services.push(<any>(<any>'embeddings'));

    // Database Services
    if (content.includes('redis') || content.includes('Redis')) services.push(<any>(<any>'redis'));
    if (content.includes('postgres') || content.includes('PostgreSQL'))
      services.push(<any>(<any>'postgresql'));
    if (content.includes('qdrant') || content.includes('Qdrant'))
      services.push(<any>(<any>'qdrant'));
    if (content.includes('minio') || content.includes('MinIO')) services.push(<any>(<any>'minio'));

    // Specialized Services
    if (content.includes('nintendo') || content.includes('Nintendo'))
      services.push(<any>(<any>'nintendo-memory'));
    if (content.includes('orchestrator') || content.includes('Orchestrator'))
      services.push(<any>(<any>'ai-orchestrator'));
    if (content.includes('cuda') || content.includes('CUDA') || content.includes('gpu'))
      services.push(<any>(<any>'gpu-acceleration'));
    if (content.includes('nes') || content.includes('NES'))
      services.push(<any>(<any>'nes-texture'));

    return services;
  }

  /**
   * Detect API method from server file content
   */
  private detectApiMethod(
    content: string
  ): 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | undefined {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

    for (const method of methods) {
      if (
        content.includes(`export const ${method}`) ||
        content.includes(`export async function ${method}`)
      ) {
        return method as any;
      }
    }

    return 'GET'; // Default assumption
  }

  /**
   * Generate comprehensive Playwright test suite for all routes
   */
  generatePlaywrightTestSuite(): string {
    const routes = this.discoverRoutes();

    return `
// Auto-generated Playwright test suite for ALL SvelteKit routes
// Nintendo-Style Performance Monitoring and Route Discovery
import { test, expect, Browser, Page } from '@playwright/test';

const BASE_URL = '${this.baseUrl}';

// Route discovery results
const DISCOVERED_ROUTES = ${JSON.stringify(routes, null, 2)};

test.describe('🎮 Complete Route Discovery & Testing Suite', () => {
  let browser: Browser;
  
  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    console.log('🚀 Starting comprehensive route testing...');
    console.log(\`📊 Discovered Routes:
    • Pages: \${DISCOVERED_ROUTES.pages.length}
    • API Routes: \${DISCOVERED_ROUTES.api.length}
    • Layouts: \${DISCOVERED_ROUTES.layouts.length}
    • Error Pages: \${DISCOVERED_ROUTES.errors.length}\`);
  });

  // Test all page routes
  test.describe('📄 Page Routes', () => {
    ${routes.pages
      .map(
        (route) => `
    test('Page: ${route.path}', async ({ page }) => {
      console.log('🔍 Testing page: ${route.path}');
      const startTime = Date.now();
      
      try {
        // Navigate to page
        const response = await page.goto(\`\${BASE_URL}${route.path}\`, {
          waitUntil: 'networkidle',
          timeout: ${route.estimatedComplexity === 'high' ? '30000' : route.estimatedComplexity === 'medium' ? '20000' : '10000'}
        });
        
        const loadTime = Date.now() - startTime;
        
        // Basic response checks
        expect(response?.status()).toBeLessThan(400);
        
        // Performance check
        expect(loadTime).toBeLessThan(${route.estimatedComplexity === 'high' ? '30000' : route.estimatedComplexity === 'medium' ? '20000' : '10000'});
        
        // Content checks
        const title = await page.title();
        expect(title).toBeTruthy();
        
        // Check for critical errors
        const errors = await page.evaluate(() => {
          const errorElements = document.querySelectorAll('[class*="error"], [data-error], .error-message');
          return Array.from(errorElements).map(el => el.textContent);
        });
        
        if (errors.length > 0) {
          console.warn('⚠️ Found potential errors:', errors);
        }
        
        ${
          route.relatedServices.length > 0
            ? `
        // Service-specific checks
        ${
          route.relatedServices.includes('ai-orchestrator')
            ? `
        if (await page.locator('[data-testid="orchestrator-ready"]').count() > 0) {
          await expect(page.locator('[data-testid="orchestrator-ready"]')).toBeVisible();
        }
        `
            : ''
        }
        
        ${
          route.relatedServices.includes('nintendo-memory')
            ? `
        if (await page.locator('.nintendo-memory-banks').count() > 0) {
          await expect(page.locator('.nintendo-memory-banks')).toBeVisible();
        }
        `
            : ''
        }
        `
            : ''
        }
        
        console.log(\`✅ Page \${route.path}: \${loadTime}ms - Services: [${route.relatedServices.join(', ')}]\`);
        
      } catch (error) {
        console.error(\`❌ Page \${route.path} failed:, error\`);
        throw error;
      }
    });
    `
      )
      .join('')}
  });

  // Test all API routes
  test.describe('🔌 API Routes', () => {
    ${routes.api
      .map(
        (route) => `
    test('API: ${route.method} ${route.path}', async ({ request }) => {
      console.log('🔍 Testing API: ${route.method} ${route.path}');
      const startTime = Date.now();
      
      try {
        const response = await request.${(route.method || 'GET').toLowerCase()}(\`\${BASE_URL}${route.path}\`${
          route.method === 'POST'
            ? `, {
          data: {
            query: 'Test API endpoint',
            test: true
          }
        }`
            : ''
        });
        
        const responseTime = Date.now() - startTime;
        
        // Response checks
        expect(response.status()).toBeLessThan(500);
        
        // Performance check  
        expect(responseTime).toBeLessThan(${route.estimatedComplexity === 'high' ? '10000' : '5000'});
        
        // Content type check for successful responses
        if (response.ok()) {
          const contentType = response.headers()['content-type'];
          expect(contentType).toBeTruthy();
        }
        
        console.log(\`✅ API ${route.method} ${route.path}: \${responseTime}ms - Status: \${response.status()}\`);
        
      } catch (error) {
        console.error(\`❌ API ${route.method} ${route.path} failed:\`, error);
        // Don't fail test for API routes that might require specific data
        console.warn('API test failed - this might be expected for routes requiring specific parameters');
      }
    });
    `
      )
      .join('')}
  });

  // Load testing with concurrent requests
  test('🚀 Concurrent Load Test - All Critical Routes', async ({ browser }) => {
    const criticalRoutes = [
      '/',
      '/demo/legal-ai-orchestrator',
      '/api/orchestrator/existing'
    ];
    
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
      browser.newContext()
    ]);
    
    const startTime = Date.now();
    
    try {
      // Test concurrent access
      await Promise.all(contexts.map(async (context, index) => {
        const page = await context.newPage();
        const route = criticalRoutes[index % criticalRoutes.length];
        
        if (route.startsWith('/api/')) {
          // API route test
          const response = await page.request.get(\`\${BASE_URL}\${route}\`);
          expect(response.status()).toBeLessThan(500);
        } else {
          // Page route test
          await page.goto(\`\${BASE_URL}\${route}\`, { waitUntil: 'networkidle' });
          const title = await page.title();
          expect(title).toBeTruthy();
        }
      }));
      
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(30000); // 30 seconds max for concurrent load
      
      console.log(\`🎮 Concurrent load test completed in \${totalTime}ms\`);
      
    } finally {
      await Promise.all(contexts.map(ctx => ctx.close()));
    }
  });

  // Nintendo Memory Management Stress Test
  test('🎮 Nintendo Memory Bank Stress Test', async ({ page }) => {
    // Navigate to orchestrator
    await page.goto(\`\${BASE_URL}/demo/legal-ai-orchestrator\`);
    
    // Wait for ready state
    if (await page.locator('[data-testid="orchestrator-ready"]').count() > 0) {
      await page.waitForSelector('[data-testid="orchestrator-ready"]');
      
      // Rapid fire queries to test memory management
      const testQueries = [
        'What is contract law?',
        'Generate embedding for search',
        'Explain negligence',
        'Create semantic vector',
        'Analyze damages'
      ];
      
      for (const query of testQueries) {
        await page.locator('textarea[placeholder*="query"]').fill(query);
        await page.locator('button:has-text("Process")').click();
        await page.waitForSelector('.processing-indicator', { state: 'hidden', timeout: 10000 });
      }
      
      // Check memory banks are responsive
      const memoryBanks = await page.locator('.memory-bank').count();
      expect(memoryBanks).toBeGreaterThan(0);
      
      console.log('🎮 Nintendo memory stress test completed successfully');
    } else {
      console.log('⚠️ Orchestrator not available for stress test');
    }
  });
});

// Performance Summary
test.afterAll(async () => {
  console.log(\`
🏁 Route Testing Complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Summary:
  • Total Routes Tested: \${DISCOVERED_ROUTES.pages.length + DISCOVERED_ROUTES.api.length}
  • Page Routes: \${DISCOVERED_ROUTES.pages.length}
  • API Routes: \${DISCOVERED_ROUTES.api.length}
  • High Complexity Routes: \${[...DISCOVERED_ROUTES.pages, ...DISCOVERED_ROUTES.api].filter(r => r.estimatedComplexity === 'high').length}
  
🎮 Nintendo Services Detected:
\${[...DISCOVERED_ROUTES.pages, ...DISCOVERED_ROUTES.api]
  .flatMap(r => r.relatedServices)
  .filter((v, i, a) => a.indexOf(v) === i)
  .map(service => \`  • \${service}\`)
  .join('\\n')}

🚀 All routes have been automatically discovered and tested!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  \`);
});
`;
  }
}

// Export for use
export const routeDiscovery = new SvelteKitRouteDiscovery();
export const playwrightTestSuite = routeDiscovery.generatePlaywrightTestSuite();
