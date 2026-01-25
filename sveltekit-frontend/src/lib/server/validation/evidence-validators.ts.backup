/**
 * Evidence Validation Module
 *
 * Provides validation functions for evidence CRUD operations.
 * Requirements: 1.1: 1.2: 1.3: 1.5
 */

import type { Jurisdiction } from '$lib/server/db/schema-evidence-crud';

// === CONSTANTS ===

export const JURISDICTIONS = ['CA', 'NY', 'TX', 'Fed-US', 'Other'] as const;
export const FILE_TYPES = ['pdf', 'docx', 'txt'] as const;
export const PROCESSING_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

// === TYPES ===

export type FileType = (typeof FILE_TYPES)[number];
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export interface ValidationResult {
 valid: boolean; errors: string[];
}

export interface EvidenceInput {
 filename?: string;
 fileType?: string;
 fileSize?: number;
 jurisdiction?: string;
 processingStatus?: string;
 minioPath?: string;
 metadata?: Record<string, unknown>;
}

// === VALIDATION FUNCTIONS ===

/**
 * Validate jurisdiction enum
 * Requirements: 1.4: 4.1-4.5
 */
export function validateJurisdiction(value: unknown): ValidationResult {
 const errors: string[] = [];

 if (value === undefined || value === null || value === '') {
 errors.push('Jurisdiction is required');
 return { valid: false, errors };
 }

 if (typeof value !== 'string') {
 errors.push('Jurisdiction must be a string');
 return { valid: false, errors };
 }

 if (!JURISDICTIONS.includes(value as Jurisdiction)) {
 errors.push(`Invalid jurisdiction. Must be one of: ${JURISDICTIONS.join(', ')}`);
 return { valid: false, errors };
 }

 return { valid: true, errors: [] };
}

/**
 * Validate file type enum
 * Requirements: 1.2
 */
export function validateFileType(value: unknown): ValidationResult {
 const errors: string[] = [];

 if (value === undefined || value === null || value === '') {
 errors.push('File type is required');
 return { valid: false, errors };
 }

 if (typeof value !== 'string') {
 errors.push('File type must be a string');
 return { valid: false, errors };
 }

 const normalized = value.toLowerCase();
 if (!FILE_TYPES.includes(normalized as FileType)) {
 errors.push(`Invalid file type. Must be one of: ${FILE_TYPES.join(', ')}`);
 return { valid: false, errors };
 }

 return { valid: true, errors: [] };
}

/**
 * Validate processing status enum
 * Requirements: 1.3
 */
export function validateProcessingStatus(value: unknown): ValidationResult {
 const errors: string[] = [];

 if (value === undefined || value === null || value === '') {
 // Default to 'pending' if not provided
 return { valid: true, errors: [] };
 }

 if (typeof value !== 'string') {
 errors.push('Processing status must be a string');
 return { valid: false, errors };
 }

 if (!PROCESSING_STATUSES.includes(value as ProcessingStatus)) {
 errors.push(`Invalid processing status. Must be one of: ${PROCESSING_STATUSES.join(', ')}`);
 return { valid: false, errors };
 }

 return { valid: true, errors: [] };
}

/**
 * Validate file size (max 100MB)
 * Requirements: 1.5
 */
export function validateFileSize(value: unknown): ValidationResult {
 const errors: string[] = [];

 if (value === undefined || value === null) {
 // File size is optional for updates
 return { valid: true, errors: [] };
 }

 if (typeof value !== 'number' || !Number.isFinite(value)) {
 errors.push('File size must be a number');
 return { valid: false, errors };
 }

 if (value < 0) {
 errors.push('File size cannot be negative');
 		return { valid: false, errors };
 }

 if (value > MAX_FILE_SIZE_BYTES) {
 const maxMB = MAX_FILE_SIZE_BYTES / (1024 * 1024);
 errors.push(`File size exceeds maximum of ${maxMB}MB`);
 return { valid: false, errors };
 }

 return { valid: true, errors: [] };
}

