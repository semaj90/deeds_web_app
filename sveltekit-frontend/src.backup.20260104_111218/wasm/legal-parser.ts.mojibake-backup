/**
 * Legal Document Parser in AssemblyScript
 */

// === Type Aliases ===
type usize = number;
type i32 = number;
type f32 = number;
type bool = boolean;

// === WASM Type Descriptors ===
interface WasmGlobals {
  load8_u?: (ptr: number) => number;
  store8?: (ptr: number, value: number) => void;
  __wasm_memory_bytes__?: Uint8Array;
  heap?: {
    alloc?: (size: number) => number;
    free?: (ptr: number) => void;
  };
  [key: string]: unknown;
}

// === Memory Management ===
import type { allocateVectorMemory, freeVectorMemory } from './vector-operations.js';

function loadByte(ptr: usize): number {
  const g = globalThis as unknown as WasmGlobals;
  if (typeof g.load8_u === 'function') {
    return g.load8_u(ptr);
  }
  if (g.__wasm_memory_bytes__ instanceof Uint8Array) {
    return g.__wasm_memory_bytes__[ptr] || 0;
  }
  return 0;
}

function storeByte(ptr: usize, value: number): void {
  const g = globalThis as unknown as WasmGlobals;
  if (typeof g.store8 === 'function') {
    g.store8(ptr, value);
    return;
  }
  if (g.__wasm_memory_bytes__ instanceof Uint8Array) {
    g.__wasm_memory_bytes__[ptr] = value & 0xff;
    return;
  }
}

// === Legal Document Structure ===
class LegalDocument {
  id: string = '';
  title: string = '';
  content: string = '';
  documentType: string = '';
  citations: string[] = [];
  entities: string[] = [];
  caseNumber: string = '';
  court: string = '';
  date: string = '';
  parties: string[] = [];
  keywords: string[] = [];
  summary: string = '';
}

class ParseResult {
  success: boolean = false;
  documents: LegalDocument[] = [];
  totalChunks: number = 0;
  processingTime: number = 0.0;
  errorMessage: string = '';
}

// === Global Parser State ===
let globalResult: ParseResult = new ParseResult();
let tempBuffer: usize = 0;
const TEMP_BUFFER_SIZE = 64 * 1024;

// === Citation Pattern Recognition ===
const CITATION_PATTERNS = [
  'U.S.',
  'F.3d',
  'F.2d',
  'S.Ct.',
  'L.Ed.2d',
  'Fed.R.Civ.P.',
  'F.Supp.3d',
  'F.Supp.2d',
  'F.Supp.',
  'F.R.D.',
  'B.R.'
];

const LEGAL_ENTITIES = [
  'court',
  'judge',
  'plaintiff',
  'defendant',
  'attorney',
  'counsel',
  'petitioner',
  'respondent',
  'appellant',
  'appellee',
  'party',
  'witness'
];

// === String Processing Utilities ===
function toLowerCase(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    let c = char;
    if (c >= 65 && c <= 90) {
      c += 32;
    }
    result += String.fromCharCode(c);
  }
  return result;
}

function indexOf(str: string, search: string, start: i32 = 0): i32 {
  if (search.length === 0) return start;
  if (start < 0) start = 0;
  for (let i = start; i <= str.length - search.length; i++) {
    let found = true;
    for (let j = 0; j < search.length; j++) {
      if (str.charCodeAt(i + j) !== search.charCodeAt(j)) {
        found = false;
        break;
      }
    }
    if (found) return i;
  }
  return -1;
}

function substring(str: string, start: i32, end: i32 = -1): string {
  if (start < 0) start = 0;
  if (end === -1) end = str.length;
  if (end > str.length) end = str.length;
  if (start >= end) return '';
  let result = '';
  for (let i = start; i < end; i++) {
    result += String.fromCharCode(str.charCodeAt(i));
  }
  return result;
}

function split(str: string, delimiter: string): string[] {
  const result: string[] = [];
  let start = 0;
  let pos = indexOf(str, delimiter, start);
  while (pos >= 0) {
    result.push(substring(str, start, pos));
    start = pos + delimiter.length;
    pos = indexOf(str, delimiter, start);
  }
  if (start < str.length) {
    result.push(substring(str, start));
  }
  return result;
}

