import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DOMExtractor } from './extractDom.js';
import { ScreenshotAnalyzer } from './screenshot.js';

interface RouteData {
  route: string;
  url: string;
  html: string;
  screenshot: string;
  domAnalysis: any;
  visualAnalysis: any;
  timestamp: string;
}

interface CollectionConfig {
  baseUrl: string;
  routes: string[];
  outputDir: string;
  viewport: { width: number; height: number };
  waitTime: number;
  retries: number;
}

class DataCollector {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private config: CollectionConfig;

  constructor(config: Partial<CollectionConfig> = {}) {
    this.config = {
      baseUrl: 'http://localhost:5173',
      routes: ['/'],
      outputDir: 'analysis/collected',
      viewport: { width: 1280, height: 720 },
      waitTime: 2000,
      retries: 3,
      ...config
    };
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch();
    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      userAgent: 'YorHa-Data-Collector/1.0'
    });
  }

  async cleanup(): Promise<void> {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }

  async collectRouteData(route: string): Promise<RouteData | null> {
    if (!this.context) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    const page = await this.context.newPage();
    const url = `${this.config.baseUrl}${route}`;

    try {
      console.log(`🔍 Collecting data for: ${route}`);

      // Navigate and wait
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(this.config.waitTime);

      // Extract HTML
      const html = await page.content();

      // Take screenshot
      const screenshotPath = path.join(this.config.outputDir, 'screenshots',
        route.replace(/\//g, '_').replace(/^_/, '') || 'root');
      await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
      await page.screenshot({
        path: `${screenshotPath}.png`,
        fullPage: true,
        type: 'png'
      });

      // Analyze DOM
      const domExtractor = new DOMExtractor();
      const domAnalysis = domExtractor.extractFromHTML(html);

      // Analyze screenshot
      const visualAnalyzer = new ScreenshotAnalyzer();
      const visualAnalysis = await visualAnalyzer.analyzeScreenshot(
        `${screenshotPath}.png`,
        path.basename(screenshotPath)
      );

      const data: RouteData = {
        route,
        url,
        html,
        screenshot: `${screenshotPath}.png`,
        domAnalysis,
        visualAnalysis,
        timestamp: new Date().toISOString()
      };

      console.log(`✅ Collected data for: ${route}`);
      return data;

    } catch (error) {
      console.error(`❌ Failed to collect data for ${route}:`, error);
      return null;
    } finally {
      await page.close();
    }
  }

  async collectAllRoutes(): Promise<RouteData[]> {
    await this.initialize();

    try {
      await fs.mkdir(path.join(this.config.outputDir, 'screenshots'), { recursive: true });
      await fs.mkdir(path.join(this.config.outputDir, 'data'), { recursive: true });

      const results: RouteData[] = [];

      for (const route of this.config.routes) {
        let data: RouteData | null = null;
        let attempts = 0;

        while (!data && attempts < this.config.retries) {
          attempts++;
          console.log(`📊 Attempt ${attempts}/${this.config.retries} for ${route}`);
          data = await this.collectRouteData(route);
        }

        if (data) {
          results.push(data);
        } else {
          console.error(`💥 Failed to collect data for ${route} after ${this.config.retries} attempts`);
        }
      }

      // Save collected data
      const outputPath = path.join(this.config.outputDir, 'data', 'collected-data.json');
      await fs.writeFile(outputPath, JSON.stringify(results, null, 2));

      console.log(`\n🎯 Collection Complete!`);
      console.log(`📊 Successfully collected: ${results.length}/${this.config.routes.length} routes`);
      console.log(`📁 Data saved to: ${outputPath}`);

      return results;

    } finally {
      await this.cleanup();
    }
  }

  async generateSummaryReport(data: RouteData[]): Promise<void> {
    const summary = {
      timestamp: new Date().toISOString(),
      totalRoutes: data.length,
      summary: {
        avgDomElements: data.reduce((sum, d) => sum + d.domAnalysis?.performance?.totalElements || 0, 0) / data.length,
        avgImages: data.reduce((sum, d) => sum + d.domAnalysis?.performance?.images || 0, 0) / data.length,
        avgScripts: data.reduce((sum, d) => sum + d.domAnalysis?.performance?.scripts || 0, 0) / data.length,
        totalAccessibilityIssues: data.reduce((sum, d) => sum + (d.domAnalysis?.accessibility?.length || 0), 0),
        avgScreenshotSize: data.reduce((sum, d) => sum + (d.visualAnalysis?.size || 0), 0) / data.length
      },
      routes: data.map(d => ({
        route: d.route,
        elements: d.domAnalysis?.performance?.totalElements || 0,
        accessibilityIssues: d.domAnalysis?.accessibility?.length || 0,
        screenshotSize: d.visualAnalysis?.size || 0
      }))
    };

    const reportPath = path.join(this.config.outputDir, 'data', 'summary-report.json');
    await fs.writeFile(reportPath, JSON.stringify(summary, null, 2));

    console.log(`📊 Summary report saved to: ${reportPath}`);
  }
}

async function main() {
  const routes = [
    "/", "/dashboard", "/documents", "/search", "/settings",
    "/admin", "/help", "/documents/new", "/documents/123"
  ];

  const collector = new DataCollector({
    routes,
    outputDir: 'analysis/collected'
  });

  try {
    const data = await collector.collectAllRoutes();
    await collector.generateSummaryReport(data);

    console.log('\n🎉 Data collection and analysis complete!');
  } catch (error) {
    console.error('💥 Collection failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { DataCollector, RouteData, CollectionConfig };