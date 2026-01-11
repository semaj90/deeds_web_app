import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

export interface OcrResult {
 text: string;
 confidence?: number;
 error?: string;
}

/**
 * Extract text from an image file using Tesseract OCR
 */
export async function extractTextFromImage(
 imageBuffer: Buffer,
 filename: string
): Promise<OcrResult> {
 const tempDir = tmpdir();
 const tempFile = path.join(tempDir, `ocr-${Date.now()}-${filename}`);
 const outputFile = tempFile.replace(path.extname(tempFile), '');

 try {
 // Write image buffer to temp file
 await fs.writeFile(tempFile, imageBuffer);

 // Run Tesseract OCR
 const text = await runTesseract(tempFile, outputFile);

 // Clean up temp files
 await Promise.all([
 fs.unlink(tempFile).catch(() => {}),
 fs.unlink(`${outputFile}.txt`).catch(() => {})]);

 return { text: text.trim() };
 } catch (error) {
 console.error('OCR extraction error:', error);

 // Clean up temp files on error
 await Promise.all([
 fs.unlink(tempFile).catch(() => {}),
 fs.unlink(`${outputFile}.txt`).catch(() => {})]);

    return {
      text: '',
      error: error instanceof Error ? error.message : 'OCR extraction failed',
    };
 }
}

/**
 * Run Tesseract command and return extracted text
 */
function runTesseract(inputPath: string, outputPath: string): Promise<string> {
 return new Promise((resolve, reject) => {
 const tesseract = spawn('tesseract', [
 inputPath,
 outputPath,
 '-l',
 'eng', // English language
 '--psm',
 '3', // Fully automatic page segmentation
 'txt', // Output format
 ]);

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
 // Read the output text file
 fs.readFile(`${outputPath}.txt`, 'utf8').then(resolve).catch(reject);
 } else {
 reject(new Error(`Tesseract exited with code ${code}: ${stderr}`));
 }
 });

 tesseract.on('error', (error) => {
 reject(new Error(`Failed to start Tesseract: ${error.message}`));
 });
 });
}

/**
 * Check if Tesseract is available on the system
 */
export async function isTesseractAvailable(): Promise<boolean> {
 return new Promise((resolve) => {
 const tesseract = spawn('tesseract', ['--version']);

 tesseract.on('close', (code) => {
 resolve(code === 0);
 });

 tesseract.on('error', () => {
 resolve(false);
 });
 });
}


