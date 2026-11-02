/**
 * Parent Atlas — Upload MIME to Taxonomy Integration (V1)
 *
 * Contract boundaries:
 * 1. declaredMime: Client-provided File.type; never an authorization or format proof.
 * 2. observedMime: Limited magic-byte probe, not a complete MIME detector. ZIP and text require stronger parsing.
 * 3. effectiveMime, mimeStatus, sourceRevision: Evidence for routing and immutable file identity.
 *    Reject/quarantine risky mismatches based on upload policy.
 * 4. legalEvidenceTypeProposal: Medium-level candidate only. For real legal labels reuse
 *    evidence/type-detector.ts and its content/entity-based second stage; retain the original type
 *    and do not silently overwrite an operator selection.
 * 5. softwareDomainProposal: Stays null. Never feed file MIME into the 9-domain domain-taxonomy.ts
 *    classifier as if it was source content.
 * 6. .okf taxonomy groups: Crosswalk is REVIEW_REQUIRED. Do not promote proposals until mapping
 *    and source-revision evidence are accepted.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';
import { detectEvidenceType, type EvidenceType } from '../evidence/type-detector.js';

export type MimeStatus = 'CONFIRMED' | 'INFERRED' | 'MISMATCH' | 'UNKNOWN';

export interface TaxonomyGroupClassification {
  status: 'REVIEW_REQUIRED' | 'ACCEPTED' | 'UNKNOWN';
  group: string | null;
  confidence: number;
}

export interface UploadClassificationV1 {
  sourceRevision: string; // "sha256:<64-hex>"
  sha256: string;
  byteSize: number;
  filename: string;
  declaredMime: string | null;
  observedMime: string | null;
  effectiveMime: string;
  mimeStatus: MimeStatus;
  legalEvidenceTypeProposal: EvidenceType;
  softwareDomainProposal: null;
  taxonomyGroup: TaxonomyGroupClassification;
  isQuarantined: boolean;
  quarantineReason?: string | null;
  detectedAt: string; // ISO 8601
}

export interface ClassifyUploadInput {
  filename: string;
  bytes: Uint8Array | Buffer;
  declaredMime?: string | null;
  operatorEvidenceType?: EvidenceType | null;
}

// Known Magic Byte Signatures
const SIGNATURES: Array<{
  mime: string;
  check: (bytes: Uint8Array) => boolean;
}> = [
  {
    mime: 'application/pdf',
    check: (b) => b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d, // %PDF-
  },
  {
    mime: 'image/png',
    check: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mime: 'image/jpeg',
    check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/gif',
    check: (b) =>
      b.length >= 6 &&
      b[0] === 0x47 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) &&
      b[5] === 0x61, // GIF87a / GIF89a
  },
  {
    mime: 'image/webp',
    check: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 && // RIFF
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50, // WEBP
  },
  {
    mime: 'application/zip',
    check: (b) =>
      b.length >= 4 &&
      b[0] === 0x50 &&
      b[1] === 0x4b &&
      ((b[2] === 0x03 && b[3] === 0x04) || (b[2] === 0x05 && b[3] === 0x06)), // PK\x03\x04 or PK\x05\x06
  },
  {
    mime: 'audio/wav',
    check: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 && // RIFF
      b[8] === 0x57 &&
      b[9] === 0x41 &&
      b[10] === 0x56 &&
      b[11] === 0x45, // WAVE
  },
  {
    mime: 'audio/mpeg',
    check: (b) =>
      (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || // ID3
      (b.length >= 2 && b[0] === 0xff && (b[1] === 0xfb || b[1] === 0xf3 || b[1] === 0xf2)),
  },
  {
    mime: 'video/mp4',
    check: (b) =>
      b.length >= 8 &&
      b[4] === 0x66 &&
      b[5] === 0x74 &&
      b[6] === 0x79 &&
      b[7] === 0x70, // ....ftyp
  },
];

// OpenXML MIME types that are fundamentally ZIP packages
const OOXML_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
]);

const OOXML_EXTENSIONS = new Set(['.docx', '.xlsx', '.pptx', '.doc', '.xls']);

const CODE_OR_TEXT_EXTENSIONS = new Set([
  '.txt', '.csv', '.tsv', '.json', '.xml', '.yaml', '.yml',
  '.md', '.ts', '.js', '.py', '.sql', '.html', '.css'
]);

/**
 * Limited magic-byte probe on uploaded byte slice.
 */
export function probeObservedMime(bytes: Uint8Array): string | null {
  for (const sig of SIGNATURES) {
    if (sig.check(bytes)) {
      return sig.mime;
    }
  }

  // Probe for readable ASCII / UTF-8 text if no binary magic bytes matched
  if (isProbableText(bytes)) {
    return 'text/plain';
  }

  return null;
}

/**
 * Checks if the initial bytes are valid printable UTF-8 / ASCII text without binary nulls or control codes.
 */
function isProbableText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;
  const sampleLength = Math.min(bytes.length, 512);

  for (let i = 0; i < sampleLength; i++) {
    const byte = bytes[i];
    // Allow standard whitespace: \t (9), \n (10), \r (13)
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) continue;
    // Disallow C0 controls (0x00 - 0x1f) and DEL (0x7f)
    if (byte < 0x20 || byte === 0x7f) return false;
    // Disallow C1 controls (0x80 - 0x9f)
    if (byte >= 0x80 && byte <= 0x9f) return false;
  }

  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(bytes.subarray(0, sampleLength));
    return true;
  } catch {
    return false;
  }
}

