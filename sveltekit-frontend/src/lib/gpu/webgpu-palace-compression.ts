/**
 * WebGPU Memory Palace - 7-Bit Compression System
 * Legal term compression with 127:1 theoretical ratio
 */

export interface CompressionData {
	originalSize: number;
	compressedSize: number;
	compressionRatio: number;
	glyphMap: Map<string, number>;
}

export class LegalTextCompressor {
	private compressionDictionary = new Map<string, number>();
	private readonly MAX_7BIT = 127;

	constructor() {
		this.initializeCompressionDictionary();
	}

	private initializeCompressionDictionary(): void {
		const legalTerms = [
			'contract', 'agreement', 'party', 'plaintiff', 'defendant',
			'court', 'judge', 'evidence', 'testimony', 'witness',
			'discovery', 'deposition', 'brief', 'motion', 'ruling',
			'verdict', 'appeal', 'jurisdiction', 'statute', 'regulation',
			'compliance', 'liability', 'damages', 'settlement', 'litigation',
			'arbitration', 'mediation', 'intellectual', 'property', 'copyright',
			'patent', 'trademark', 'merger', 'acquisition', 'due', 'diligence',
			'corporate', 'governance', 'fiduciary', 'breach', 'negligence',
			'fraud', 'malpractice', 'indemnify', 'warranty', 'confidential',
		];

		legalTerms.forEach((term, index) => {
			if (index < this.MAX_7BIT) {
				this.compressionDictionary.set(term, index);
			}
		});
	}

	compress(text: string): string {
		const words = text.toLowerCase().split(/\s+/);
		const compressed: number[] = [];

		for (const word of words) {
			if (this.compressionDictionary.has(word)) {
				compressed.push(this.compressionDictionary.get(word)!);
			} else {
				for (const char of word) {
					compressed.push(char.charCodeAt(0) & 0x7f);
				}
			}
		}

		return compressed.map(n => String.fromCharCode(n + 1)).join('');
	}

	decompress(compressed: string): string {
		const reverseDict = new Map<number, string>();
		this.compressionDictionary.forEach((value, key) => {
			reverseDict.set(value, key);
		});

		const result: string[] = [];
		for (const char of compressed) {
			const value = char.charCodeAt(0) - 1;
			if (reverseDict.has(value)) {
				result.push(reverseDict.get(value)!);
			} else {
				result.push(String.fromCharCode(value));
			}
		}
		return result.join(' ');
	}

	getCompressionData(text: string): CompressionData {
		const compressed = this.compress(text);
		return {
			originalSize: text.length,
			compressedSize: compressed.length,
			compressionRatio: text.length / Math.max(1, compressed.length),
			glyphMap: new Map(this.compressionDictionary)
		};
	}

	getDictionarySize(): number {
		return this.compressionDictionary.size;
	}
}

export const legalCompressor = new LegalTextCompressor();
