import path from 'node:path';

export type ExtractionLane =
  | 'source-parser'
  | 'docling-native'
  | 'docling-vlm'
  | 'direct-text'
  | 'unsupported';

export type IngestionContext = 'workspace' | 'uploaded-document' | 'browser-capture';

export interface ExtractionInput {
  filename: string;
  mimeType?: string | null;
  hasEmbeddedText?: boolean;
  isScanned?: boolean;
  isScreenshot?: boolean;
  context?: IngestionContext;
}

const SOURCE_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cs', '.css', '.go', '.html', '.java',
  '.js', '.jsx', '.json', '.md', '.mjs', '.mts', '.py', '.rs',
  '.sql', '.svelte', '.ts', '.tsx', '.yaml', '.yml',
]);

const DIRECT_TEXT_EXTENSIONS = new Set(['.csv', '.log', '.txt']);

const DOCUMENT_EXTENSIONS = new Set(['.docx', '.html', '.pdf', '.pptx', '.xlsx']);

const IMAGE_EXTENSIONS = new Set(['.bmp', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp']);

/**
 * Routes an input file to the correct extraction lane.
 * Never writes packets, Qdrant points, or Neo4j nodes — routing only.
 *
 * .html routing depends on ingestion context:
 *   workspace | browser-capture → source-parser (DOM/text already accessible)
 *   uploaded-document           → docling-native (web archive, treat as document)
 */
export function chooseExtractionLane(input: ExtractionInput): ExtractionLane {
  const ext = path.extname(input.filename).toLowerCase();
  const mime = input.mimeType?.toLowerCase() ?? '';
  const ctx = input.context ?? 'workspace';

  // Source code (includes .html in workspace/browser context)
  if (SOURCE_EXTENSIONS.has(ext)) {
    if (ext === '.html' && ctx === 'uploaded-document') {
      // Web archive uploaded as document → treat as Docling input
      return input.hasEmbeddedText === false ? 'docling-vlm' : 'docling-native';
    }
    return 'source-parser';
  }

  // Screenshots and scanned images → VLM (Granite Docling with image understanding)
  if (
    input.isScreenshot ||
    input.isScanned ||
    IMAGE_EXTENSIONS.has(ext) ||
    mime.startsWith('image/')
  ) {
    return 'docling-vlm';
  }

  // Documents with or without embedded text
  if (DOCUMENT_EXTENSIONS.has(ext) || mime === 'application/pdf') {
    return input.hasEmbeddedText === false ? 'docling-vlm' : 'docling-native';
  }

  // Plain text files
  if (DIRECT_TEXT_EXTENSIONS.has(ext) || mime.startsWith('text/')) {
    return 'direct-text';
  }

  return 'unsupported';
}
