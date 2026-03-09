/* eslint-disable @typescript-eslint/no-explicit-any */

// Unified (legacy-compatible) lightweight metadata embedding helpers.
// Standard: `${dataUrl}--EMBED--${encodeURIComponent(JSON)}`
// Legacy fallback: base64(JSON) after marker.
export function embedMetadataInPNGDataUrl(
  dataUrl: string,
  metadata: Record<string, any>
): string {
  const marker = '--EMBED--';
  const json = JSON.stringify(metadata);
  return `${dataUrl}${marker}${encodeURIComponent(json)}`;
}

export function extractMetadataFromPNGDataUrl(
  embedded: string
): { dataUrl: string; png: string; metadata: Record<string, any> | null } {
  const marker = '--EMBED--';
  const idx = embedded.indexOf(marker);
  if (idx === -1) return { dataUrl: embedded, png: embedded, metadata: null };

  const dataUrl = embedded.slice(0, idx);
  const payload = embedded.slice(idx + marker.length);

  // Try decodeURIComponent(JSON)
  try {
    const decoded = decodeURIComponent(payload);
    const meta = JSON.parse(decoded);
    return { dataUrl, png: dataUrl, metadata: meta };
  } catch {
    // Legacy: base64(JSON)
    try {
      const json =
        typeof Buffer !== 'undefined'
          ? Buffer.from(payload, 'base64').toString('utf8')
          : atob(payload);
      const meta = JSON.parse(json);
      return { dataUrl, png: dataUrl, metadata: meta };
    } catch {
      return { dataUrl, png: dataUrl, metadata: null };
    }
  }
}

/**
 * PNG Tensor Embedding & Extraction Service
 * Embeds legal AI analysis metadata into PNG files using a custom appended trailer.
 * NOTE: Production-grade PNG chunk insertion can be added later.
 */

// Simple trailer marker (NOT a real PNG chunk) for portability in controlled pipelines.
const TRAILER_MARKER = new Uint8Array([0x4c, 0x41, 0x49, 0x44]); // "LAID"

export type RiskAssessment = 'low' | 'medium' | 'high' | 'critical';

export interface LegalEntity {
  type: string;
  value?: string;
  name?: string;
  confidence?: number;
}

export interface LegalAIMetadata {
  version: string;
  created_at: string;
  evidence_id: string;

  analysis_results: {
    confidence: number;
    classifications: string[];
    entities: LegalEntity[];
    risk_assessment: RiskAssessment;
    summary: string;
  };

  neural_sprite_data?: {
    compression_ratio: number;
    tensor_urls: string[];
    predictive_frames: string[];
  };

  simd_optimization_data?: {
    enabled: boolean;
    compression_ratio: number;
    tile_count: number;
    shader_format: 'webgl' | 'webgpu' | 'css' | 'svg';
    performance_tier: 'nes' | 'snes' | 'n64';
    processing_stats: {
      tiling_time_ms: number;
      compression_time_ms: number;
      shader_generation_time_ms: number;
      total_optimization_time_ms: number;
    };
  };

  processing_chain: Array<Record<string, unknown>>;

  embeddings?: {
    text_embedding: number[];
    visual_embedding?: number[];
    semantic_hash: string;
  };

  // Compatibility aliases (tests/legacy)
  processingId?: string;
  confidence?: number;
  entities?: any[];
  semanticHash?: string;
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, n >>> 0, true);
  return b;
}

function readU32le(bytes: Uint8Array, offset: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(offset, true);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function gzipEncodeUtf8(text: string): Promise<Uint8Array> {
  // Browser path
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();
    await writer.write(new TextEncoder().encode(text));
    await writer.close();

    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return concatBytes(...chunks);
  }

  // Node path
  try {
    const zlib = await import('node:zlib');
    return zlib.gzipSync(Buffer.from(text, 'utf8'));
  } catch {
    return new TextEncoder().encode(text);
  }
}

async function gzipDecodeUtf8(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    // DecompressionStream expects BufferSource - cast for TS 5.7+ ArrayBuffer strictness
    await writer.write(bytes as any);
    await writer.close();

    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return new TextDecoder().decode(concatBytes(...chunks));
  }

  try {
    const zlib = await import('node:zlib');
    const out = zlib.gunzipSync(Buffer.from(bytes));
    return out.toString('utf8');
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);

  // Browser crypto
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Node fallback
  const nodeCrypto = await import('node:crypto');
  return nodeCrypto.createHash('sha256').update(Buffer.from(data)).digest('hex');
}