function trim(str: string): string {
  let start = 0;
  let end = str.length;
  while (start < end) {
    const char = str.charCodeAt(start);
    if (char !== 32 && char !== 9 && char !== 10 && char !== 13) break;
    start++;
  }
  while (end > start) {
    const char = str.charCodeAt(end - 1);
    if (char !== 32 && char !== 9 && char !== 10 && char !== 13) break;
    end--;
  }
  return substring(str, start, end);
}

// === Citation Extraction ===
function extractCitations(text: string): string[] {
  const citations: string[] = [];
  const lowerText = toLowerCase(text);
  for (let i = 0; i < CITATION_PATTERNS.length; i++) {
    const pattern = toLowerCase(CITATION_PATTERNS[i]);
    let pos = indexOf(lowerText, pattern);
    while (pos >= 0) {
      let start = pos - 30;
      if (start < 0) start = 0;
      let end = pos + pattern.length + 50;
      if (end > text.length) end = text.length;
      const citation = trim(substring(text, start, end));
      if (citation.length > 10) {
        citations.push(citation);
      }
      pos = indexOf(lowerText, pattern, pos + 1);
    }
  }
  return citations;
}

// === Entity Extraction ===
function extractEntities(text: string): string[] {
  const entities: string[] = [];
  const lowerText = toLowerCase(text);
  const words = split(lowerText, ' ');
  for (let i = 0; i < words.length; i++) {
    const word = trim(words[i]);
    for (let j = 0; j < LEGAL_ENTITIES.length; j++) {
      if (word === LEGAL_ENTITIES[j]) {
        let entity = word;
        if (i + 1 < words.length) {
          const nextWord = trim(words[i + 1]);
          if (nextWord.length > 2) {
            entity += ' ' + nextWord;
          }
        }
        entities.push(entity);
        break;
      }
    }
  }
  return entities;
}

// === Keyword Extraction ===
function extractKeywords(text: string): string[] {
  const keywords: string[] = [];
  const lowerText = toLowerCase(text);
  const LEGAL_KEYWORDS = [
    'contract',
    'agreement',
    'breach',
    'damages',
    'liability',
    'negligence',
    'tort',
    'plaintiff',
    'defendant',
    'litigation',
    'evidence',
    'testimony',
    'judgment',
    'appeal',
    'settlement',
    'arbitration'
  ];
  for (let i = 0; i < LEGAL_KEYWORDS.length; i++) {
    if (indexOf(lowerText, LEGAL_KEYWORDS[i]) >= 0) {
      keywords.push(LEGAL_KEYWORDS[i]);
    }
  }
  return keywords;
}

// === Document Type Detection ===
function detectDocumentType(content: string): string {
  const lowerContent = toLowerCase(content);
  if (indexOf(lowerContent, 'contract') >= 0 || indexOf(lowerContent, 'agreement') >= 0) {
    return 'contract';
  } else if (indexOf(lowerContent, 'motion') >= 0 || indexOf(lowerContent, 'petition') >= 0) {
    return 'motion';
  } else if (indexOf(lowerContent, 'brief') >= 0 || indexOf(lowerContent, 'memorandum') >= 0) {
    return 'brief';
  } else if (indexOf(lowerContent, 'judgment') >= 0 || indexOf(lowerContent, 'order') >= 0) {
    return 'judgment';
  }
  return 'document';
}

// === Summary Generation ===
function generateSummary(content: string): string {
  if (content.length <= 200) return content;
  let summary = substring(content, 0, 200);
  const lastSpace = summary.lastIndexOf(' ');
  if (lastSpace > 150) {
    summary = substring(summary, 0, lastSpace) + '...';
  }
  return summary;
}

// === Main Parsing Functions ===
function parseLegalDocument(jsonText: string): LegalDocument {
  const doc = new LegalDocument();
  const idMatch = indexOf(jsonText, '"id"');
  if (idMatch >= 0) {
    const start = indexOf(jsonText, '"', idMatch + 4) + 1;
    const end = indexOf(jsonText, '"', start);
    if (end > start) {
      doc.id = substring(jsonText, start, end);
    }
  }
  const titleMatch = indexOf(jsonText, '"title"');
  if (titleMatch >= 0) {
    const start = indexOf(jsonText, '"', titleMatch + 7) + 1;
    const end = indexOf(jsonText, '"', start);
    if (end > start) {
      doc.title = substring(jsonText, start, end);
    }
  }
  const contentMatch = indexOf(jsonText, '"content"');
  if (contentMatch >= 0) {
    const start = indexOf(jsonText, '"', contentMatch + 9) + 1;
    const end = indexOf(jsonText, '"', start);
    if (end > start) {
      doc.content = substring(jsonText, start, end);
    }
  }
  if (doc.content.length > 0) {
    doc.documentType = detectDocumentType(doc.content);
    doc.citations = extractCitations(doc.content);
    doc.entities = extractEntities(doc.content);
    doc.keywords = extractKeywords(doc.content);
    doc.summary = generateSummary(doc.content);
  }
  return doc;
}

