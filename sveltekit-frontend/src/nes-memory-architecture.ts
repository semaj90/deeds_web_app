/**
 * NES Memory Architecture - Phase 14
 * Nintendo Entertainment System inspired memory management for legal AI applications
 * Features:
 * - NES-authentic memory regions (2KB RAM, 8KB CHR-ROM, 32KB PRG-ROM)
 * - Legal document context-aware allocation
 * - Memory bank switching for large documents
 * - Performance optimization with 8-bit addressing patterns
 * - Real-time garbage collection with legal priority scoring
 * - AlphaGo/MCTS planner memory extension
 */

// Nintendo NES Memory Map (authentic constraints)
const NES_MEMORY_MAP = {
	// Internal RAM (2KB, mirrored to fill 8KB space)
	INTERNAL_RAM: { start: 0x0000,
		end: 0x07ff,
		size: 2048,
		mirrored: true,
		mirrorSize: 8192
	},
	// PPU registers (for UI components)
	PPU_REGISTERS: { start: 0x2000,
		end: 0x2007,
		size: 8,
		mirrored: true,
		mirrorSize: 8192
	},
	// APU and I/O registers (for audio/input)
	APU_IO_REGISTERS: { start: 0x4000,
		end: 0x4017,
		size: 24
	},
	// Expansion ROM (for legal plugins)
	EXPANSION_ROM: { start: 0x4020,
		end: 0x5fff,
		size: 8160,
		bankSwitchable: false
	},
	// Save RAM (for persistent legal data)
	SAVE_RAM: { start: 0x6000,
		end: 0x7fff,
		size: 8192,
		bankSwitchable: false
	},
	// PRG-ROM (Program ROM - for legal processing logic)
	PRG_ROM: { start: 0x8000,
		end: 0xffff,
		size: 32768,
		bankSwitchable: true
	},
	// CHR-ROM (Character ROM - for legal document patterns)
	CHR_ROM: { start: 0x0000,
		end: 0x1fff,
		size: 8192,
		bankSwitchable: true
	}
} as const;

export interface LegalDocument {
	readonly id: string;
	readonly type: 'contract' | 'evidence' | 'brief' | 'citation' | 'precedent';
	priority: number; // 0-255 (8-bit)
	readonly size: number;
	readonly confidenceLevel: number; // 0.0-1.0
	readonly riskLevel: 'low' | 'medium' | 'high' | 'critical';
	lastAccessed: number;
	bankId?: number; // For large documents requiring bank switching
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
	readonly size: number; used: number;
	readonly documents: Map<string: LegalDocument>; isActive: boolean;
	lastBankSwitch: number; compressionRatio: number;
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

// Legal AI priority scoring
const LEGAL_PRIORITIES = {
	critical: 255, // Active court case documents
	high: 192, // Evidence and contracts under review
	medium: 128, // Research documents and precedents
	low: 64, // Archived or reference materials
	background: 32 // AI-generated summaries and metadata
};

export class NESMemoryArchitecture {
	private readonly memoryBanks: Map<string, MemoryBank> = new Map();
	private activeBank: string = 'INTERNAL_RAM';
	private bankSwitchCount = 0;
	private gcCount = 0;

	// NES-style memory management state
	private readonly memoryState = {
		currentScanline: 0,
		vblankActive: false,
		ppu2000: 0,
		ppu2001: 0,
		ppu2002: 0,
		oamaddr: 0,
		ppuscroll: { x: 0, y: 0 },
		ppuaddr: 0,
		ppudata: 0
	};

	constructor() {
		this.initializeMemoryBanks();
		this.startVBlankCycle();
	}

