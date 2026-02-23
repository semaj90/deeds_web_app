/**
 * NES Memory Architecture — Phase 14
 * Nintendo Entertainment System inspired memory management for legal AI applications
 *
 * Features:
 * - NES-authentic memory regions (2KB RAM, 8KB CHR-ROM, 32KB PRG-ROM)
 * - Legal document context-aware allocation with 8-bit priority scoring
 * - Memory bank switching for large documents
 * - Real-time garbage collection with legal priority scoring
 * - Explicit start/stop VBlank lifecycle (no auto-start)
 */

// Nintendo NES Memory Map (authentic constraints)
const NES_MEMORY_MAP = {
	INTERNAL_RAM: { start: 0x0000, end: 0x07ff, size: 2048, mirrored: true, mirrorSize: 8192 },
	CHR_ROM: { start: 0x0000, end: 0x1fff, size: 8192, bankSwitchable: true },
	PRG_ROM: { start: 0x8000, end: 0xffff, size: 32768, bankSwitchable: true },
	SAVE_RAM: { start: 0x6000, end: 0x7fff, size: 8192, bankSwitchable: false },
	EXPANSION_ROM: { start: 0x4020, end: 0x5fff, size: 8160, bankSwitchable: false },
} as const;

export interface LegalDocument {
	readonly id: string;
	readonly type: 'contract' | 'evidence' | 'brief' | 'citation' | 'precedent';
	priority: number; // 0-255 (8-bit)
	readonly size: number;
	readonly confidenceLevel: number; // 0.0-1.0
	readonly riskLevel: 'low' | 'medium' | 'high' | 'critical';
	lastAccessed: number;
	bankId?: number;
	readonly compressed: boolean;
	readonly metadata: {
		readonly caseId?: string;
		readonly jurisdiction?: string;
		readonly documentClass?: string;
		readonly aiGenerated?: boolean;
		readonly vectorEmbedding?: Float32Array;
	};
}

export interface MemoryBank {
	readonly id: number;
	readonly type: 'INTERNAL_RAM' | 'CHR_ROM' | 'PRG_ROM' | 'SAVE_RAM' | 'EXPANSION_ROM';
	readonly startAddress: number;
	readonly endAddress: number;
	readonly size: number;
	used: number;
	readonly documents: Map<string, LegalDocument>;
	isActive: boolean;
	lastBankSwitch: number;
	compressionRatio: number;
}

export interface MemoryStats {
	readonly totalRAM: number;
	readonly usedRAM: number;
	readonly totalCHR: number;
	readonly usedCHR: number;
	readonly totalPRG: number;
	readonly usedPRG: number;
	readonly bankSwitches: number;
	readonly garbageCollections: number;
	readonly compressionSavings: number;
	readonly documentCount: number;
	readonly averageAccessTime: number;
}

const LEGAL_PRIORITIES = {
	critical: 255,
	high: 192,
	medium: 128,
	low: 64,
	background: 32,
};

export class NESMemoryArchitecture {
	private readonly memoryBanks: Map<string, MemoryBank> = new Map();
	private activeBank: string = 'INTERNAL_RAM';
	private bankSwitchCount = 0;
	private gcCount = 0;
	private vblankIntervalId: ReturnType<typeof setInterval> | null = null;

	private readonly memoryState = {
		currentScanline: 0,
		vblankActive: false,
		ppu2000: 0,
		ppu2001: 0,
		ppu2002: 0,
	};

	constructor() {
		this.initializeMemoryBanks();
		// VBlank NOT auto-started — caller must call startVBlankCycle()
	}

	private initializeMemoryBanks(): void {
		const banks: Array<keyof typeof NES_MEMORY_MAP> = [
			'INTERNAL_RAM', 'CHR_ROM', 'PRG_ROM', 'SAVE_RAM', 'EXPANSION_ROM',
		];

		banks.forEach((type, index) => {
			const config = NES_MEMORY_MAP[type];
			this.memoryBanks.set(type, {
				id: index,
				type: type as MemoryBank['type'],
				startAddress: config.start,
				endAddress: config.end,
				size: config.size,
				used: 0,
				documents: new Map(),
				isActive: type === 'INTERNAL_RAM' || type === 'PRG_ROM',
				lastBankSwitch: Date.now(),
				compressionRatio: 1.0,
			});
		});
	}

