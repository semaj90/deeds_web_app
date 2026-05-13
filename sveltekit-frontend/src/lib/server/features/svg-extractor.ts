import { readFileSync } from 'node:fs';

/**
 * Extracts labels, IDs, and titles from SVG files.
 * Provides a lightweight alternative to LLM vision synthesis for basic metadata.
 */
export function extractSvgMetadata(svgPath: string): {
  labels: string[];
  ids: string[];
  title: string;
} {
  try {
    const content = readFileSync(svgPath, 'utf8');
    const ids: string[] = [];
    const labels: string[] = [];
    
    // Extract IDs
    const idMatches = content.matchAll(/id=["']([^"']+)["']/g);
    for (const m of idMatches) ids.push(m[1]);

    // Extract text labels
    const textMatches = content.matchAll(/<text[^>]*>([^<]+)<\/text>/g);
    for (const m of textMatches) labels.push(m[1].trim());

    // Extract title
    const titleMatch = content.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].trim() : '';

    return {
      labels: Array.from(new Set(labels)),
      ids: Array.from(new Set(ids)),
      title
    };
  } catch (err) {
    return { labels: [], ids: [], title: '' };
  }
}
