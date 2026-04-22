import { JSDOM } from 'jsdom';

/**
 * normalize-html.ts — Strip boilerplate and extract clean text/markdown from raw HTML.
 */

export function normalizeHtml(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // 1. Remove noise
  const selectorsToRemove = [
    'script', 'style', 'nav', 'footer', 'header', 
    'aside', 'iframe', 'noscript', '.ads', '.sidebar'
  ];
  selectorsToRemove.forEach(s => {
    doc.querySelectorAll(s).forEach(el => el.remove());
  });

  // 2. Extract content area (heuristic)
  const main = doc.querySelector('main') || doc.querySelector('article') || doc.querySelector('#content') || doc.body;

  // 3. Simple text extraction
  let text = main.textContent || '';
  
  // 4. Cleanup whitespace
  text = text.replace(/\n\s*\n/g, '\n\n').replace(/[ \t]+/g, ' ').trim();

  return text;
}