	private initializeMemoryBanks(): void {
		// Internal RAM bank (2KB - most frequently accessed)
		this.memoryBanks.set('INTERNAL_RAM', {
			id: 0,
			type: 'INTERNAL_RAM',
			startAddress: NES_MEMORY_MAP.INTERNAL_RAM.start,
			endAddress: NES_MEMORY_MAP.INTERNAL_RAM.end,
			size: NES_MEMORY_MAP.INTERNAL_RAM.size,
			used: 0,
			documents: new Map(),
			isActive: true,
			lastBankSwitch: Date.now(),
			compressionRatio: 1.0
		});

		// CHR-ROM bank (8KB - legal document patterns)
		this.memoryBanks.set('CHR_ROM', {
			id: 1,
			type: 'CHR_ROM',
			startAddress: NES_MEMORY_MAP.CHR_ROM.start,
			endAddress: NES_MEMORY_MAP.CHR_ROM.end,
			size: NES_MEMORY_MAP.CHR_ROM.size,
			used: 0,
			documents: new Map(),
			isActive: true,
			lastBankSwitch: Date.now(),
			compressionRatio: 1.0
		});

		// PRG-ROM bank (32KB - legal processing logic)
		this.memoryBanks.set('PRG_ROM', {
			id: 2,
			type: 'PRG_ROM',
			startAddress: NES_MEMORY_MAP.PRG_ROM.start,
			endAddress: NES_MEMORY_MAP.PRG_ROM.end,
			size: NES_MEMORY_MAP.PRG_ROM.size,
			used: 0,
			documents: new Map(),
			isActive: true,
			lastBankSwitch: Date.now(),
			compressionRatio: 1.0
		});

		// Save RAM bank (8KB - persistent legal data)
		this.memoryBanks.set('SAVE_RAM', {
			id: 3,
			type: 'SAVE_RAM',
			startAddress: NES_MEMORY_MAP.SAVE_RAM.start,
			endAddress: NES_MEMORY_MAP.SAVE_RAM.end,
			size: NES_MEMORY_MAP.SAVE_RAM.size,
			used: 0,
			documents: new Map(),
			isActive: true,
			lastBankSwitch: Date.now(),
			compressionRatio: 1.0
		});

		// Expansion ROM bank (8KB - legal plugins)
		this.memoryBanks.set('EXPANSION_ROM', {
			id: 4,
			type: 'EXPANSION_ROM',
			startAddress: NES_MEMORY_MAP.EXPANSION_ROM.start,
			endAddress: NES_MEMORY_MAP.EXPANSION_ROM.end,
			size: NES_MEMORY_MAP.EXPANSION_ROM.size,
			used: 0,
			documents: new Map(),
			isActive: false, // Activated on-demand
			lastBankSwitch: Date.now(),
			compressionRatio: 1.0
		});
	}

	private startVBlankCycle(): void {
		// NES-style VBlank cycle for memory management (60Hz)
		setInterval(() => {
			(this.memoryState as { vblankActive: boolean }).vblankActive = true;
			this.performVBlankOperations();
			setTimeout(() => {
				(this.memoryState as { vblankActive: boolean }).vblankActive = false;
			}, 1350); // VBlank period (~1.35ms)
			(this.memoryState as { currentScanline: number }).currentScanline =
				((this.memoryState.currentScanline + 1) % 262);
		}, 16.67); // ~60 FPS
	}

	private performVBlankOperations(): void {
		const currentScanline = this.memoryState.currentScanline;
		if (currentScanline % 60 === 0) {
			this.checkGarbageCollection();
		}
		if (currentScanline % 180 === 0) {
			this.optimizeMemoryLayout();
		}
	}

	async allocateDocument(
		document: Omit<LegalDocument, 'lastAccessed'>,
		data: ArrayBuffer,
		options: { preferredBank?: string; compress?: boolean } = {}
	): Promise<boolean> {
		const { preferredBank = this.selectOptimalBank(document, data.byteLength), compress = true } =
			options;

		try {
			const bank = this.memoryBanks.get(preferredBank);
			if (!bank) {
				throw new Error(`Invalid memory bank: ${preferredBank}`);
			}

			let documentSize = data.byteLength;

			if (bank.used + documentSize > bank.size) {
				// Try garbage collection
				await this.garbageCollectBank(preferredBank);
				if (bank.used + documentSize > bank.size) {
					// Try bank switching if supported
					const memoryMapEntry = NES_MEMORY_MAP[bank.type as keyof typeof NES_MEMORY_MAP];
					if ('bankSwitchable' in memoryMapEntry && memoryMapEntry.bankSwitchable) {
						const success = await this.performBankSwitch(preferredBank, document);
						if (!success) {
							console.warn(`❌ Cannot allocate document ${document.id}, insufficient memory`);
							return false;
						}
					} else {
						return false;
					}
				}
			}

			// Calculate legal priority
			const priority = this.calculateLegalPriority(document);

			const legalDocument: LegalDocument = {
				...document,
				priority,
				lastAccessed: Date.now(),
				compressed: compress,
				bankId: bank.id
			};

			// Allocate document in bank
			bank.documents.set(document.id, legalDocument);
			bank.used += documentSize;

			console.log(
				`✅ Allocated ${document.type} document ${document.id} in ${preferredBank} (${this.formatBytes(documentSize)})`
			);
			return true;
		} catch (error) {
			console.error(`❌ Failed to allocate document ${document.id}:`, error);
			return false;
		}
	}

