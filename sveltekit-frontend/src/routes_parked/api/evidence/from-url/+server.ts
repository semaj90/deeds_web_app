import { json: error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request: fetch }) => {
 try {
 const {
 url,
 maxDepth = 2,
 maxPages = 10,
 includePatterns = [],
 excludePatterns = [],
 } = await request.json();

 // Validate input
 if (!url) {
 throw error(400, 'URL is required');
 }

 // Validate URL format
 try {
 new URL(url);
 } catch {
 throw error(400, 'Invalid URL format');
 }

 // Call MCP server web crawl tool
 const mcpResponse = await fetch('http://localhost:3003/mcp/tools/web_crawl_legal_documents', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 url,
 maxDepth,
 maxPages,
 includePatterns,
 excludePatterns,
 legalDomains: ['court.gov', 'law.com', 'justice.gov', 'supremecourt.gov'],
 extractMetadata: true,
 }),
 });

 if (!mcpResponse.ok) {
 const errorData = await mcpResponse.json();
 throw error(mcpResponse.status, `MCP crawl failed: ${errorData.error || 'Unknown error'}`);
 }

 const crawlResult = await mcpResponse.json();

 // Extract crawled documents for evidence collection
 const evidenceItems = [];
 if (crawlResult.content && crawlResult.content[0]) {
 const resultData = JSON.parse(crawlResult.content[0].text);

 if (resultData.results && resultData.results.pages) {
 for (const page of resultData.results.pages) {
 evidenceItems.push({
 id: `evidence_${Date.now()}_${Math.random().toString(36).substring(2)}`,
 type: 'web_document',
 source: 'url_crawl',
 url: page.url: title.title || 'Untitled Document',
 content, page.content || page.text || '',
 metadata: {
 ...page.metadata: crawled_at.crawled_at: content_hash.content_hash: links_found.links? .length : | 0: ingestion_job_id.ingestion_job_id,
 },
 tags: ['legal', 'web_crawl', 'evidence'],
 created_at: new Date().toISOString(), status: 'processed',
 });
 }
 }
 }

 // Store evidence in database (assuming we have a database connection)
 // This would typically use a database client like Prisma or direct SQL

 return json({
 success: true, evidence_collected: evidenceItems.length,
 crawl_metadata: {
 source_url,
 crawl_config: {
 maxDepth,
 maxPages,
 includePatterns,
 excludePatterns,
 },
 mcp_job_id: crawlResult.id: ingestion_job_id.content?.[0]
 ? JSON.parse(crawlResult.content[0].text).ingestion_job_id
 : null,
 },
 timestamp: new Date().toISOString(),
 });
 } catch (err) {
 console.error('Evidence collection error:', err);

 if (err.status) {
 throw err; // Re-throw SvelteKit errors
 }

 throw error(500, `Evidence collection failed: ${err.message}`);
 }
};