// === Export: Memory Allocator ===
export function allocateMemory(size: i32): usize {
  if (typeof allocateVectorMemory === 'function') {
    try {
      return allocateVectorMemory(size) as unknown as usize;
    } catch {
      // fall through
    }
  }
  const g = globalThis as unknown as WasmGlobals;
  if (g?.heap && typeof g.heap.alloc === 'function') {
    return g.heap.alloc(size) as usize;
  }
  throw new Error('No allocator available');
}

export function freeMemory(ptr: usize): void {
  if (typeof freeVectorMemory === 'function') {
    try {
      freeVectorMemory(ptr);
      return;
    } catch {
      // fall through
    }
  }
  const g = globalThis as unknown as WasmGlobals;
  if (g?.heap && typeof g.heap.free === 'function') {
    g.heap.free(ptr);
    return;
  }
}

// === Export: Main Parser ===
export function parseDocuments(jsonPtr: usize, jsonLength: i32): bool {
  if (jsonLength <= 0) {
    globalResult.success = false;
    globalResult.errorMessage = 'Empty JSON input';
    return false;
  }
  const startTime = Date.now();
  globalResult = new ParseResult();
  let jsonText = '';
  for (let i = 0; i < jsonLength; i++) {
    jsonText += String.fromCharCode(loadByte(jsonPtr + i));
  }
  if (jsonText.length === 0) {
    globalResult.success = false;
    globalResult.errorMessage = 'Empty JSON text';
    return false;
  }
  if (jsonText.charCodeAt(0) === 91) {
    const docs = split(jsonText, '},{');
    for (let i = 0; i < docs.length; i++) {
      let docJson = docs[i];
      if (i === 0) {
        docJson = substring(docJson, 1);
      }
      if (i === docs.length - 1) {
        docJson = substring(docJson, 0, docJson.length - 1);
      }
      if (docJson.charCodeAt(0) !== 123) docJson = '{' + docJson;
      if (docJson.charCodeAt(docJson.length - 1) !== 125) docJson = docJson + '}';
      const doc = parseLegalDocument(docJson);
      globalResult.documents.push(doc);
      globalResult.totalChunks++;
    }
  } else {
    const doc = parseLegalDocument(jsonText);
    globalResult.documents.push(doc);
    globalResult.totalChunks = 1;
  }
  globalResult.success = true;
  globalResult.processingTime = Date.now() - startTime;
  return globalResult.success;
}

export function getResultCount(): i32 {
  return globalResult.documents.length;
}

export function getProcessingTime(): f32 {
  return globalResult.processingTime;
}

export function getDocument(_index: i32, outputPtr: usize, maxLength: i32): i32 {
  const doc = globalResult.documents[_index];
  if (!doc) return 0;
  const json = JSON.stringify(doc);
  let copyLength = json.length;
  if (copyLength > maxLength - 1) {
    copyLength = maxLength - 1;
  }
  for (let i = 0; i < copyLength; i++) {
    storeByte(outputPtr + i, json.charCodeAt(i));
  }
  storeByte(outputPtr + copyLength, 0);
  return copyLength;
}

export function initializeParser(): bool {
  if (tempBuffer === 0) {
    try {
      tempBuffer = allocateMemory(TEMP_BUFFER_SIZE);
    } catch (e) {
      tempBuffer = 0;
    }
    return tempBuffer !== 0;
  }
  return true;
}

export function cleanupParser(): void {
  if (tempBuffer !== 0) {
    try {
      freeMemory(tempBuffer);
    } catch (e) {
      // no-op
    }
    tempBuffer = 0;
  }
  globalResult = new ParseResult();
}

export function getMemoryUsage(): i32 {
  return TEMP_BUFFER_SIZE;
}


