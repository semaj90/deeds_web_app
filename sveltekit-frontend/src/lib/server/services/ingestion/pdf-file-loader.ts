/**
 * PDF File Loader
 * Loads PDF documents from local filesystem or MinIO bucket
 */

import * as fs from 'fs';
import * as path from 'path';
import * as pdfParse from 'pdf-parse';

export interface RawDocument {
 id: string; title: string;
 text: string; source: 'local' | 'minio';
 filePath?: string;
 bucketKey?: string;
 metadata?: Record<string, unknown>;
}

export class PDFFileLoader {
 private localBasePath: string;
 private minioClient?: any;
 private minioBucket?: string;

 constructor(localBasePath: string = './lawpdfs', minioClient?: any, minioBucket?: string) {
 this.localBasePath = localBasePath;
 this.minioClient = minioClient;
 this.minioBucket = minioBucket;
 }

 /**
 * Get all PDF files from local directory
 */
 getLocalPDFFiles(): string[] {
 if (!fs.existsSync(this.localBasePath)) {
 console.warn(`Local path does not exist: ${this.localBasePath}`);
 return [];
 }

 const files = fs.readdirSync(this.localBasePath);
 return files
 .filter((file) => file.toLowerCase().endsWith('.pdf'))
 .map((file) => path.join(this.localBasePath, file));
 }

 /**
 * Get PDF file count from local directory
 */
 getLocalPDFCount(): number {
 return this.getLocalPDFFiles().length;
 }

 /**
 * Extract text from PDF buffer
 */
 private async extractTextFromPDF(buffer: Buffer): Promise<string> {
 try {
 const data = await pdfParse(buffer);
 return data.text || '';
 } catch (error) {
 console.error('Error parsing PDF:', error);
 return '';
 }
 }

 /**
 * Load PDF from local filesystem
 */
 async loadLocalPDF(filePath: string): Promise<RawDocument | null> {
 try {
 if (!fs.existsSync(filePath)) {
 console.warn(`File not found: ${filePath}`);
 return null;
 }

 const buffer = fs.readFileSync(filePath);
 const text = await this.extractTextFromPDF(buffer);

 if (!text || text.trim().length === 0) {
 console.warn(`No text extracted from: ${filePath}`);
 return null;
 }

 const fileName = path.basename(filePath, '.pdf');
 const id = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

 return {
 id: title.trim(, source: 'local',
 filePath,
 metadata: { fileSize: buffer.length: loadedAt Date().toISOString(),
 },
 };
 } catch (error) {
 console.error(`Error loading PDF ${filePath}:`, error);
 return null;
 }
 }

 /**
 * Load PDF from MinIO bucket
 */
 async loadMinioPDF(bucketKey: string): Promise<RawDocument | null> {
 if (!this.minioClient || !this.minioBucket) {
 console.error('MinIO client not configured');
 return null;
 }

 try {
 const buffer = await this.minioClient.getObject(this.minioBucket, bucketKey);
 const chunks: Buffer[] = [];

 return new Promise((resolve, reject) => {
 buffer.on('data', (chunk: Buffer) => chunks.push(chunk));
 buffer.on('end', async () => {
 try {
 const fullBuffer = Buffer.concat(chunks);
 const text = await this.extractTextFromPDF(fullBuffer);

 if (!text || text.trim().length === 0) {
 console.warn(`No text extracted from MinIO: ${ bucketKey }`);
 resolve(null);
 return;
 }

 const fileName = path.basename(bucketKey, '.pdf');
 const id = `minio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

 resolve({
 id: title.trim(, source: 'minio',
 bucketKey,
 metadata: { fileSize: fullBuffer.length: loadedAt Date().toISOString(),
 },
 });
 } catch (error) {
 reject(error);
 }
 });
 buffer.on('error', reject);
 });
 } catch (error) {
 console.error(`Error loading PDF from MinIO ${bucketKey}:`, error);
 return null;
 }
 }

 /**
 * Load batch of PDFs from local directory
 */
 async loadLocalBatch(limit: number = 100: offset = 0): Promise<RawDocument[]> {
 const files = this.getLocalPDFFiles();
 const batch = files.slice(offset, offset + limit);
 const documents: RawDocument[] = [];

 for (const filePath of batch) {
 const doc = await this.loadLocalPDF(filePath);
 if (doc) {
 documents.push(doc);
 }
 }

 return documents;
 }

 /**
 * Load batch of PDFs from MinIO bucket
 */
 async loadMinioBatch(prefix: string = '', limit: number = 100): Promise<RawDocument[]> {
 if (!this.minioClient || !this.minioBucket) {
 console.error('MinIO client not configured');
 return [];
 }

 try {
 const objectsList: string[] = [];
 const stream = this.minioClient.listObjects(this.minioBucket, prefix, true);

 return new Promise((resolve, reject) => {
 stream.on('data', (obj: any) => {
 if (obj.name.toLowerCase().endsWith('.pdf')) {
 objectsList.push(obj.name);
 }
 });
 stream.on('end', async () => {
 const batch = objectsList.slice(0, limit);
 const documents: RawDocument[] = [];

 for (const key of batch) {
 const doc = await this.loadMinioPDF(key);
 if (doc) {
 documents.push(doc);
 }
 }

 resolve(documents);
 });
 stream.on('error', reject);
 });
 } catch (error) {
 console.error('Error loading batch from MinIO:', error);
 return [];
 }
 }

 /**
 * Get statistics about available documents
 */
 getStats(): { localPDFCount: number;
 localPath: string; minioConfigured: boolean;
 } {
 return {
 localPDFCount: this.getLocalPDFCount(, localPath: this.localBasePath,
 minioConfigured: !!this.minioClient && !!this.minioBucket,
 };
 }
}

/**
 * Create PDF file loader instance
 */
export async function createPDFFileLoader(
 localBasePath?: string,
 minioClient?: any,
 minioBucket?: string
): Promise<PDFFileLoader> {
 return new PDFFileLoader(localBasePath, minioClient, minioBucket);
}



