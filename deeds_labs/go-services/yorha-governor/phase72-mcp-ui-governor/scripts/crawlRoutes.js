const { chromium } = require("playwright");
const fs = require("fs/promises");
const path = require("path");
const routes = require("../routes.json");

async function ensureDirectoryExists(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function run() {
  console.log("🚀 Starting YorHa UI Governor Route Crawler");
  console.log(`📋 Found ${routes.length} routes to analyze`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'YorHa-UI-Governor/1.0'
  });

  const page = await context.newPage();

  // Ensure output directories exist
  await ensureDirectoryExists('analysis/ui');
  await ensureDirectoryExists('analysis/screenshots');

  const results = [];

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    console.log(`🔍 [${i + 1}/${routes.length}] Analyzing: ${route}`);

    try {
      const url = `http://localhost:5173${route}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // Wait for any dynamic content
      await page.waitForTimeout(2000);

      // Extract HTML content
      const htmlContent = await page.content();
      const htmlFileName = route.replace(/\//g, "_").replace(/^_/, "") || "root";
      const htmlPath = path.join('analysis/ui', `${htmlFileName}.html`);
      await fs.writeFile(htmlPath, htmlContent);

      // Take screenshot
      const screenshotPath = path.join('analysis/screenshots', `${htmlFileName}.png`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
        type: 'png'
      });

      // Extract metadata
      const metadata = await page.evaluate(() => {
        const title = document.title;
        const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
        const h1Count = document.querySelectorAll('h1').length;
        const imgCount = document.querySelectorAll('img').length;
        const buttonCount = document.querySelectorAll('button').length;
        const inputCount = document.querySelectorAll('input').length;
        const linkCount = document.querySelectorAll('a').length;

        return {
          title,
          metaDescription,
          h1Count,
          imgCount,
          buttonCount,
          inputCount,
          linkCount,
          url: window.location.href
        };
      });

      results.push({
        route,
        url,
        htmlPath,
        screenshotPath,
        metadata,
        status: 'success',
        timestamp: new Date().toISOString()
      });

      console.log(`✅ Completed: ${route}`);

    } catch (error) {
      console.error(`❌ Failed: ${route} - ${error.message}`);

      results.push({
        route,
        url: `http://localhost:5173${route}`,
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  await browser.close();

  // Save results
  await ensureDirectoryExists('analysis');
  await fs.writeFile('analysis/crawl-results.json', JSON.stringify(results, null, 2));

  console.log("\n🎯 Crawl Complete!");
  console.log(`📊 Successfully analyzed: ${results.filter(r => r.status === 'success').length}/${routes.length} routes`);
  console.log("📁 Results saved to: analysis/crawl-results.json");
  console.log("🖼️ Screenshots saved to: analysis/screenshots/");
  console.log("📄 HTML content saved to: analysis/ui/");
}

run().catch(console.error);