export class PNGEmbedExtractor {
  /**
   * Embed metadata into a PNG buffer by appending:
   * [TRAILER_MARKER "LAID"][u32le size][gzip(JSON)]
   */
  static async embedMetadata(
    pngBuffer: ArrayBuffer,
    metadata: LegalAIMetadata
  ): Promise<ArrayBuffer> {
    const metadataJSON = JSON.stringify(metadata);
    const compressed = await gzipEncodeUtf8(metadataJSON);

    const original = new Uint8Array(pngBuffer);
    const trailer = concatBytes(TRAILER_MARKER, u32le(compressed.length), compressed);

    const out = new Uint8Array(original.length + trailer.length);
    out.set(original, 0);
    out.set(trailer, original.length);
    return out.buffer;
  }

  static async extractMetadata(pngBuffer: ArrayBuffer): Promise<LegalAIMetadata | null> {
    const view = new Uint8Array(pngBuffer);

    // Scan for marker
    for (let i = 0; i <= view.length - 8; i++) {
      if (
        view[i] === TRAILER_MARKER[0] &&
        view[i + 1] === TRAILER_MARKER[1] &&
        view[i + 2] === TRAILER_MARKER[2] &&
        view[i + 3] === TRAILER_MARKER[3]
      ) {
        const size = readU32le(view, i + 4);
        const start = i + 8;
        const end = start + size;
        if (end > view.length) return null;

        const compressed = view.slice(start, end);
        const json = await gzipDecodeUtf8(compressed);
        const parsed = JSON.parse(json) as LegalAIMetadata;

        // Best-effort compatibility mapping
        try {
          (parsed as any).processingId = (parsed as any).processingId ?? parsed.evidence_id;
          (parsed as any).confidence = (parsed as any).confidence ?? parsed.analysis_results?.confidence;

          if (!(parsed as any).entities && parsed.analysis_results?.entities) {
            (parsed as any).entities = parsed.analysis_results.entities.map((e) => ({
              type: e.type,
              value: e.value ?? e.name,
              confidence: e.confidence ?? 1
            }));
          }

          const sh = parsed.embeddings?.semantic_hash;
          if (sh && !(parsed as any).semanticHash) (parsed as any).semanticHash = sh;
        } catch {
          // ignore
        }

        return parsed;
      }
    }
    return null;
  }

  // Overloads:
  static async validateMetadata(metadata: Record<string, unknown>): Promise<boolean>;
  static async validateMetadata(
    pngBuffer: ArrayBuffer
  ): Promise<{ valid: boolean; version?: string; checksum_match?: boolean; error?: string }>;
  static async validateMetadata(
    input: ArrayBuffer | Record<string, unknown>
  ): Promise<boolean | { valid: boolean; version?: string; checksum_match?: boolean; error?: string }> {
    try {
      // Direct object validation (tests)
      if (input && typeof input === 'object' && !(input instanceof ArrayBuffer)) {
        const meta = input as any;
        const hasVersion = !!meta.version;
        const hasAnalysis = !!(meta.analysis_results || meta.analysisResults);
        if (!hasVersion || !hasAnalysis) return false;

        const hash = meta.embeddings?.semantic_hash || meta.semanticHash;
        if (hash) {
          const normalized: LegalAIMetadata = {
            version: meta.version,
            created_at: meta.created_at || meta.timestamp || new Date().toISOString(),
            evidence_id: meta.evidence_id || meta.evidenceId || meta.processingId || 'unknown',
            analysis_results:
              meta.analysis_results ||
              ({
                confidence: meta.confidence ?? 0,
                classifications: Array.isArray(meta.classifications) ? meta.classifications : [],
                entities: Array.isArray(meta.entities)
                  ? meta.entities.map((e: any) => ({
                      type: e.type,
                      value: e.value ?? e.name,
                      confidence: e.confidence ?? 1
                    }))
                  : [],
                risk_assessment: meta.risk_assessment || meta.riskAssessment || 'medium',
                summary: meta.summary || ''
              } as any),
            processing_chain: meta.processing_chain || meta.processingChain || []
          };

          const calculated = await this.calculateSemanticHash(normalized);
          return calculated === hash;
        }

        return true;
      }

      const metadata = await this.extractMetadata(input as ArrayBuffer);
      if (!metadata) return { valid: false, error: 'No metadata found' };

      const required = ['version', 'created_at', 'evidence_id', 'analysis_results'] as const;
      const missing = required.filter((k) => !(metadata as any)[k]);
      if (missing.length) {
        return { valid: false, error: `Missing fields: ${missing.join(', ')}` };
      }

      let checksumMatch = true;
      if (metadata.embeddings?.semantic_hash) {
        const calculated = await this.calculateSemanticHash(metadata);
        checksumMatch = calculated === metadata.embeddings.semantic_hash;
      }

      return { valid: true, version: metadata.version, checksum_match: checksumMatch };
    } catch (e: any) {
      return { valid: false, error: e?.message ?? String(e) };
    }
  }

