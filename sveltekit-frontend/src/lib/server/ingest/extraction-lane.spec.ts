import { describe, it, expect } from 'vitest';
import { chooseExtractionLane } from './extraction-lane.js';

describe('chooseExtractionLane', () => {
  it('routes .ts to source-parser', () => {
    expect(chooseExtractionLane({ filename: 'foo.ts' })).toBe('source-parser');
  });
  it('routes .svelte to source-parser', () => {
    expect(chooseExtractionLane({ filename: 'Component.svelte' })).toBe('source-parser');
  });
  it('routes scanned PDF to docling-vlm', () => {
    expect(chooseExtractionLane({ filename: 'scanned.pdf', hasEmbeddedText: false })).toBe('docling-vlm');
  });
  it('routes native-text PDF to docling-native', () => {
    expect(chooseExtractionLane({ filename: 'native-text.pdf', hasEmbeddedText: true })).toBe('docling-native');
  });
  it('routes .docx to docling-native', () => {
    expect(chooseExtractionLane({ filename: 'court-order.docx' })).toBe('docling-native');
  });
  it('routes screenshot PNG to docling-vlm', () => {
    expect(chooseExtractionLane({ filename: 'screenshot.png', isScreenshot: true })).toBe('docling-vlm');
  });
  it('routes .log to direct-text', () => {
    expect(chooseExtractionLane({ filename: 'server.log' })).toBe('direct-text');
  });
  it('routes unknown extension to unsupported', () => {
    expect(chooseExtractionLane({ filename: 'unknown.bin' })).toBe('unsupported');
  });
  it('routes workspace .html to source-parser', () => {
    expect(chooseExtractionLane({ filename: 'index.html', context: 'workspace' })).toBe('source-parser');
  });
  it('routes uploaded .html document to docling-native', () => {
    expect(chooseExtractionLane({ filename: 'archive.html', context: 'uploaded-document' })).toBe('docling-native');
  });
  it('routes isScanned image to docling-vlm regardless of extension', () => {
    expect(chooseExtractionLane({ filename: 'scan.pdf', isScanned: true })).toBe('docling-vlm');
  });
});
