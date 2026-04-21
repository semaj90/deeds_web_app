import { JSDOM } from 'jsdom';
import { db } from '$lib/server/db/client';
import { webPages, webEmbeddings } from '$lib/server/db/schema-web.js';
import { webSearch } from '$lib/server/retrieval/web-search.js';
import { generateEmbeddingsWithTags } from '$lib/server/grpc/embedding-client.js';
import { fnv1a } from './web-research-crawler.js'; // Reuse hash helper

/**
 * Agentic Scouter — Deep Indexing for Web Research
 *
 * Performs: Search → Full Page Fetch → Parse → Clean → Index
 */

export async function agenticScout(query: string, maxResults: number = 3): Promise<void> {
  console.log(`[Scouter] Starting agentic research for: "${query}"`);

  // 1. Search
  const { results } = await webSearch(query, maxResults);
  if (!results.length) return;

  for (const res of results) {
    try {
      // 2. Fetch Full Content
      const response = await fetch(res.url, { signal: AbortSignal.timeout(10000) });
      const html = await response.text();

      // 3. Clean Content with JSDOM
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      // Remove noise
      ['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript', 'iframe'].forEach(
        (tag) => {
          doc.querySelectorAll(tag).forEach((el) => el.remove());
        }
      );

      const cleanText = doc.body.textContent?.replace(/\s+/g, ' ').trim().slice(0, 15000) ?? ''; // Limit to 15k chars for now

      if (cleanText.length < 200) continue;

      // 4. Index into Postgres
      const urlHash = fnv1a(res.url);

      // Upsert Web Page
      await db
        .insert(webPages)
        .values({
          id: urlHash,
          url: res.url,
          title: res.title,
          content: cleanText,
          source: 'agentic_scout',
        })
        .onConflictDoUpdate({
          target: webPages.id,
          set: { content: cleanText, title: res.title },
        });

      // 5. Generate and Store Embeddings
      // We take the first 1000 chars as a summary for the embedding if too long
      const { result: embResult } = await generateEmbeddingsWithTags(
        [cleanText.slice(0, 2000)],
        'codebase'
      );
      const vector = embResult.vectors[0];

      if (vector) {
        await db
          .insert(webEmbeddings)
          .values({
            id: urlHash,
            url: res.url,
            embedding: vector,
            tokenCount: Math.ceil(cleanText.length / 4),
          })
          .onConflictDoUpdate({
            target: webEmbeddings.id,
            set: { embedding: vector },
          });
      }

      console.log(`[Scouter] Indexed: ${res.url} (${cleanText.length} chars)`);
    } catch (err) {
      console.warn(`[Scouter] Failed to index ${res.url}:`, (err as Error).message);
    }
  }
}
