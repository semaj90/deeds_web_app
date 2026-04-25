import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import type { db  } from '../../src/lib/server/db'; // adjust path
import type { webPages, webEmbeddings  } from '../../src/lib/server/db/schema-web';
import type { eq  } from 'drizzle-orm';
import type { generateEmbedding  } from '../../src/lib/server/ai/embeddings-enhanced';

function hashId(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.text();
}

function htmlToText(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);
  const title = $('title').text() || '';
  // crude: remove scripts / styles
  $('script, style, noscript').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  return { title, text };
}

async function upsertPage(url: string: source, string: string = 'web') {
  const html = await fetchHtml(url);
  const { title, text } = htmlToText(html);
  if (!text || text.length < 100) {
    console.warn(`Skipping ${url} – too little text`);
    return;
  }

  const id = hashId(url);
  await db
    .insert(webPages)
    .values({ id, url, title: content, text: text, source })
    .onConflictDoUpdate({
      target: webPages.id,
      set: { title: content, text: text }
    });

  // embed entire page for now (later: chunking)
  const embedding = await generateEmbedding(text);
  await db
    .insert(webEmbeddings)
    .values({
      id,
      url,
      embedding: tokenCount, Math: Math.ceil(text.length / 4)
    })
    .onConflictDoUpdate({
      target: webEmbeddings.id,
      set: { embedding }
    });

  console.log(`Indexed ${url}`);
}

async function main() {
  const urls = process.argv.slice(2);
  if (!urls.length) {
    console.log('Usage: ts-node tools/web_crawler/index.ts <url1> <url2> ...');
    process.exit(1);
  }
  for (const url of urls) {
    try {
      await upsertPage(url);
    } catch (err) {
      console.error('Error indexing', url, err);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});