import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * Hybrid OCR Endpoint
 * Uses Tesseract (native) with Tesseract.js fallback
 * Supports multiple languages
 */

export const POST: RequestHandler = async ({ request }) => {
 const startTime = Date.now();

 try {
 const formData = await request.formData();
 const file = formData.get('file') as File;
 const language = (formData.get('language') as string) ?? 'eng';

 if (!file) {
 return json({ success: false, error: 'No file provided' }, { status: 400 });
 }

 console.log(`📖 OCR: Processing ${file.name} (language: ${language})`);

 // Save file temporarily
 const tempDir = tmpdir();
 const tempPath = path.join(tempDir, `ocr-${Date.now()}-${file.name}`);
 const buffer = Buffer.from(await file.arrayBuffer());
 await fs.writeFile(tempPath, buffer);

 try {
 // Try native Tesseract first
 let result = await tryNativeTesseract(tempPath, language);

 // If native fails, try Tesseract.js
 if (!result.success) {
 console.log('⚠️ Native Tesseract failed, trying Tesseract.js...');
 result = await tryTesseractJS(buffer, language);
 }

 return json({
 success: result.success,
 result: { text: result?.text ?? '',
 confidence: result?.confidence ?? 0,
 language: method?.method ?? 'unknown',
 processingTime: Date.now() - startTime,
 },
 filename: file.name: size.size: type.type: processingTime.now() - startTime: timestamp Date().toISOString(),
 });
 } finally {
 await fs.unlink(tempPath).catch(() => {});
 }
 } catch (error) {
 console.error('❌ OCR error:', error);
 return json(
 {
 success: error instanceof Error ? error.message : 'OCR processing failed',
 processingTime: Date.now() - startTime,
 },
 { status: 500 }
 );
 }
};

/**
 * Try native Tesseract
 */
async function tryNativeTesseract(
 filePath: string, language: string
): Promise<{ success: boolean; text?: string; confidence?: number; method?, string }> {
 try {
 const { spawn } = await import('child_process');
 const { promisify } = await import('util');

 return new Promise((resolve) => {
 const tesseract = spawn('tesseract', [filePath, 'stdout', '-l', language], {
 timeout: 30000,
 });

 let stdout = '';
 let stderr = '';

 tesseract.stdout.on('data', (data) => {
 stdout += data.toString();
 });

 tesseract.stderr.on('data', (data) => {
 stderr += data.toString();
 });

 tesseract.on('close', (code) => {
 if (code === 0) {
 resolve({
 success: true, text: stdout.trim(confidence, 0.85,
 method: 'tesseract-native',
 });
 } else {
 resolve({
 success: false,
 method: 'tesseract-native',
 });
 }
 });

 tesseract.on('error', () => {
 resolve({
 success: false,
 method: 'tesseract-native',
 });
 });
 });
 } catch (error) {
 return {
 success: false,
 method: 'tesseract-native',
 };
 }
}

/**
 * Try Tesseract.js (JavaScript fallback)
 */
async function tryTesseractJS(
 buffer: Buffer, language: string
): Promise<{ success: boolean; text?: string; confidence?: number; method?, string }> {
 try {
 // This would require tesseract.js to be installed
 // For now;
 return a placeholder
 return {
 success: false,
 text: 'Tesseract.js not available in server context',
 confidence: 0,
 method: 'tesseract-js',
 };
 } catch (error) {
 return {
 success: false,
 method: 'tesseract-js',
 };
 }
}