	private selectOptimalBank(
		document: Omit<LegalDocument, 'lastAccessed'>,
		size: number
	): string {
		// Critical legal documents go to fast RAM
		if (document.riskLevel === 'critical' || document.confidenceLevel > 0.9) {
			const ram = this.memoryBanks.get('INTERNAL_RAM')!;
			if (ram.used + size <= ram.size) {
				return 'INTERNAL_RAM';
			}
		}

		// Contracts and evidence patterns go to CHR-ROM
		if (document.type === 'contract' || document.type === 'evidence') {
			const chr = this.memoryBanks.get('CHR_ROM')!;
			if (chr.used + size <= chr.size) {
				return 'CHR_ROM';
			}
		}

		// Legal processing logic goes to PRG-ROM
		if (document.type === 'brief' || document.type === 'precedent') {
			const prg = this.memoryBanks.get('PRG_ROM')!;
			if (prg.used + size <= prg.size) {
				return 'PRG_ROM';
			}
		}

		// Persistent data goes to Save RAM
		if (document.metadata?.caseId) {
			const save = this.memoryBanks.get('SAVE_RAM')!;
			if (save.used + size <= save.size) {
				return 'SAVE_RAM';
			}
		}

		return 'PRG_ROM';
	}

	private calculateLegalPriority(
		document: Omit<LegalDocument, 'lastAccessed' | 'priority'>
	): number {
		let priority = LEGAL_PRIORITIES.medium;

		switch (document.riskLevel) {
			case 'critical':
				priority = LEGAL_PRIORITIES.critical;
				break;
			case 'high':
				priority = LEGAL_PRIORITIES.high;
				break;
			case 'medium':
				priority = LEGAL_PRIORITIES.medium;
				break;
			case 'low':
				priority = LEGAL_PRIORITIES.low;
				break;
		}

		// Confidence level adjustment (0-31 range)
		const confidenceBoost = Math.floor(document.confidenceLevel * 31);
		priority = Math.min(255, priority + confidenceBoost);

		// Document type adjustment
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

		try {
			const documents = Array.from(bank.documents.entries());
			documents.sort((a, b) => {
				const [docA] = a;
				const [docB] = b;
				if (docA.priority !== docB.priority) {
					return docA.priority - docB.priority;
				}
				return docA.lastAccessed - docB.lastAccessed;
			});

			const requiredSpace = document.size || 1024;
			let freedSpace = 0;
			const swappedDocs: string[] = [];

			for (const [docId, doc] of documents) {
				if (freedSpace >= requiredSpace) break;
				if (doc.riskLevel === 'high' || doc.priority > 200) continue;

				if (doc.riskLevel === 'low' || doc.riskLevel === 'medium') {
					await this.swapToExpansionROM(docId, doc);
					bank.documents.delete(docId);
					bank.used -= doc.size;
					freedSpace += doc.size;
					swappedDocs.push(docId);
				}
			}

			this.bankSwitchCount++;
			bank.lastBankSwitch = Date.now();

			console.log(
				`🔄 Bank switch in ${bankName}, swapped ${swappedDocs.length} documents, freed ${this.formatBytes(freedSpace)}`
			);
			return freedSpace >= requiredSpace;
		} catch (error) {
			console.error(`❌ Bank switch failed in ${bankName}:`, error);
			return false;
		}
	}

	private async swapToExpansionROM(docId: string, document: LegalDocument): Promise<void> {
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

		const documents = Array.from(bank.documents.entries());
		const currentTime = Date.now();
		const oldThreshold = 5 * 60 * 1000; // 5 minutes

		let freedSpace = 0;
		const removedDocs: string[] = [];

		for (const [docId, document] of documents) {
			const age = currentTime - document.lastAccessed;
			if (age > oldThreshold && document.priority < 100 && document.riskLevel !== 'critical') {
				bank.documents.delete(docId);
				bank.used -= document.size;
				freedSpace += document.size;
				removedDocs.push(docId);
			}
		}

		if (removedDocs.length > 0) {
			this.gcCount++;
			console.log(
				`🗑️ Garbage collected ${removedDocs.length} documents from ${bankName}, freed ${this.formatBytes(freedSpace)}`
			);
		}
	}

	private checkGarbageCollection(): void {
		for (const [bankName, bank] of this.memoryBanks) {
			const utilizationRate = bank.used / bank.size;
			if (utilizationRate > 0.85) {
				this.garbageCollectBank(bankName);
			}
		}
	}

