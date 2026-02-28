/**
 * Docling Integration Module
 * Wraps Granite-Docling-258M for OCR + layout-aware text extraction
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type DoclingBlock = {
    type: 'paragraph' | 'heading' | 'table' | 'list' | 'equation' | 'image' | 'transcription' | 'other';
    text: string;
	page: number;
    bbox?: [number, number, number, number];
	timestampMs?: number;
};

export type DoclingResult = {
    fullText: string;
	blocks: DoclingBlock[];
    pageCount?: number;
    processingTimeMs?: number;
};

type AnalyzeArgs = {
    fileBuffer: Buffer;
	mimeType: string;
};

/**
 * Analyze document using Granite-Docling-258M
 */
export async function analyzeDocumentWithDocling(args: AnalyzeArgs): Promise<DoclingResult> {
    const { fileBuffer, mimeType } = args;
    const id = randomUUID();
    const startTime = Date.now();

    const tmpInput = join(tmpdir(), `docling-${id}`);
    const tmpOutput = join(tmpdir(), `docling-${id}.json`);

    try {
        await writeFile(tmpInput, fileBuffer);
        const pyScript = join(process.cwd(), 'python', 'docling_analyze.py');

        return await new Promise<DoclingResult>((resolve, reject) => {
            const proc = spawn('python', [pyScript, tmpInput, tmpOutput, mimeType], {
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: 60000,
            });

            let stderr = '';
            proc.stderr.on('data', (d) => (stderr += d.toString()));

            proc.on('close', async (code) => {
                try {
                    if (code !== 0) {
                        return reject(new Error(`Docling exited with ${code}: ${stderr}`));
                    }
                    const raw = await readFile(tmpOutput, 'utf8');
                    const parsed = JSON.parse(raw) as DoclingResult;
                    parsed.processingTimeMs = Date.now() - startTime;
                    resolve(parsed);
                } catch (err) {
                    reject(err);
                }
            });

            proc.on('error', (err) => reject(err));
        });
    } catch (error) {
        console.error('❌ Docling analysis failed:', error);
        throw error;
    } finally {
        await unlink(tmpInput).catch(() => {});
        await unlink(tmpOutput).catch(() => {});
    }
}

/**
 * Transcribe audio using Docling's ASR pipeline.
 * Supports WAV, MP3, M4A via Granite-Docling ASR.
 */
export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<DoclingResult> {
	return analyzeDocumentWithDocling({ fileBuffer: audioBuffer, mimeType });
}

export async function isDoclingAvailable(): Promise<boolean> {
    try {
        const pyScript = join(process.cwd(), 'python', 'docling_analyze.py');
        await fs.access(pyScript);
        return true;
    } catch {
        return false;
    }
}
