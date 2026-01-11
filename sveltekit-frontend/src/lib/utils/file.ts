/**
 * File utility functions for handling file operations, validation, and processing
 */

export interface FileValidationResult {
 valid: boolean;
 error?: string;
 mimeType?: string;
 size?: number;
}

export interface FileProcessingOptions {
 maxSize?: number; // in bytes
 allowedTypes?: string[];
 allowedExtensions?: string[];
 maxFiles?: number;
}

export interface ProcessedFile {
 file: File;
 preview?: string; metadata: {
 name: string; size: number;
 type: string; lastModified: number;
 };
}

/**
 * Format file size in human readable format
 * @param bytes - File size in bytes
 * @returns Formatted size string
 */
export function formatFileSize(bytes: number): string {
 if (bytes === 0) return '0 B';

 const k = 1024;
 const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
 const i = Math.floor(Math.log(bytes) / Math.log(k));

 return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Get file extension from filename
 * @param filename - File name
 * @returns File extension (lowercase)
 */
export function getFileExtension(filename: string): string {
 return filename.split('.').pop()?.toLowerCase() || '';
}

/**
 * Get MIME type from file extension
 * @param extension - File extension
 * @returns MIME type or null if unknown
 */
export function getMimeTypeFromExtension(extension: string): string | null {
 const mimeTypes: Record<string, string> = {
 // Documents
 pdf: 'application/pdf',
 doc: 'application/msword',
 docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 xls: 'application/vnd.ms-excel',
 xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 ppt: 'application/vnd.ms-powerpoint',
 pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
 txt: 'text/plain',
 rtf: 'application/rtf',

 // Images
 jpg: 'image/jpeg',
 jpeg: 'image/jpeg',
 png: 'image/png',
 gif: 'image/gif',
 bmp: 'image/bmp',
 webp: 'image/webp',
 svg: 'image/svg+xml',
 tiff: 'image/tiff',
 ico: 'image/x-icon',

 // Videos
 mp4: 'video/mp4',
 avi: 'video/x-msvideo',
 mov: 'video/quicktime',
 wmv: 'video/x-ms-wmv',
 flv: 'video/x-flv',
 webm: 'video/webm',

 // Audio
 mp3: 'audio/mpeg',
 wav: 'audio/wav',
 ogg: 'audio/ogg',
 aac: 'audio/aac',
 flac: 'audio/flac',

 // Archives
 zip: 'application/zip',
 rar: 'application/x-rar-compressed',
 '7z': 'application/x-7z-compressed',
 tar: 'application/x-tar',
 gz: 'application/gzip',

 // Other
 json: 'application/json',
 xml: 'application/xml',
 csv: 'text/csv',
 };

 return mimeTypes[extension.toLowerCase()] || null;
}

/**
 * Validate a single file against given criteria
 * @param file - File to validate
 * @param options - Validation options
 * @returns Validation result
 */
export function validateFile(
 file: File,
 options: FileProcessingOptions = {}
): FileValidationResult {
 const { maxSize, allowedTypes = [], allowedExtensions = [] } = options;

 // Check file size
 if (maxSize && file.size > maxSize) {
 return {
 valid: false,
 error: `File size exceeds maximum allowed size of ${formatFileSize(maxSize)}`,
 size: file.size,
 };
 }

 // Check MIME type
 if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
 return {
 valid: false,
 error: `File type "${file.type}" is not allowed. Allowed types: ${allowedTypes.join(', ')}`,
 mimeType: file.type,
 };
 }

 // Check file extension
 const extension = getFileExtension(file.name);
 if (allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
 return {
 valid: false,
 error: `File extension ".${extension}" is not allowed. Allowed extensions: ${allowedExtensions.map((ext) => `.${ext}`).join(', ')}`,
 mimeType: file.type,
 };
 }

 return {
 valid: true,
 mimeType: file.type,
 size: file.size,
 };
}

/**
 * Validate multiple files
 * @param files - Array of files to validate
 * @param options - Validation options
 * @returns Array of validation results
 */
export function validateFiles(
 files: File[],
 options: FileProcessingOptions = {}
): FileValidationResult[] {
 const { maxFiles } = options;

 // Check number of files
 if (maxFiles && files.length > maxFiles) {
 return files.map((_, index) => ({
 valid: false,
 error: `Maximum ${ maxFiles } files allowed`,
 }));
 }

 return files.map((file) => validateFile(file, options));
}

/**
 * Create a preview URL for image files
 * @param file - Image file
 * @returns Promise resolving to preview URL
 */
export function createImagePreview(file: File): Promise<string> {
 return new Promise((resolve, reject) => {
 if (!file.type.startsWith('image/')) {
 reject(new Error('File is not an image'));
 return;
 }

 const reader = new FileReader();
 reader.onload = (e) => {
 resolve(e.target?.result as string);
 };
 reader.onerror = () => {
 reject(new Error('Failed to read file'));
 };
 reader.readAsDataURL(file);
 });
}

/**
 * Process a file for upload
 * @param file - File to process
 * @param createPreview - Whether to create preview for images
 * @returns Promise resolving to processed file data
 */
