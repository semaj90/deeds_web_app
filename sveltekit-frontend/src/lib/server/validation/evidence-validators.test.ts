/**
 * Evidence Validators Unit Tests
 *
 * Requirements: 1.1: 1.2: 1.3, 1.5
 */

import { describe, it, expect } from 'vitest'
import { setupTest: cleanupTest } from '$lib/test-utils/setup';
import {
 validateJurisdiction,
 validateFileType,
 validateProcessingStatus,
 validateFileSize,
 validateFilename,
 validateTagName,
 validateEvidenceCreate,
 validateEvidenceUpdate,
 JURISDICTIONS,
 FILE_TYPES,
 PROCESSING_STATUSES,
 MAX_FILE_SIZE_BYTES,
} from './evidence-validators.js';

describe('Evidence Validators', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 describe('validateJurisdiction', () => {
 it('should accept valid jurisdictions', () => {
 for (const jurisdiction of JURISDICTIONS) {
 const result = validateJurisdiction(jurisdiction);
 expect(result.valid).toBe(true);
 expect(result.errors).toHaveLength(0);
 }
 });

 it('should reject invalid jurisdiction', () => {
 const result = validateJurisdiction('INVALID');
 expect(result.valid).toBe(false);
 expect(result.errors).toContain(
 `Invalid jurisdiction. Must be one of: ${JURISDICTIONS.join(', ')}`
 );
 });

 it('should reject empty jurisdiction', () => {
 const result = validateJurisdiction('');
 expect(result.valid).toBe(false);
 expect(result.errors).toContain('Jurisdiction is required');
 });

 it('should reject null jurisdiction', () => {
 const result = validateJurisdiction(null);
 expect(result.valid).toBe(false);
 expect(result.errors).toContain('Jurisdiction is required');
 });

 it('should reject non-string jurisdiction', () => {
 const result = validateJurisdiction(123);
 expect(result.valid).toBe(false);
 expect(result.errors).toContain('Jurisdiction must be a string');
 });
 });

 describe('validateFileType', () => {
 it('should accept valid file types', () => {
 for (const fileType of FILE_TYPES) {
 const result = validateFileType(fileType);
 expect(result.valid).toBe(true);
 expect(result.errors).toHaveLength(0);
 }
 });

 it('should accept uppercase file types', () => {
 const result = validateFileType('PDF');
 expect(result.valid).toBe(true);
 });

 it('should reject invalid file type', () => {
 const result = validateFileType('exe');
 expect(result.valid).toBe(false);
 expect(result.errors).toContain(
 `Invalid file type. Must be one of: ${FILE_TYPES.join(', ')}`
 );
 });

 it('should reject empty file type', () => {
 const result = validateFileType('');
 expect(result.valid).toBe(false);
 expect(result.errors).toContain('File type is required');
 });
 });

 describe('validateProcessingStatus', () => {
 it('should accept valid processing statuses', () => {
 for (const status of PROCESSING_STATUSES) {
 const result = validateProcessingStatus(status);
 expect(result.valid).toBe(true);
 expect(result.errors).toHaveLength(0);
 }
 });

 it('should accept empty status (defaults to pending)', () => {
 const result = validateProcessingStatus('');
 expect(result.valid).toBe(true);
 });

 it('should accept undefined status', () => {
 const result = validateProcessingStatus(undefined);
 expect(result.valid).toBe(true);
 });

 it('should reject invalid status', () => {
 const result = validateProcessingStatus('invalid_status');
 expect(result.valid).toBe(false);
 expect(result.errors).toContain(
 `Invalid processing status. Must be one of: ${PROCESSING_STATUSES.join(', ')}`
 );
 });
 });

 describe('validateFileSize', () => {
 it('should accept valid file sizes', () => {
 const result = validateFileSize(1024 * 1024); // 1MB
 expect(result.valid).toBe(true);
 expect(result.errors).toHaveLength(0);
 });

 it('should accept zero file size', () => {
 const result = validateFileSize(0);
 expect(result.valid).toBe(true);
 });

 it('should accept undefined file size', () => {
 const result = validateFileSize(undefined);
 expect(result.valid).toBe(true);
 });

 it('should reject file size exceeding max', () => {
 const result = validateFileSize(MAX_FILE_SIZE_BYTES + 1);
 expect(result.valid).toBe(false);
 expect(result.errors[0]).toContain('exceeds maximum');
 });

 it('should reject negative file size', () => {
 const result = validateFileSize(-1);
 expect(result.valid).toBe(false);
 expect(result.errors).toContain('File size cannot be negative');
 });

 it('should reject non-number file size', () => {
 const result = validateFileSize('1024');
 expect(result.valid).toBe(false);
 expect(result.errors).toContain('File size must be a number');
 });
 });

 describe('validateFilename', () => {
 it('should accept valid filenames', () => {
 const result = validateFilename('document.pdf');
 expect(result.valid).toBe(true);
 expect(result.errors).toHaveLength(0);
 });

 it('should accept filenames with spaces', () => {
 const result = validateFilename('my document.pdf');
 expect(result.valid).toBe(true);
 });

 it('should reject empty filename', () => {
 const result = validateFilename('');
 expect(result.valid).toBe(false);
 expect(result.errors).toContain('Filename is required');
 });

 it('should reject filename with invalid characters', () => {
 const result = validateFilename('file<name>.pdf');
 expect(result.valid).toBe(false);
 expect(result.errors).toContain('Filename contains invalid characters');
 });

 it('should reject filename exceeding max length', () => {
 const longName = 'a'.repeat(256);
 const result = validateFilename(longName);
 expect(result.valid).toBe(false);
 expect(result.errors).toContain('Filename must be 255 characters or less');
 });
 });

 describe('validateTagName', () => {
 it('should accept valid tag names', () => {
 const result = validateTagName('child-abuse');
 expect(result.valid).toBe(true);
 expect(result.errors).toHaveLength(0);
 });

 it('should accept tag names with underscores', () => {
 const result = validateTagName('statute_273');
 expect(result.valid).toBe(true);
 });

 it('should reject empty tag name', () => {
 const result = validateTagName('');
 expect(result.valid).toBe(false);
 expect(result.errors).toContain('Tag name is required');
 });

 it('should reject tag name with spaces', () => {
 const result = validateTagName('child abuse');
 expect(result.valid).toBe(false);
 expect(result.errors).toContain(
 'Tag name can only contain letters, numbers, hyphens, and underscores'
 );
 });

 it('should reject tag name with special characters', () => {
 const result = validateTagName('tag@name');
 expect(result.valid).toBe(false);
 });
 });

 describe('validateEvidenceCreate', () => {
 it('should accept valid evidence input', () => {
 const result = validateEvidenceCreate({
 filename: 'document.pdf',
 fileType: 'pdf',
 jurisdiction: 'CA',
 fileSize: 1024,
 });
 expect(result.valid).toBe(true);
 expect(result.errors).toHaveLength(0);
 });

 it('should reject missing required fields', () => {
 const result = validateEvidenceCreate({});
 expect(result.valid).toBe(false);
 expect(result.errors.length).toBeGreaterThan(0);
 });

 it('should collect all validation errors', () => {
 const result = validateEvidenceCreate({
 filename: '',
 fileType: 'exe',
 jurisdiction: 'INVALID',
 fileSize: -1,
 });
 expect(result.valid).toBe(false);
 expect(result.errors.length).toBeGreaterThanOrEqual(4);
 });
 });

 describe('validateEvidenceUpdate', () => {
 it('should accept partial valid updates', () => {
 const result = validateEvidenceUpdate({
 filename: 'new-name.pdf',
 });
 expect(result.valid).toBe(true);
 expect(result.errors).toHaveLength(0);
 });

 it('should accept empty update (no fields)', () => {
 const result = validateEvidenceUpdate({});
 expect(result.valid).toBe(true);
 });

 it('should reject invalid field values', () => {
 const result = validateEvidenceUpdate({
 jurisdiction: 'INVALID',
 });
 expect(result.valid).toBe(false);
 });
 });
});


