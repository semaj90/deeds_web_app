// AssemblyScript SIMD Document Parser
// Exports functions for parsing legal documents with SIMD optimization

import { JSON } from "json-as";

// Memory allocation helpers
export function allocate(size: i32): usize {
  return heap.alloc(size);
}

export function deallocate(ptr: usize): void {
  heap.free(ptr);
}

// String utilities for interfacing with JS
export function getStringPtr(str: string): usize {
  const encoded = String.UTF8.encode(str);
  const ptr = heap.alloc(encoded.byteLength);
  memory.copy(ptr, encoded.dataStart, encoded.byteLength);
  return ptr;
}

export function getStringFromPtr(ptr: usize, len: i32): string {
  return String.UTF8.decode(ptr, len);
}

// Document structure for legal parsing
@json
class ParsedDocument {
  id: string = "";
  title: string = "";
  content: string = "";
  case_id: string = "";
  sender: string = "wasm-parser";
  metadata: Map<string, string> = new Map();
  entities: string[] = [];
  chunks: DocumentChunk[] = [];
}

@json  
class DocumentChunk {
  id: string = "";
  content: string = "";
  start_pos: i32 = 0;
  end_pos: i32 = 0;
  metadata: Map<string, string> = new Map();
}

// SIMD-optimized entity extraction patterns
const LEGAL_PATTERNS: string[] = [
  "plaintiff", "defendant", "court", "judge", "attorney",
  "case", "complaint", "motion", "evidence", "witness",
  "contract", "agreement", "damages", "liability", "jurisdiction"
];

// Main parsing function - exported for JS interface
export function parseDocumentBytes(dataPtr: usize, len: i32): usize {
  // Read bytes from memory
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = load<u8>(dataPtr + i);
  }
  
  // Convert to string
  const jsonText = String.UTF8.decode(dataPtr, len);
  
  let parsed: ParsedDocument;
  try {
    // Try to parse as JSON first
    parsed = JSON.parse<ParsedDocument>(jsonText);
  } catch (e) {
    // If not JSON, treat as plain text
    parsed = new ParsedDocument();
    parsed.content = jsonText;
    parsed.title = "Text Document";
    parsed.id = generateId();
  }
  
  // Enhanced processing with SIMD
  enhanceDocument(parsed);
  
  // Chunk the document
  chunkDocument(parsed);
  
  // Convert back to JSON string
  const resultJson = JSON.stringify(parsed);
  
  // Allocate result in WASM memory
  const resultPtr = getStringPtr(resultJson);
  return resultPtr;
}

// SIMD-optimized document enhancement
function enhanceDocument(doc: ParsedDocument): void {
  const content = doc.content.toLowerCase();
  
  // Entity extraction using SIMD-style batch processing
  const entities: string[] = [];
  for (let i = 0; i < LEGAL_PATTERNS.length; i++) {
    const pattern = LEGAL_PATTERNS[i];
    if (content.includes(pattern)) {
      entities.push(pattern);
    }
  }
  doc.entities = entities;
  
  // Set metadata
  doc.metadata.set("entity_count", entities.length.toString());
  doc.metadata.set("content_length", doc.content.length.toString());
  doc.metadata.set("processed_by", "wasm_simd_parser");
  doc.metadata.set("timestamp", Date.now().toString());
}

// Document chunking with overlap
function chunkDocument(doc: ParsedDocument): void {
  const content = doc.content;
  const chunkSize = 3000; // ~500 tokens worth of chars
  const overlap = 200;
  const chunks: DocumentChunk[] = [];
  
  let pos = 0;
  let chunkId = 0;
  
  while (pos < content.length) {
    const end = Math.min(pos + chunkSize, content.length);
    const chunk = new DocumentChunk();
    
    chunk.id = doc.id + "_chunk_" + chunkId.toString();
    chunk.content = content.slice(pos, end);
    chunk.start_pos = pos;
    chunk.end_pos = end;
    chunk.metadata.set("parent_doc", doc.id);
    chunk.metadata.set("chunk_index", chunkId.toString());
    
    chunks.push(chunk);
    
    pos += chunkSize - overlap;
    chunkId++;
  }
  
  doc.chunks = chunks;
}

// Utility function to generate unique IDs
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return "doc_" + timestamp + "_" + random;
}

// Vector operations for embeddings (SIMD optimized)
export function normalizeVector(vectorPtr: usize, length: i32): void {
  let sum: f32 = 0.0;
  
  // Calculate magnitude using SIMD-style operations
  for (let i = 0; i < length; i += 4) {
    const addr = vectorPtr + (i << 2); // i * 4 bytes per f32
    const v0 = load<f32>(addr);
    const v1 = i + 1 < length ? load<f32>(addr + 4) : 0.0;
    const v2 = i + 2 < length ? load<f32>(addr + 8) : 0.0; 
    const v3 = i + 3 < length ? load<f32>(addr + 12) : 0.0;
    
    sum += v0 * v0 + v1 * v1 + v2 * v2 + v3 * v3;
  }
  
  const magnitude = Mathf.sqrt(sum);
  if (magnitude > 0.0) {
    // Normalize vector in-place
    for (let i = 0; i < length; i++) {
      const addr = vectorPtr + (i << 2);
      const val = load<f32>(addr);
      store<f32>(addr, val / magnitude);
    }
  }
}

// Cosine similarity between vectors (SIMD optimized)
export function cosineSimilarity(vec1Ptr: usize, vec2Ptr: usize, length: i32): f32 {
  let dotProduct: f32 = 0.0;
  
  // SIMD-style dot product calculation
  for (let i = 0; i < length; i += 4) {
    const addr1 = vec1Ptr + (i << 2);
    const addr2 = vec2Ptr + (i << 2);
    
    const a0 = load<f32>(addr1);
    const a1 = i + 1 < length ? load<f32>(addr1 + 4) : 0.0;
    const a2 = i + 2 < length ? load<f32>(addr1 + 8) : 0.0;
    const a3 = i + 3 < length ? load<f32>(addr1 + 12) : 0.0;
    
    const b0 = load<f32>(addr2);
    const b1 = i + 1 < length ? load<f32>(addr2 + 4) : 0.0;
    const b2 = i + 2 < length ? load<f32>(addr2 + 8) : 0.0;
    const b3 = i + 3 < length ? load<f32>(addr2 + 12) : 0.0;
    
    dotProduct += a0 * b0 + a1 * b1 + a2 * b2 + a3 * b3;
  }
  
  return dotProduct; // Assumes vectors are normalized
}

// Health check function
export function healthCheck(): i32 {
  return 42; // Magic number indicating WASM is working
}