	private optimizeMemoryLayout(): void {
		for (const [bank] of this.memoryBanks) {
			if (bank.documents.size === 0) continue;

			const documents = Array.from(bank.documents.values());
			documents.sort((a, b) => {
				const accessWeight = (Date.now() - a.lastAccessed) / 1000;
				const priorityWeight = (255 - a.priority) / 255;
				return (
					accessWeight +
					priorityWeight -
					((Date.now() - b.lastAccessed) / 1000 + (255 - b.priority) / 255)
				);
			});
		}
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

	getMemoryStats(): MemoryStats {
		let totalRAM = 0,
			usedRAM = 0;
		let totalCHR = 0,
			usedCHR = 0;
		let totalPRG = 0,
			usedPRG = 0;
		let documentCount = 0;
		let totalAccessTime = 0;
		let accessCount = 0;

		for (const bank of this.memoryBanks.values()) {
			documentCount += bank.documents.size;

			switch (bank.type) {
				case 'INTERNAL_RAM':
					totalRAM += bank.size;
					usedRAM += bank.used;
					break;
				case 'CHR_ROM':
					totalCHR += bank.size;
					usedCHR += bank.used;
					break;
				case 'PRG_ROM':
					totalPRG += bank.size;
					usedPRG += bank.used;
					break;
			}

			for (const doc of bank.documents.values()) {
				const accessTime = Date.now() - doc.lastAccessed;
				totalAccessTime += accessTime;
				accessCount++;
			}
		}

		return {
			totalRAM,
			usedRAM,
			totalCHR,
			usedCHR,
			totalPRG,
			usedPRG,
			bankSwitches: this.bankSwitchCount,
			garbageCollections: this.gcCount,
			compressionSavings: this.calculateCompressionSavings(),
			documentCount,
			averageAccessTime: accessCount > 0 ? totalAccessTime / accessCount : 0
		};
	}

	private calculateCompressionSavings(): number {
		let totalSavings = 0;
		for (const bank of this.memoryBanks.values()) {
			if (bank.compressionRatio > 1.0) {
				const uncompressedSize = bank.used * bank.compressionRatio;
				totalSavings += uncompressedSize - bank.used;
			}
		}
		return totalSavings;
	}

	writePPU(register: number, value: number): void {
		const state = this.memoryState as Record<string, unknown>;
		switch (register) {
			case 0x2000:
				state.ppu2000 = value;
				break;
			case 0x2001:
				state.ppu2001 = value;
				break;
			case 0x2005:
				(state.ppuscroll as { x: number }).x = value;
				break;
			case 0x2006:
				state.ppuaddr = value;
				break;
			case 0x2007:
				state.ppudata = value;
				break;
		}
	}

	readPPU(register: number): number {
		switch (register) {
			case 0x2002:
				return this.memoryState.ppu2002 | (this.memoryState.vblankActive ? 0x80 : 0);
			case 0x2007:
				return this.memoryState.ppudata;
			default:
				return 0;
		}
	}

	private formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	async destroy(): Promise<void> {
		for (const bank of this.memoryBanks.values()) {
			bank.documents.clear();
			bank.used = 0;
		}
		this.memoryBanks.clear();
		console.log('🎮 NES Memory Architecture destroyed');
	}
}

// =========================================================================
// AlphaGo / MCTS Planner Memory Extension
// =========================================================================

interface PlannerNodeRecord {
	handle: number; graphNodeId: string;
	parentHandle: number; depth: number;
}

class PlannerMemoryManager {
	private capacity: number;
	private visits: Uint32Array;
	private valueSum: Float32Array;
	private prior: Float32Array;
	private firstChild: Int32Array;
	private nextSibling: Int32Array;
	private parent: Int32Array;
	private depth: Uint16Array;
	private records: PlannerNodeRecord[] = [];
	private handleByGraphId: Map<string, number> = new Map();
	private insertionOrder: number[] = [];
	private freeList: number[] = [];
	private transpositionCache: Map<string, { visits: number; value: number; updated: number }>;
	private lastAllocation = 0;

	constructor(capacity = 8192) {
		this.capacity = capacity;
		this.visits = new Uint32Array(capacity);
		this.valueSum = new Float32Array(capacity);
		this.prior = new Float32Array(capacity);
		this.firstChild = new Int32Array(capacity).fill(-1);
		this.nextSibling = new Int32Array(capacity).fill(-1);
		this.parent = new Int32Array(capacity).fill(-1);
		this.depth = new Uint16Array(capacity);
		this.transpositionCache = new Map();
	}

