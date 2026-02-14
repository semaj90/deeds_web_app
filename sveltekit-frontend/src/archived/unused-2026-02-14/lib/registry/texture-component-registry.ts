/**
 * Component Texture Registry - NES-Inspired GPU Memory Management
 * Prevents component conflicts and manages texture allocation across memory banks
 */

export type MemoryBank = 'INTERNAL_RAM' | 'CHR_ROM' | 'PRG_ROM' | 'SAVE_RAM';

export interface TextureSlot {
  slotId: string;
	textureId: string;
  memoryBank: MemoryBank;
	size: number;
  lastAccessed: number;
	lockCount: number;
}

export interface ComponentManifest {
  componentName: string;
	textureSlots: string[];
  memoryBank: MemoryBank;
	sharingPolicy: 'exclusive' | 'shared' | 'pooled';
  updateFrequency: 'static' | 'periodic' | 'realtime';
  priority: number;
  maxTextureSize?: number;
  estimatedUsage?: number;
}

export interface ComponentRegistration {
  componentId: string;
	manifest: ComponentManifest;
  textureSlots: Map<string, TextureSlot>;
  isActive: boolean;
	registrationTime: number;
  lastActivity: number;
}

export interface MemoryBankStats {
  bank: MemoryBank;
	totalSize: number;
  usedSize: number;
	availableSize: number;
  componentCount: number;
	textureCount: number;
  fragmentationRatio: number;
	hitRate: number;
}

export interface RegistryStats {
  totalComponents: number;
	activeComponents: number;
  totalTextures: number;
	memoryBanks: Record<MemoryBank, MemoryBankStats>;
  conflicts: number;
	evictions: number;
}

/**
 * Global Component Texture Registry
 * Manages GPU memory allocation like an NES memory mapper
 */
class ComponentTextureRegistry {
  private components = new Map<string, ComponentRegistration>();
  private textureSlots = new Map<string, TextureSlot>();
  private memoryBankUsage = new Map<MemoryBank, number>();
  private conflictLog: string[] = [];
  private evictionCount = 0;
  private lastDefragTime = 0;

  constructor() {
    this.initializeMemoryBanks();
  }

  private initializeMemoryBanks() {
    this.memoryBankUsage.set('INTERNAL_RAM', 0);
    this.memoryBankUsage.set('CHR_ROM', 0);
    this.memoryBankUsage.set('PRG_ROM', 0);
    this.memoryBankUsage.set('SAVE_RAM', 0);
  }

  /**
   * Register a component with the texture registry
   */
  register(componentId: string, manifest: ComponentManifest): boolean {
    if (this.components.has(componentId)) {
      console.warn(`🎮 Component ${componentId} already registered`);
      return false;
    }

    if (!this.canAllocateInBank(manifest.memoryBank, manifest?.estimatedUsage ?? 0)) {
      console.warn(`🎮 Insufficient memory in ${manifest.memoryBank} for ${componentId}`);

      const alternativeBank = this.findAlternativeMemoryBank(manifest.priority);
      if (alternativeBank) {
        console.log(`🎮 Moving ${componentId} to ${alternativeBank}`);
        manifest.memoryBank = alternativeBank;
      } else {
        return false;
      }
    }

    const registration: ComponentRegistration = {
      componentId,
      manifest,
      textureSlots: new Map(),
      isActive: true,
      registrationTime: Date.now(),
      lastActivity: Date.now(),
    };

    manifest.textureSlots.forEach((slotId) => {
      const textureSlot: TextureSlot = {
        slotId,
        textureId: `${componentId}_${slotId}`,
        memoryBank: manifest.memoryBank,
        size: 0,
        lastAccessed: Date.now(),
        lockCount: 0,
      };
      registration.textureSlots.set(slotId, textureSlot);
      this.textureSlots.set(textureSlot.textureId, textureSlot);
    });

    this.components.set(componentId, registration);
    console.log(`🎮 Registered component ${componentId} in ${manifest.memoryBank}`);
    return true;
  }

  /**
   * Unregister a component and free its textures
   */
  unregister(componentId: string): boolean {
    const registration = this.components.get(componentId);
    if (!registration) {
      return false;
    }

    registration.textureSlots.forEach((slot) => {
      this.freeTextureSlot(slot.textureId);
    });

    this.components.delete(componentId);
    console.log(`🎮 Unregistered component ${componentId}`);
    return true;
  }