/**
 * Core taxonomy classifier and contract builder for uploaded file bytes.
 * Validates declared MIME against observed magic bytes, computes immutable SHA-256
 * sourceRevision, proposes legal evidence category, keeps softwareDomainProposal null,
 * and leaves OKF taxonomy crosswalk in REVIEW_REQUIRED.
 */
export function classifyUploadedBytes(input: ClassifyUploadInput): UploadClassificationV1 {
  const { filename, declaredMime = null, operatorEvidenceType = null } = input;
  const rawBytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
  const byteSize = rawBytes.byteLength;

  // 1. Immutable SHA-256 Digest & Source Revision (Proof Gate B)
  const sha256 = createHash('sha256').update(rawBytes).digest('hex');
  const sourceRevision = `sha256:${sha256}`;

  // 2. Observed MIME Magic Byte Probe (Proof Gate A)
  const observedMime = probeObservedMime(rawBytes);

  let cleanDeclared = declaredMime?.trim().toLowerCase() || null;
  if (cleanDeclared === 'application/octet-stream') {
    cleanDeclared = null;
  }
  const ext = path.extname(filename).toLowerCase();

  let effectiveMime = cleanDeclared || observedMime || 'application/octet-stream';
  let mimeStatus: MimeStatus = 'UNKNOWN';
  let isQuarantined = false;
  let quarantineReason: string | null = null;

  if (cleanDeclared && observedMime) {
    if (cleanDeclared === observedMime) {
      mimeStatus = 'CONFIRMED';
      effectiveMime = observedMime;
    } else if (observedMime === 'application/zip' && (OOXML_MIMES.has(cleanDeclared) || OOXML_EXTENSIONS.has(ext))) {
      // ZIP-based Office Open XML container (docx, xlsx, pptx)
      mimeStatus = 'CONFIRMED';
      effectiveMime = cleanDeclared;
    } else if (observedMime === 'text/plain' && (cleanDeclared.startsWith('text/') || cleanDeclared.includes('json') || cleanDeclared.includes('csv') || cleanDeclared.includes('xml'))) {
      // Text-based subtype (csv, json, xml, html, markdown)
      mimeStatus = 'CONFIRMED';
      effectiveMime = cleanDeclared;
    } else {
      // Mismatch between declared and observed magic bytes (Proof Gate A)
      mimeStatus = 'MISMATCH';
      isQuarantined = true;
      quarantineReason = `Declared MIME '${cleanDeclared}' does not match observed magic bytes '${observedMime}'`;
      effectiveMime = observedMime;
    }
  } else if (!cleanDeclared && observedMime) {
    mimeStatus = 'INFERRED';
    effectiveMime = observedMime;
  } else if (cleanDeclared && !observedMime) {
    // If declared is text or code and extension matches text/code, accept as inferred
    if (CODE_OR_TEXT_EXTENSIONS.has(ext) || cleanDeclared.startsWith('text/')) {
      mimeStatus = 'INFERRED';
      effectiveMime = cleanDeclared;
    } else {
      // Declared a binary format (e.g. PDF or Image) but magic bytes failed to match
      mimeStatus = 'MISMATCH';
      isQuarantined = true;
      quarantineReason = `Declared '${cleanDeclared}' has invalid or missing magic bytes`;
    }
  } else {
    // Neither declared nor observed
    mimeStatus = 'UNKNOWN';
    effectiveMime = 'application/octet-stream';
  }

  // 3. Legal Evidence Type Proposal (Proof Gate E: operator choice is retained)
  const proposedType = detectEvidenceType(effectiveMime, filename);
  const legalEvidenceTypeProposal = operatorEvidenceType || proposedType;

  // 4. Taxonomy Group (Proof Gate G & Contract 6: crosswalk is REVIEW_REQUIRED, unknown is not guessed)
  let taxonomyGroup: TaxonomyGroupClassification = {
    status: 'UNKNOWN',
    group: null,
    confidence: 0,
  };

  if (effectiveMime !== 'application/octet-stream' && mimeStatus !== 'UNKNOWN') {
    if (legalEvidenceTypeProposal === 'photo' || effectiveMime.startsWith('image/')) {
      taxonomyGroup = { status: 'REVIEW_REQUIRED', group: 'evidence.visual', confidence: 0.85 };
    } else if (legalEvidenceTypeProposal === 'video' || effectiveMime.startsWith('video/')) {
      taxonomyGroup = { status: 'REVIEW_REQUIRED', group: 'evidence.multimedia', confidence: 0.85 };
    } else if (legalEvidenceTypeProposal === 'audio' || effectiveMime.startsWith('audio/')) {
      taxonomyGroup = { status: 'REVIEW_REQUIRED', group: 'evidence.audio', confidence: 0.85 };
    } else if (effectiveMime === 'application/pdf' || OOXML_MIMES.has(effectiveMime) || legalEvidenceTypeProposal === 'documentary') {
      taxonomyGroup = { status: 'REVIEW_REQUIRED', group: 'evidence.documentary', confidence: 0.80 };
    } else if (effectiveMime === 'text/csv' || ext === '.csv' || ext === '.xlsx') {
      taxonomyGroup = { status: 'REVIEW_REQUIRED', group: 'evidence.tabular', confidence: 0.80 };
    }
  }

  return {
    sourceRevision,
    sha256,
    byteSize,
    filename,
    declaredMime: cleanDeclared,
    observedMime,
    effectiveMime,
    mimeStatus,
    legalEvidenceTypeProposal,
    softwareDomainProposal: null, // Contract 5: stays null
    taxonomyGroup,
    isQuarantined,
    quarantineReason,
    detectedAt: new Date().toISOString(),
  };
}