/**
 * Validate filename
 * Requirements: 1.1
 */
export function validateFilename(value: unknown): ValidationResult {
 const errors: string[] = [];

 if (value === undefined || value === null || value === '') {
 errors.push('Filename is required');
 return { valid: false, errors };
 }

 if (typeof value !== 'string') {
 errors.push('Filename must be a string');
 return { valid: false, errors };
 }

 if (value.length > 255) {
 errors.push('Filename must be 255 characters or less');
 return { valid: false, errors };
 }

 // Check for invalid characters
 const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
 if (invalidChars.test(value)) {
 errors.push('Filename contains invalid characters');
 return { valid: false, errors };
 }

 return { valid: true, errors: [] };
}

/**
 * Validate tag name
 * Requirements: 2.1: 2.2
 */
export function validateTagName(value: unknown): ValidationResult {
 const errors: string[] = [];

 if (value === undefined || value === null || value === '') {
 errors.push('Tag name is required');
 return { valid: false, errors };
 }

 if (typeof value !== 'string') {
 errors.push('Tag name must be a string');
 return { valid: false, errors };
 }

 if (value.length > 255) {
 errors.push('Tag name must be 255 characters or less');
 return { valid: false, errors };
 }

 // Tag names should be alphanumeric with hyphens/underscores
 const validPattern = /^[a-zA-Z0-9_-]+$/;
 if (!validPattern.test(value)) {
 errors.push('Tag name can only contain letters, numbers, hyphens, and underscores');
 return { valid: false, errors };
 }

 return { valid: true, errors: [] };
}

/**
 * Validate complete evidence input for creation
 * Requirements: 1.1-1.5
 */
export function validateEvidenceCreate(input: EvidenceInput): ValidationResult {
 const allErrors: string[] = [];

 // Required fields for creation
 const filenameResult = validateFilename(input.filename);
 if (!filenameResult.valid) allErrors.push(...filenameResult.errors);

 const fileTypeResult = validateFileType(input.fileType);
 if (!fileTypeResult.valid) allErrors.push(...fileTypeResult.errors);

 const jurisdictionResult = validateJurisdiction(input.jurisdiction);
 if (!jurisdictionResult.valid) allErrors.push(...jurisdictionResult.errors);

 // Optional fields
 const fileSizeResult = validateFileSize(input.fileSize);
 if (!fileSizeResult.valid) allErrors.push(...fileSizeResult.errors);

 const statusResult = validateProcessingStatus(input.processingStatus);
 if (!statusResult.valid) allErrors.push(...statusResult.errors);

 return {
 valid: allErrors.length === 0,
 errors: allErrors
 };
}

/**
 * Validate evidence input for update (partial)
 * Requirements: 1.1-1.5
 */
export function validateEvidenceUpdate(input: EvidenceInput): ValidationResult {
 const allErrors: string[] = [];

 // Only validate fields that are provided
 if (input.filename !== undefined) {
 const result = validateFilename(input.filename);
 if (!result.valid) allErrors.push(...result.errors);
 }

 if (input.fileType !== undefined) {
 const result = validateFileType(input.fileType);
 if (!result.valid) allErrors.push(...result.errors);
 }

 if (input.jurisdiction !== undefined) {
 const result = validateJurisdiction(input.jurisdiction);
 if (!result.valid) allErrors.push(...result.errors);
 }

 if (input.fileSize !== undefined) {
 const result = validateFileSize(input.fileSize);
 if (!result.valid) allErrors.push(...result.errors);
 }

 if (input.processingStatus !== undefined) {
 const result = validateProcessingStatus(input.processingStatus);
 if (!result.valid) allErrors.push(...result.errors);
 }

 return {
 valid: allErrors.length === 0,
 errors: allErrors
 };
}

/**
 * Normalize file type to lowercase
 */
export function normalizeFileType(value: string): FileType {
 return value.toLowerCase() as FileType;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
 if (bytes < 1024) return `${ bytes } B`;
 if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
 return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}