  /**
   * Allocate texture in the component's assigned memory bank
   */
  allocateTexture(componentId: string, slotId: string, size: number): string | null {
    const registration = this.components.get(componentId);
    if (!registration) {
      console.error(`🎮 Component ${componentId} not registered`);
      return null;
    }

    const textureSlot = registration.textureSlots.get(slotId);
    if (!textureSlot) {
      console.error(`🎮 Texture slot ${slotId} not found for ${componentId}`);
      return null;
    }

    if (!this.canAllocateInBank(textureSlot.memoryBank, size)) {
      if (this.performEviction(textureSlot.memoryBank, size)) {
        console.log(`🎮 Freed memory in ${textureSlot.memoryBank} through eviction`);
      } else {
        console.error(`🎮 Cannot allocate ${size} bytes in ${textureSlot.memoryBank}`);
        return null;
      }
    }

    textureSlot.size = size;
    textureSlot.lastAccessed = Date.now();
    textureSlot.lockCount++;

    const currentUsage = this.memoryBankUsage.get(textureSlot.memoryBank) ?? 0;
    this.memoryBankUsage.set(textureSlot.memoryBank, currentUsage + size);

    registration.lastActivity = Date.now();

    console.log(
      `🎮 Allocated ${size} bytes for ${componentId}.${slotId} in ${textureSlot.memoryBank}`
    );
    return textureSlot.textureId;
  }

  /**
   * Free texture slot and update memory usage
   */
  freeTextureSlot(textureId: string): boolean {
    const textureSlot = this.textureSlots.get(textureId);
    if (!textureSlot) {
      return false;
    }

    const currentUsage = this.memoryBankUsage.get(textureSlot.memoryBank) ?? 0;
    this.memoryBankUsage.set(textureSlot.memoryBank, Math.max(0, currentUsage - textureSlot.size));

    textureSlot.size = 0;
    textureSlot.lockCount = Math.max(0, textureSlot.lockCount - 1);

    console.log(`🎮 Freed texture ${textureId}`);
    return true;
  }

  private canAllocateInBank(bank: MemoryBank, size: number): boolean {
    const bankConfig: Record<MemoryBank, { size: number }> = {
      INTERNAL_RAM: {
	size: 1024 * 1024 },
	CHR_ROM: {
	size: 2 * 1024 * 1024 },
	PRG_ROM: {
	size: 4 * 1024 * 1024 },
	SAVE_RAM: {
	size: Infinity },
	};

    const maxSize = bankConfig[bank].size;
    const currentUsage = this.memoryBankUsage.get(bank) ?? 0;
    return currentUsage + size <= maxSize;
  }

  private findAlternativeMemoryBank(priority: number): MemoryBank | null {
    if (priority >= 200 && this.canAllocateInBank('CHR_ROM', 0)) {
      return 'CHR_ROM';
    }
    if (priority >= 150 && this.canAllocateInBank('PRG_ROM', 0)) {
      return 'PRG_ROM';
    }
    if (this.canAllocateInBank('SAVE_RAM', 0)) {
      return 'SAVE_RAM';
    }
    return null;
  }

  private performEviction(bank: MemoryBank, neededSize: number): boolean {
    const candidatesForEviction: TextureSlot[] = [];

    this.textureSlots.forEach((slot) => {
      if (slot.memoryBank === bank && slot.lockCount === 0) {
        candidatesForEviction.push(slot);
      }
    });

    candidatesForEviction.sort((a, b) => a.lastAccessed - b.lastAccessed);

    let freedSize = 0;
    for (const slot of candidatesForEviction) {
      if (freedSize >= neededSize) break;

      this.freeTextureSlot(slot.textureId);
      freedSize += slot.size;
      this.evictionCount++;
    }

    return freedSize >= neededSize;
  }

  /**
   * Get registry statistics
   */
  getStats(): RegistryStats {
    const stats: RegistryStats = {
      totalComponents: this.components.size,
      activeComponents: Array.from(this.components.values()).filter((r) => r.isActive).length,
      totalTextures: this.textureSlots.size,
      memoryBanks: {} as Record<MemoryBank, MemoryBankStats>,
      conflicts: this.conflictLog.length,
      evictions: this.evictionCount,
    };

    const banks: MemoryBank[] = ['INTERNAL_RAM', 'CHR_ROM', 'PRG_ROM', 'SAVE_RAM'];
    banks.forEach((bank) => {
      const usedSize = this.memoryBankUsage.get(bank) ?? 0;
      stats.memoryBanks[bank] = {
        bank,
        totalSize: 0,
        usedSize,
        availableSize: 0,
        componentCount: 0,
        textureCount: 0,
        fragmentationRatio: 0,
        hitRate: 0,
      };
    });

    return stats;
  }
}

export const textureRegistry = new ComponentTextureRegistry();