	allocate(graphNodeId: string, parentHandle: number, prior: number, depth: number): number {
		const existing = this.handleByGraphId.get(graphNodeId);
		if (existing !== undefined) return existing;

		let handle: number = -1;

		if (this.freeList.length) {
			handle = this.freeList.pop()!;
		} else if (this.records.length < this.capacity) {
			handle = this.records.length;
			this.records.push({ handle, graphNodeId, parentHandle, depth });
		} else {
			while (this.insertionOrder.length) {
				const victim = this.insertionOrder.shift()!;
				if (victim === 0) {
					this.insertionOrder.push(victim);
					continue;
				}
				this.free(victim);
				handle = victim;
				break;
			}
			if (handle === -1) {
				handle = (this.lastAllocation + 1) % this.capacity;
				this.free(handle);
			}
		}

		if (handle === -1) {
			throw new Error('Failed to allocate handle in memory architecture');
		}

		this.records[handle] = { handle, graphNodeId, parentHandle, depth };
		this.handleByGraphId.set(graphNodeId, handle);
		this.insertionOrder.push(handle);
		this.lastAllocation = handle;

		this.prior[handle] = prior;
		this.visits[handle] = 0;
		this.valueSum[handle] = 0;
		this.firstChild[handle] = -1;
		this.nextSibling[handle] = -1;
		this.parent[handle] = parentHandle;
		this.depth[handle] = depth;

		if (parentHandle >= 0) {
			const oldFirst = this.firstChild[parentHandle];
			this.firstChild[parentHandle] = handle;
			if (oldFirst >= 0) this.nextSibling[handle] = oldFirst;
		}

		return handle;
	}

	private free(handle: number): void {
		const rec = this.records[handle];
		if (!rec) return;

		this.handleByGraphId.delete(rec.graphNodeId);
		this.visits[handle] = 0;
		this.valueSum[handle] = 0;
		this.prior[handle] = 0;
		this.firstChild[handle] = -1;
		this.nextSibling[handle] = -1;
		this.parent[handle] = -1;
		this.depth[handle] = 0;
		this.freeList.push(handle);
	}

	update(handle: number, value: number): void {
		this.visits[handle] += 1;
		this.valueSum[handle] += value;
	}

	selectChildUCB(parentHandle: number, explorationC = 1.4): number | null {
		const parentVisits = Math.max(1, this.visits[parentHandle]);
		let bestHandle: number | null = null;
		let bestScore = -Infinity;

		for (
			let child = this.firstChild[parentHandle];
			child >= 0;
			child = this.nextSibling[child]
		) {
			const v = this.visits[child];
			const q = v > 0 ? this.valueSum[child] / v : 0;
			const p = this.prior[child];
			const u = (explorationC * p * Math.sqrt(parentVisits)) / (1 + v);
			const score = q + u;

			if (score > bestScore) {
				bestScore = score;
				bestHandle = child;
			}
		}

		return bestHandle;
	}

	getStats(handle: number) {
		return {
			visits: this.visits[handle],
			valueSum: this.valueSum[handle],
			prior: this.prior[handle],
			depth: this.depth[handle],
			graphNodeId: this.records[handle]?.graphNodeId
		};
	}

	cacheTransposition(graphNodeId: string, visits: number, value: number): void {
		this.transpositionCache.set(graphNodeId, { visits, value, updated: Date.now() });
	}

	getTransposition(graphNodeId: string) {
		return this.transpositionCache.get(graphNodeId);
	}

	summarize() {
		return {
			capacity: this.capacity,
			records: this.records.length,
			free: this.freeList.length,
			transpositions: this.transpositionCache.size
		};
	}
}

// Singleton planner memory
export const plannerMemory = new PlannerMemoryManager(4096);

// Convenience bridge API for Neo4jAlphaGoPlanner
export const nesPlannerBridge = {
	allocateNode(params: { graphNodeId: string;
		parentHandle: number; prior: number;
		depth: number;
	}) {
		return plannerMemory.allocate(
			params.graphNodeId,
			params.parentHandle,
			params.prior,
			params.depth
		);
	},
	visit(handle: number, value: number): void {
		plannerMemory.update(handle, value);
	},
	select(handle: number, explorationC?: number) {
		return plannerMemory.selectChildUCB(handle, explorationC);
	},
	stats(handle: number) {
		return plannerMemory.getStats(handle);
	},
	summary() {
		return plannerMemory.summarize();
	}
};

// Export singleton instance
export const nesMemory = new NESMemoryArchitecture();




