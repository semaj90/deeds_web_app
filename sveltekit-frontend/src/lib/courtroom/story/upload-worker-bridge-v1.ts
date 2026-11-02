/**
 * Upload Worker Bridge V1 (CSP-20, CSP-21, CSP-22)
 * Off-main-thread text parsing, chunking, limits enforcement, and progress events.
 */

export const MAX_EVIDENCE_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB limit
export const ALLOWED_EVIDENCE_MIME_TYPES = Object.freeze([
	'text/plain',
	'text/markdown',
	'application/pdf',
	'application/json',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

export interface FileRejectionReceipt {
	accepted: false;
	fileName: string;
	fileSize: number;
	code: 'FILE_TOO_LARGE' | 'UNSUPPORTED_TYPE' | 'EMPTY_FILE';
	reason: string;
}

export interface FileAcceptanceReceipt {
	accepted: true;
	fileName: string;
	fileSize: number;
	mimeType: string;
}

export type FileValidationResult = FileAcceptanceReceipt | FileRejectionReceipt;

export interface ChunkerOptions {
	maxChunkSize?: number;
	overlap?: number;
}

export interface ParsedChunk {
	index: number;
	id: string;
	text: string;
	charCount: number;
}

export interface UploadProgressEvent {
	stage: 'validating' | 'reading' | 'chunking' | 'complete';
	processedBytes: number;
	totalBytes: number;
	percent: number;
	chunksProduced: number;
}

/**
 * Validates file size and type boundaries, issuing a deterministic receipt (CSP-22).
 */
export function validateEvidenceFile(file: { name: string; size: number; type: string }): FileValidationResult {
	if (file.size <= 0) {
		return {
			accepted: false,
			fileName: file.name,
			fileSize: file.size,
			code: 'EMPTY_FILE',
			reason: 'File is empty (0 bytes).'
		};
	}

	if (file.size > MAX_EVIDENCE_FILE_SIZE_BYTES) {
		return {
			accepted: false,
			fileName: file.name,
			fileSize: file.size,
			code: 'FILE_TOO_LARGE',
			reason: `File size (${file.size} bytes) exceeds limit of ${MAX_EVIDENCE_FILE_SIZE_BYTES} bytes (100 MB).`
		};
	}

	const normalizedType = file.type.toLowerCase().trim();
	const isAllowed =
		ALLOWED_EVIDENCE_MIME_TYPES.includes(normalizedType) ||
		file.name.endsWith('.txt') ||
		file.name.endsWith('.md') ||
		file.name.endsWith('.pdf') ||
		file.name.endsWith('.json');

	if (!isAllowed) {
		return {
			accepted: false,
			fileName: file.name,
			fileSize: file.size,
			code: 'UNSUPPORTED_TYPE',
			reason: `MIME type '${file.type}' is not supported.`
		};
	}

	return {
		accepted: true,
		fileName: file.name,
		fileSize: file.size,
		mimeType: normalizedType || 'text/plain'
	};
}

/**
 * Splits plain text into bounded chunks respecting paragraph and sentence boundaries (CSP-20).
 */
export function chunkEvidenceText(
	text: string,
	options: ChunkerOptions = {},
	onProgress?: (progress: UploadProgressEvent) => void
): ParsedChunk[] {
	const maxChunkSize = options.maxChunkSize ?? 600;
	const overlap = options.overlap ?? 80;

	const clean = text.replace(/\r\n/g, '\n').trim();
	if (!clean) return [];

	const paragraphs = clean.split(/\n\s*\n/);
	const chunks: ParsedChunk[] = [];
	let currentBuffer = '';
	let chunkIdx = 0;
	const totalBytes = clean.length;
	let processedChars = 0;

	for (const para of paragraphs) {
		const trimmedPara = para.trim();
		if (!trimmedPara) continue;

		if (currentBuffer.length + trimmedPara.length + 1 <= maxChunkSize) {
			currentBuffer = currentBuffer ? `${currentBuffer}\n\n${trimmedPara}` : trimmedPara;
		} else {
			if (currentBuffer) {
				chunks.push({
					index: chunkIdx,
					id: `chunk-${String(chunkIdx).padStart(4, '0')}`,
					text: currentBuffer,
					charCount: currentBuffer.length
				});
				chunkIdx++;

				// Keep overlap tail
				currentBuffer = currentBuffer.slice(Math.max(0, currentBuffer.length - overlap)) + '\n\n' + trimmedPara;
			} else {
				// Single huge paragraph: slice by maxChunkSize
				for (let i = 0; i < trimmedPara.length; i += maxChunkSize - overlap) {
					const slice = trimmedPara.slice(i, i + maxChunkSize);
					chunks.push({
						index: chunkIdx,
						id: `chunk-${String(chunkIdx).padStart(4, '0')}`,
						text: slice,
						charCount: slice.length
					});
					chunkIdx++;
				}
				currentBuffer = '';
			}
		}

		processedChars += trimmedPara.length;
		if (onProgress) {
			onProgress({
				stage: 'chunking',
				processedBytes: processedChars,
				totalBytes,
				percent: Math.min(99, Math.round((processedChars / totalBytes) * 100)),
				chunksProduced: chunks.length
			});
		}
	}

	if (currentBuffer.trim()) {
		chunks.push({
			index: chunkIdx,
			id: `chunk-${String(chunkIdx).padStart(4, '0')}`,
			text: currentBuffer.trim(),
			charCount: currentBuffer.trim().length
		});
	}

	if (onProgress) {
		onProgress({
			stage: 'complete',
			processedBytes: totalBytes,
			totalBytes,
			percent: 100,
			chunksProduced: chunks.length
		});
	}

	return chunks;
}