	startVBlankCycle(): void {
		if (this.vblankIntervalId !== null) return;
		if (typeof setInterval === 'undefined') return;

		this.vblankIntervalId = setInterval(() => {
			this.memoryState.vblankActive = true;
			this.performVBlankOperations();
			setTimeout(() => { this.memoryState.vblankActive = false; }, 1);
			this.memoryState.currentScanline = (this.memoryState.currentScanline + 1) % 262;
		}, 16); // ~60 FPS
	}

	stopVBlankCycle(): void {
		if (this.vblankIntervalId !== null) {
			clearInterval(this.vblankIntervalId);
			this.vblankIntervalId = null;
		}
	}

	private performVBlankOperations(): void {
		const scanline = this.memoryState.currentScanline;
		if (scanline % 60 === 0) this.checkGarbageCollection();
		if (scanline % 180 === 0) this.optimizeMemoryLayout();
	}

	async allocateDocument(
		document: Omit<LegalDocument, 'lastAccessed'>,
		data: ArrayBuffer,
		options: { preferredBank?: string; compress?: boolean } = {}
	): Promise<boolean> {
		const { preferredBank = this.selectOptimalBank(document, data.byteLength), compress = true } = options;

		try {
			const bank = this.memoryBanks.get(preferredBank);
			if (!bank) throw new Error(`Invalid memory bank: ${preferredBank}`);

			const documentSize = data.byteLength;

			if (bank.used + documentSize > bank.size) {
				await this.garbageCollectBank(preferredBank);
				if (bank.used + documentSize > bank.size) {
					const config = NES_MEMORY_MAP[bank.type as keyof typeof NES_MEMORY_MAP];
					if ('bankSwitchable' in config) {
						const success = await this.performBankSwitch(preferredBank, document);
						if (!success) return false;
					} else {
						return false;
					}
				}
			}

			const priority = this.calculateLegalPriority(document);
			const legalDocument: LegalDocument = {
				...document,
				priority,
				lastAccessed: Date.now(),
				compressed: compress,
				bankId: bank.id,
			};

			bank.documents.set(document.id, legalDocument);
			bank.used += documentSize;
			return true;
		} catch {
			return false;
		}
	}

	private selectOptimalBank(document: Omit<LegalDocument, 'lastAccessed'>, size: number): string {
		if (document.riskLevel === 'critical' || document.confidenceLevel > 0.9) {
			const ram = this.memoryBanks.get('INTERNAL_RAM');
			if (ram && ram.used + size <= ram.size) return 'INTERNAL_RAM';
		}
		if (document.type === 'contract' || document.type === 'evidence') {
			const chr = this.memoryBanks.get('CHR_ROM');
			if (chr && chr.used + size <= chr.size) return 'CHR_ROM';
		}
		if (document.type === 'brief' || document.type === 'precedent') {
			const prg = this.memoryBanks.get('PRG_ROM');
			if (prg && prg.used + size <= prg.size) return 'PRG_ROM';
		}
		if (document.metadata?.caseId) {
			const save = this.memoryBanks.get('SAVE_RAM');
			if (save && save.used + size <= save.size) return 'SAVE_RAM';
		}
		return 'PRG_ROM';
	}

	private calculateLegalPriority(document: Omit<LegalDocument, 'lastAccessed' | 'priority'>): number {
		let priority = LEGAL_PRIORITIES[document.riskLevel] ?? LEGAL_PRIORITIES.medium;
		const confidenceBoost = Math.floor(document.confidenceLevel * 31);
		priority = Math.min(255, priority + confidenceBoost);
		if (document.type === 'evidence') priority += 16;
		if (document.type === 'contract') priority += 8;
		if (document.metadata?.aiGenerated) priority -= 16;
		return Math.max(0, Math.min(255, priority));
	}

	private async performBankSwitch(
		bankName: string,
		document: Omit<LegalDocument, 'lastAccessed'>
	): Promise<boolean> {
		const bank = this.memoryBanks.get(bankName);
		if (!bank) return false;

		const documents = Array.from(bank.documents.entries());
		documents.sort((a, b) => {
			if (a[1].priority !== b[1].priority) return a[1].priority - b[1].priority;
			return a[1].lastAccessed - b[1].lastAccessed;
		});

		const requiredSpace = document.size || 1024;
		let freedSpace = 0;

		for (const [docId, doc] of documents) {
			if (freedSpace >= requiredSpace) break;
			if (doc.priority > 200) continue;
			if (doc.riskLevel === 'low' || doc.riskLevel === 'medium') {
				this.swapToExpansionROM(docId, doc);
				bank.documents.delete(docId);
				bank.used -= doc.size;
				freedSpace += doc.size;
			}
		}

		this.bankSwitchCount++;
		bank.lastBankSwitch = Date.now();
		return freedSpace >= requiredSpace;
	}

