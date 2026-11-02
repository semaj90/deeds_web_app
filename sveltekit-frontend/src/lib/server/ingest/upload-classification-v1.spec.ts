import { describe, expect, it } from 'vitest';
import {
  classifyUploadedBytes,
  probeObservedMime,
  type UploadClassificationV1
} from './upload-classification-v1.js';

describe('upload-classification-v1 Contract & Proof Gates', () => {
  // Helpers to generate byte fixtures
  const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]);
  const WEBP_BYTES = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38
  ]); // RIFF...WEBP
  const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]); // PK\x03\x04
  const WAV_BYTES = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74
  ]); // RIFF...WAVE
  const MP3_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00]); // ID3
  const TEXT_BYTES = new TextEncoder().encode('TITLE,AMOUNT,DATE\nDeed of Trust,$500000,2026-10-31\n');
  const TS_CODE_BYTES = new TextEncoder().encode('export function verifyContract(): boolean { return true; }\n');

  // Proof Gate A: MIME mismatch rejects/quarantines; declared PDF disguised bytes do not silently parse
  describe('Gate A: MIME mismatch quarantine', () => {
    it('quarantines declared application/pdf when bytes are actually an image (disguised file)', () => {
      const result = classifyUploadedBytes({
        filename: 'malicious_exploit.pdf',
        declaredMime: 'application/pdf',
        bytes: PNG_BYTES,
      });

      expect(result.mimeStatus).toBe('MISMATCH');
      expect(result.isQuarantined).toBe(true);
      expect(result.quarantineReason).toContain('does not match observed magic bytes');
      expect(result.observedMime).toBe('image/png');
    });

    it('quarantines declared application/pdf when bytes have arbitrary random header', () => {
      const fakeBytes = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55]);
      const result = classifyUploadedBytes({
        filename: 'corrupted.pdf',
        declaredMime: 'application/pdf',
        bytes: fakeBytes,
      });

      expect(result.mimeStatus).toBe('MISMATCH');
      expect(result.isQuarantined).toBe(true);
      expect(result.quarantineReason).toContain('invalid or missing magic bytes');
    });

    it('confirms genuine application/pdf with valid %PDF- magic bytes', () => {
      const result = classifyUploadedBytes({
        filename: 'court_brief.pdf',
        declaredMime: 'application/pdf',
        bytes: PDF_BYTES,
      });

      expect(result.mimeStatus).toBe('CONFIRMED');
      expect(result.isQuarantined).toBe(false);
      expect(result.effectiveMime).toBe('application/pdf');
    });
  });

  // Proof Gate B: Different names for identical bytes retain the same source revision
  describe('Gate B: Source revision immutability', () => {
    it('produces identical sourceRevision for identical byte content regardless of filename', () => {
      const result1 = classifyUploadedBytes({
        filename: 'case_summary_original.pdf',
        declaredMime: 'application/pdf',
        bytes: PDF_BYTES,
      });

      const result2 = classifyUploadedBytes({
        filename: 'copied_file_different_name.pdf',
        declaredMime: 'application/pdf',
        bytes: PDF_BYTES,
      });

      expect(result1.sourceRevision).toBe(result2.sourceRevision);
      expect(result1.sha256).toBe(result2.sha256);
      expect(result1.sourceRevision.startsWith('sha256:')).toBe(true);
      expect(result1.sourceRevision.length).toBe(71); // "sha256:" + 64 hex chars
    });
  });

  // Proof Gate C: PDF, image, text, audio, OOXML, CSV, code and unsupported routes have unit tests
  describe('Gate C: Comprehensive Format Support', () => {
    it('classifies PNG image', () => {
      const res = classifyUploadedBytes({ filename: 'crime_scene.png', declaredMime: 'image/png', bytes: PNG_BYTES });
      expect(res.effectiveMime).toBe('image/png');
      expect(res.mimeStatus).toBe('CONFIRMED');
      expect(res.legalEvidenceTypeProposal).toBe('photo');
    });

    it('classifies JPEG image', () => {
      const res = classifyUploadedBytes({ filename: 'suspect.jpg', declaredMime: 'image/jpeg', bytes: JPEG_BYTES });
      expect(res.effectiveMime).toBe('image/jpeg');
      expect(res.mimeStatus).toBe('CONFIRMED');
      expect(res.legalEvidenceTypeProposal).toBe('photo');
    });

    it('classifies GIF image', () => {
      const res = classifyUploadedBytes({ filename: 'surveillance.gif', declaredMime: 'image/gif', bytes: GIF_BYTES });
      expect(res.effectiveMime).toBe('image/gif');
      expect(res.mimeStatus).toBe('CONFIRMED');
      expect(res.legalEvidenceTypeProposal).toBe('photo');
    });

    it('classifies WebP image', () => {
      const res = classifyUploadedBytes({ filename: 'scene.webp', declaredMime: 'image/webp', bytes: WEBP_BYTES });
      expect(res.effectiveMime).toBe('image/webp');
      expect(res.mimeStatus).toBe('CONFIRMED');
      expect(res.legalEvidenceTypeProposal).toBe('photo');
    });

    it('classifies OOXML DOCX Word document inside ZIP container', () => {
      const res = classifyUploadedBytes({
        filename: 'contract.docx',
        declaredMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bytes: ZIP_BYTES,
      });
      expect(res.mimeStatus).toBe('CONFIRMED');
      expect(res.effectiveMime).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(res.legalEvidenceTypeProposal).toBe('documentary');
    });

    it('classifies OOXML XLSX Spreadsheet inside ZIP container', () => {
      const res = classifyUploadedBytes({
        filename: 'financial_ledger.xlsx',
        declaredMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        bytes: ZIP_BYTES,
      });
      expect(res.mimeStatus).toBe('CONFIRMED');
      expect(res.effectiveMime).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.legalEvidenceTypeProposal).toBe('digital');
    });

    it('classifies CSV text data', () => {
      const res = classifyUploadedBytes({
        filename: 'wire_transfers.csv',
        declaredMime: 'text/csv',
        bytes: TEXT_BYTES,
      });
      expect(res.mimeStatus).toBe('CONFIRMED');
      expect(res.effectiveMime).toBe('text/csv');
      expect(res.legalEvidenceTypeProposal).toBe('digital');
      expect(res.taxonomyGroup.group).toBe('evidence.tabular');
    });

    it('classifies Audio WAV recording', () => {
      const res = classifyUploadedBytes({
        filename: '911_call.wav',
        declaredMime: 'audio/wav',
        bytes: WAV_BYTES,
      });
      expect(res.mimeStatus).toBe('CONFIRMED');
      expect(res.effectiveMime).toBe('audio/wav');
      expect(res.legalEvidenceTypeProposal).toBe('audio');
    });

    it('classifies Audio MP3 recording', () => {
      const res = classifyUploadedBytes({
        filename: 'witness_interview.mp3',
        declaredMime: 'audio/mpeg',
        bytes: MP3_BYTES,
      });
      expect(res.mimeStatus).toBe('CONFIRMED');
      expect(res.effectiveMime).toBe('audio/mpeg');
      expect(res.legalEvidenceTypeProposal).toBe('audio');
    });

    it('classifies Source Code without throwing', () => {
      const res = classifyUploadedBytes({
        filename: 'contract_validator.ts',
        declaredMime: 'text/plain',
        bytes: TS_CODE_BYTES,
      });
      expect(res.mimeStatus).toBe('CONFIRMED');
      expect(res.effectiveMime).toBe('text/plain');
    });
  });

  // Proof Gate E: No classification proposal can overwrite an operator decision
  describe('Gate E: Operator Decision Preservation', () => {
    it('preserves operator-selected evidenceType even if MIME suggests something else', () => {
      const res = classifyUploadedBytes({
        filename: 'autopsy_photo.png',
        declaredMime: 'image/png',
        bytes: PNG_BYTES,
        operatorEvidenceType: 'forensic', // Operator selected forensic
      });

      expect(res.legalEvidenceTypeProposal).toBe('forensic');
    });
  });

  // Contract 5: softwareDomainProposal stays null
  describe('Contract 5: Domain boundary enforcement', () => {
    it('strictly maintains softwareDomainProposal as null', () => {
      const res = classifyUploadedBytes({
        filename: 'auth_service.ts',
        declaredMime: 'text/plain',
        bytes: TS_CODE_BYTES,
      });

      expect(res.softwareDomainProposal).toBeNull();
    });
  });

  // Proof Gate G: Unknown taxonomy stays Unknown rather than guessed
  describe('Gate G: Unknown Taxonomy Guard', () => {
    it('sets taxonomy status to UNKNOWN and group to null for unrecognized binary formats', () => {
      const unknownBinary = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]); // ELF binary header
      const res = classifyUploadedBytes({
        filename: 'unknown_binary.bin',
        declaredMime: 'application/octet-stream',
        bytes: unknownBinary,
      });

      expect(res.taxonomyGroup.status).toBe('UNKNOWN');
      expect(res.taxonomyGroup.group).toBeNull();
    });
  });
});
