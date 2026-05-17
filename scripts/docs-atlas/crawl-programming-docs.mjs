#!/usr/bin/env node
import 'dotenv/config';
import { resolve, join } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SOURCE_ID = args.find(a => a.startsWith('--source='))?.split('=')[1] || args.find(a => !a.startsWith('--'));

const REPO_ROOT = resolve(process.cwd());
const RAW_DIR = join(REPO_ROOT, 'data/external-docs/raw');
const SOURCES_FILE = join(REPO_ROOT, 'docs/graph/programming-doc-sources.json');

async function crawl() {
  const sourcesData = JSON.parse(await readFile(SOURCES_FILE, 'utf8'));
  const allSources = [...sourcesData.tier1, ...sourcesData.tier2];
  
  const target = SOURCE_ID ? allSources.find(s => s.sourceId === SOURCE_ID) : null;
  const sourcesToCrawl = target ? [target] : (SOURCE_ID ? [] : allSources);

  if (sourcesToCrawl.length === 0) {
    console.error(`Source not found: ${SOURCE_ID}`);
    process.exit(1);
  }

  console.log(`🔍 Crawling ${sourcesToCrawl.length} sources...`);

  for (const source of sourcesToCrawl) {
    const outDir = join(RAW_DIR, source.sourceId);
    if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });

    console.log(`[crawl] ${source.title} -> ${source.baseUrl}`);

    if (DRY_RUN) {
      console.log(`[dry-run] Would crawl ${source.baseUrl} and save to ${outDir}`);
      continue;
    }

    // Firecrawl adapter logic
    if (process.env.FIRECRAWL_API_KEY) {
      console.log(`[firecrawl] Using Firecrawl for ${source.sourceId}...`);
      const apiKey = process.env.FIRECRAWL_API_KEY;
      const baseUrl = "https://api.firecrawl.dev/v1";

      try {
        const response = await fetch(`${baseUrl}/crawl`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            url: source.baseUrl,
            crawlerOptions: {
              limit: 50, // Workstation memory safety limit
              includes: source.include || [],
              excludes: source.exclude || [],
              maxDepth: source.crawlDepth || 3,
              generateImgAltText: false
            },
            pageOptions: {
              onlyMainContent: true
            }
          })
        });

        const crawlData = await response.json();
        if (!response.ok) {
          throw new Error(`Firecrawl submit failed: ${crawlData.error || JSON.stringify(crawlData)}`);
        }

        const crawlId = crawlData.id;
        console.log(`[firecrawl] Crawl job submitted successfully. ID: ${crawlId}`);

        let completed = false;
        let statusResult = null;

        while (!completed) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          const statusRes = await fetch(`${baseUrl}/crawl/${crawlId}`, {
            headers: { "Authorization": `Bearer ${apiKey}` }
          });
          
          statusResult = await statusRes.json();
          console.log(`[firecrawl] Status: ${statusResult.status} (${statusResult.completed || 0}/${statusResult.total || 0} pages)`);
          
          if (statusResult.status === "completed") {
            completed = true;
          } else if (statusResult.status === "failed") {
            throw new Error(`Firecrawl job failed on the remote server: ${statusResult.error}`);
          }
        }

        if (statusResult && statusResult.data) {
          for (const page of statusResult.data) {
            if (!page.markdown) continue;
            
            const urlPath = new URL(page.metadata?.sourceURL || page.url || source.baseUrl).pathname;
            const safeName = urlPath.replace(/[^a-z0-9]/gi, "_").toLowerCase() + ".md";
            
            await writeFile(join(outDir, safeName), page.markdown);
            console.log(`[firecrawl] Saved: ${safeName} (${page.markdown.length} chars)`);
          }
        }
      } catch (err) {
        console.error(`[firecrawl] Error during crawl: ${err.message}`);
      }
    } else {
      console.warn(`[warn] No FIRECRAWL_API_KEY found. Falling back to simple fetch (limited).`);
      // Simple fetch logic for demonstration
      const res = await fetch(source.baseUrl);
      const html = await res.text();
      await writeFile(join(outDir, 'index.html'), html);
      console.log(`[crawl] Saved index.html for ${source.sourceId}`);
    }
  }
}

crawl().catch(console.error);