	private swapToExpansionROM(docId: string, document: LegalDocument): void {
		const expansionBank = this.memoryBanks.get('EXPANSION_ROM');
		if (!expansionBank) return;
		if (expansionBank.used + document.size <= expansionBank.size) {
			expansionBank.documents.set(docId, { ...document, bankId: expansionBank.id });
			expansionBank.used += document.size;
			expansionBank.isActive = true;
		}
	}

	private async garbageCollectBank(bankName: string): Promise<void> {
		const bank = this.memoryBanks.get(bankName);
		if (!bank) return;

		const currentTime = Date.now();
		const oldThreshold = 5 * 60 * 1000; // 5 minutes
		let freedSpace = 0;

		for (const [docId, document] of bank.documents) {
			const age = currentTime - document.lastAccessed;
			if (age > oldThreshold && document.priority < 100 && document.riskLevel !== 'critical') {
				bank.documents.delete(docId);
				bank.used -= document.size;
				freedSpace += document.size;
			}
		}

		if (freedSpace > 0) this.gcCount++;
	}

	private checkGarbageCollection(): void {
		for (const [bankName, bank] of this.memoryBanks) {
			if (bank.used / bank.size > 0.85) {
				this.garbageCollectBank(bankName);
			}
		}
	}

	private optimizeMemoryLayout(): void {
		// Reserved for future optimization passes
	}

	getDocument(documentId: string): LegalDocument | null {
		for (const bank of this.memoryBanks.values()) {
			const document = bank.documents.get(documentId);
			if (document) {
				document.lastAccessed = Date.now();
				return document;
			}
		}
		return null;
	}

	removeDocument(documentId: string): boolean {
		for (const bank of this.memoryBanks.values()) {
			if (bank.documents.has(documentId)) {
				const document = bank.documents.get(documentId)!;
				bank.documents.delete(documentId);
				bank.used -= document.size;
				return true;
			}
		}
		return false;
	}

	clear(): void {
		for (const bank of this.memoryBanks.values()) {
			bank.documents.clear();
			bank.used = 0;
		}
		this.bankSwitchCount = 0;
		this.gcCount = 0;
	}

	getBanks(): Map<string, MemoryBank> {
		return this.memoryBanks;
	}

	getMemoryStats(): MemoryStats {
		let totalRAM = 0, usedRAM = 0;
		let totalCHR = 0, usedCHR = 0;
		let totalPRG = 0, usedPRG = 0;
		let documentCount = 0;
		let totalAccessTime = 0;
		let accessCount = 0;

		for (const bank of this.memoryBanks.values()) {
			documentCount += bank.documents.size;
			switch (bank.type) {
				case 'INTERNAL_RAM': totalRAM += bank.size; usedRAM += bank.used; break;
				case 'CHR_ROM': totalCHR += bank.size; usedCHR += bank.used; break;
				case 'PRG_ROM': totalPRG += bank.size; usedPRG += bank.used; break;
			}
			for (const doc of bank.documents.values()) {
				totalAccessTime += Date.now() - doc.lastAccessed;
				accessCount++;
			}
		}

		return {
			totalRAM, usedRAM, totalCHR, usedCHR, totalPRG, usedPRG,
			bankSwitches: this.bankSwitchCount,
			garbageCollections: this.gcCount,
			compressionSavings: this.calculateCompressionSavings(),
			documentCount,
			averageAccessTime: accessCount > 0 ? totalAccessTime / accessCount : 0,
		};
	}

	private calculateCompressionSavings(): number {
		let totalSavings = 0;
		for (const bank of this.memoryBanks.values()) {
			if (bank.compressionRatio > 1.0) {
				totalSavings += (bank.used * bank.compressionRatio) - bank.used;
			}
		}
		return totalSavings;
	}

	writePPU(register: number, value: number): void {
		if (register === 0x2000) this.memoryState.ppu2000 = value;
	}

	readPPU(register: number): number {
		if (register === 0x2002) return this.memoryState.ppu2002 | (this.memoryState.vblankActive ? 0x80 : 0);
		return 0;
	}
}