  // Overloads to support legacy tests
  static async createPortableArtifact(
    imageBuffer: ArrayBuffer,
    options: {
      caseId?: string;
      evidenceId?: string;
      chainOfCustody?: string[];
      analysisResults?: LegalAIMetadata['analysis_results'];
      additionalData?: Partial<LegalAIMetadata>;
    }
  ): Promise<{
    buffer: ArrayBuffer;
    metadata: { evidenceId: string; evidence_id: string };
    integrityHash: string;
    isValid: boolean;
  }>;
  static async createPortableArtifact(
    imageBuffer: ArrayBuffer,
    evidenceId: string,
    analysisResults: LegalAIMetadata['analysis_results'],
    additionalData?: Partial<LegalAIMetadata>
  ): Promise<ArrayBuffer>;
  static async createPortableArtifact(
    imageBuffer: ArrayBuffer,
    arg2: any,
    arg3?: any,
    arg4?: any
  ): Promise<any> {
    const calledWithOptions = typeof arg2 !== 'string';

    let evidenceId: string;
    let analysisResults: LegalAIMetadata['analysis_results'];
    let additionalData: Partial<LegalAIMetadata> | undefined;

    if (!calledWithOptions) {
      evidenceId = arg2;
      analysisResults = arg3;
      additionalData = arg4;
    } else {
      const opts = arg2 as {
        evidenceId?: string;
        analysisResults?: LegalAIMetadata['analysis_results'];
        additionalData?: Partial<LegalAIMetadata>;
      };
      evidenceId = opts.evidenceId ?? `artifact-${Date.now()}`;
      analysisResults =
        opts.analysisResults ??
        (opts.additionalData as any)?.analysis_results ?? {
          confidence: 0.9,
          classifications: [],
          entities: [],
          risk_assessment: 'medium',
          summary: ''
        };
      additionalData = opts.additionalData;
    }

    const metadata: LegalAIMetadata = {
      version: '2.0',
      created_at: new Date().toISOString(),
      evidence_id: evidenceId,
      analysis_results: analysisResults,
      processing_chain: [
        { step: 'artifact_creation', success: true, created_by: 'glyph_system' }
      ],
      ...additionalData
    };

    metadata.embeddings = {
      text_embedding: [],
      semantic_hash: await this.calculateSemanticHash(metadata)
    };

    const buffer = await this.embedMetadata(imageBuffer, metadata);

    if (calledWithOptions) {
      const integrityHash = metadata.embeddings.semantic_hash;
      const validation = await this.validateMetadata(buffer);
      const isValid = typeof validation === 'boolean' ? validation : !!validation.valid;
      return {
        buffer,
        metadata: { evidenceId, evidence_id: metadata.evidence_id },
        integrityHash,
        isValid
      };
    }

    return buffer;
  }

  static async getQuickSummary(pngBuffer: ArrayBuffer): Promise<{
    evidence_id: string;
    confidence: number;
    risk_level: RiskAssessment;
    created_at: string;
    summary: string;
  } | null> {
    const metadata = await this.extractMetadata(pngBuffer);
    if (!metadata) return null;
    return {
      evidence_id: metadata.evidence_id,
      confidence: metadata.analysis_results.confidence,
      risk_level: metadata.analysis_results.risk_assessment,
      created_at: metadata.created_at,
      summary: metadata.analysis_results.summary
    };
  }

  private static async calculateSemanticHash(metadata: LegalAIMetadata): Promise<string> {
    const hashInput = [
      metadata.evidence_id,
      metadata.analysis_results?.summary ?? '',
      JSON.stringify(metadata.analysis_results?.classifications ?? []),
      metadata.created_at
    ].join('|');
    return sha256Hex(hashInput);
  }
}

// Convenience exports
export const embedLegalMetadata = PNGEmbedExtractor.embedMetadata;
export const extractLegalMetadata = PNGEmbedExtractor.extractMetadata;
export const createPortableEvidence = PNGEmbedExtractor.createPortableArtifact;
export const validatePortableEvidence = PNGEmbedExtractor.validateMetadata;