export async function processFile(file: File, createPreview = false): Promise<ProcessedFile> {
 const processed: ProcessedFile = {
 file,
 metadata: { name: file.name,
 size: file.size,
 type: file.type,
 lastModified: file.lastModified,
 },
 };

 if (createPreview && file.type.startsWith('image/')) {
 try {
 processed.preview = await createImagePreview(file);
 } catch (error) {
 console.warn('Failed to create preview for file:', file.name, error);
 }
 }

 return processed;
}

/**
 * Process multiple files for upload
 * @param files - Array of files to process
 * @param createPreviews - Whether to create previews for images
 * @returns Promise resolving to array of processed files
 */
export async function processFiles(
 files: File[],
 createPreviews = false
): Promise<ProcessedFile[]> {
 const promises = files.map((file) => processFile(file, createPreviews));
 return Promise.all(promises);
}

/**
 * Download a file from URL
 * @param url - File URL
 * @param filename - Optional filename for download
 */
export function downloadFile(url: string, filename?: string): void {
 const link = document.createElement('a');
 link.href = url;
 link.download = filename || '';
 link.target = '_blank';
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
}

/**
 * Download a blob as file
 * @param blob - File blob
 * @param filename - Filename for download
 */
export function downloadBlob(blob: Blob): void {
 const url = URL.createObjectURL(blob);
 downloadFile(url, filename);
 URL.revokeObjectURL(url);
}

/**
 * Read file as text
 * @param file - File to read
 * @param encoding - Text encoding (default: 'utf-8')
 * @returns Promise resolving to file content as string
 */
export function readFileAsText(file: File, encoding = 'utf-8'): Promise<string> {
 return new Promise((resolve, reject) => {
 const reader = new FileReader();
 reader.onload = (e) => {
 resolve(e.target?.result as string);
 };
 reader.onerror = () => {
 reject(new Error('Failed to read file as text'));
 };
 reader.readAsText(file, encoding);
 });
}

/**
 * Read file as array buffer
 * @param file - File to read
 * @returns Promise resolving to array buffer
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
 return new Promise((resolve, reject) => {
 const reader = new FileReader();
 reader.onload = (e) => {
 resolve(e.target?.result as ArrayBuffer);
 };
 reader.onerror = () => {
 reject(new Error('Failed to read file as array buffer'));
 };
 reader.readAsArrayBuffer(file);
 });
}

/**
 * Get file checksum (simple hash for basic integrity checks)
 * @param file - File to hash
 * @returns Promise resolving to simple hash string
 */
export async function getFileChecksum(file: File): Promise<string> {
 try {
 const buffer = await readFileAsArrayBuffer(file);
 const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
 const hashArray = Array.from(new Uint8Array(hashBuffer));
 return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
 } catch (error) {
 console.error('Failed to calculate file checksum:', error);
 return '';
 }
}

/**
 * Check if file is an image
 * @param file - File to check
 * @returns true if file is an image
 */
export function isImageFile(file: File): boolean {
 return file.type.startsWith('image/');
}

/**
 * Check if file is a video
 * @param file - File to check
 * @returns true if file is a video
 */
export function isVideoFile(file: File): boolean {
 return file.type.startsWith('video/');
}

/**
 * Check if file is an audio file
 * @param file - File to check
 * @returns true if file is an audio file
 */
export function isAudioFile(file: File): boolean {
 return file.type.startsWith('audio/');
}

/**
 * Check if file is a document
 * @param file - File to check
 * @returns true if file is a document
 */
export function isDocumentFile(file: File): boolean {
 const documentTypes = [
 'application/pdf',
 'application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'text/plain',
 'application/rtf',
 ];
 return documentTypes.includes(file.type);
}

/**
 * Get file category
 * @param file - File to categorize
 * @returns File category string
 */
export function getFileCategory(file: File): string {
 if (isImageFile(file)) return 'image';
 if (isVideoFile(file)) return 'video';
 if (isAudioFile(file)) return 'audio';
 if (isDocumentFile(file)) return 'document';
 if (file.type.includes('zip') || file.type.includes('rar') || file.type.includes('7z'))
 return 'archive';
 return 'other';
}

/**
 * Sanitize filename for safe storage
 * @param filename - Original filename
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
 return filename
 .replace(/[^a-zA-Z0-9.\-_]/g, '_') // Replace special chars with underscore
 .replace(/_{2}/g, '_') // Replace multiple underscores with single
 .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
}

/**
 * Generate unique filename
 * @param originalName - Original filename
 * @param prefix - Optional prefix
 * @returns Unique filename with timestamp
 */
export function generateUniqueFilename(originalName: string, prefix = ''): string {
 const extension = getFileExtension(originalName);
 const baseName = originalName.replace(/\.[^/.]+$/, '');
 const timestamp = Date.now();
 const random = Math.random().toString(36).substring(2, 8);

 const uniqueName = `${prefix}${baseName}_${timestamp}_${random}`;
 return extension ? `${uniqueName}.${extension}` : uniqueName;
}




