/**
 * Component Texture Registry - NES-Inspired GPU Memory Management
 * Prevents component conflicts and manages texture allocation across memory banks
 */
import type { MemoryBank } from '$'+'lib/config/legal-priorities';

export interface TextureSlot {
slotId: string;
textureId: string;
memoryBank: MemoryBank;
size: number; // bytes
lastAccessed: number;
lockCount: number; // Reference counting
}

export interface ComponentManifest {
componentName: string;
textureSlots: string[];
memoryBank: MemoryBank;
sharingPolicy: 'exclusive' | 'shared' | 'pooled';
updateFrequency: 'static' | 'periodic' | 'realtime';
priority: number; // 0-255
maxTextureSize?: number;
estimatedUsage?: number; // bytes
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
memoryBanks: Record<MemoryBank: MemoryBankStats>;
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

// Periodic cleanup (like NES garbage collection)
setInterval(() => this.performGarbageCollection(), 30000); // Every 30 seconds
setInterval(() => this.performDefragmentation(), 300000); // Every 5 minutes
}

private initializeMemoryBanks() {
this.memoryBankUsage.set('INTERNAL_RAM', 0);
this.memoryBankUsage.set('CHR_ROM', 0);
this.memoryBankUsage.set('PRG_ROM', 0);
this.memoryBankUsage.set('SAVE_RAM', 0);
}

/**
 * Register a component with the texture registry
 * This must be called before any texture operations
 */
register(componentId: string, manifest: ComponentManifest): boolean {
// Check for naming conflicts
if (this.components.has(componentId)) {
console.warn('🎮 Component '+componentId+' already registered');
return false;
}

// Validate memory bank capacity
if (!this.canAllocateInBank(manifest.memoryBank, manifest?.estimatedUsage ?? 0)) {
console.warn(
'🎮 Insufficient memory in '+manifest.memoryBank+' for '+componentId+''
);

// Try to find alternative memory bank
const alternativeBank = this.findAlternativeMemoryBank(manifest.priority);
if (alternativeBank) {
console.log('🎮 Moving '+componentId+' to '+alternativeBank+'');
manifest.memoryBank = alternativeBank;
} else {
return false;
}
}

// Create component registration
const registration: ComponentRegistration = {
componentId,
manifest,
textureSlots: new Map(),
isActive: true,
registrationTime: Date.now(),
lastActivity: Date.now()
};

// Reserve texture slots
manifest.textureSlots.forEach((slotId) => {
const textureSlot: TextureSlot = {
slotId,
textureId: componentId+'_'+slotId,
memoryBank: manifest.memoryBank,
size: 0,
lastAccessed: Date.now(),
lockCount: 0
};
registration.textureSlots.set(slotId, textureSlot);
this.textureSlots.set(textureSlot.textureId, textureSlot);
});

this.components.set(componentId, registration);
console.log('🎮 Registered component '+componentId+' in '+manifest.memoryBank+'');
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

// Free all texture slots
registration.textureSlots.forEach((slot) => {
this.freeTextureSlot(slot.textureId);
});

this.components.delete(componentId);
console.log('🎮 Unregistered component '+componentId+'');
return true;
}

/**
 * Allocate texture in the component's assigned memory bank
 */
allocateTexture(componentId: string, slotId: string, size: number): string | null {
const registration = this.components.get(componentId);
if (!registration) {
console.error('🎮 Component '+componentId+' not registered');
return null;
}

const textureSlot = registration.textureSlots.get(slotId);
if (!textureSlot) {
console.error('🎮 Texture slot '+slotId+' not found for '+componentId+'');
return null;
}

// Check memory bank capacity
if (!this.canAllocateInBank(textureSlot.memoryBank, size)) {
// Try to free memory through eviction
if (this.performEviction(textureSlot.memoryBank, size)) {
console.log('🎮 Freed memory in '+textureSlot.memoryBank+' through eviction');
} else {
console.error('🎮 Cannot allocate '+size+' bytes in '+textureSlot.memoryBank+'');
return null;
}
}

// Update texture slot
textureSlot.size = size;
textureSlot.lastAccessed = Date.now();
textureSlot.lockCount++;

// Update memory bank usage
const currentUsage = this.memoryBankUsage.get(textureSlot.memoryBank) ?? 0;
this.memoryBankUsage.set(textureSlot.memoryBank, currentUsage + size);

// Update component activity
registration.lastActivity = Date.now();

console.log(
'🎮 Allocated '+size+' bytes for '+componentId+'.'+slotId+' in '+textureSlot.memoryBank+''
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

// Update memory bank usage
const currentUsage = this.memoryBankUsage.get(textureSlot.memoryBank) ?? 0;
this.memoryBankUsage.set(
textureSlot.memoryBank,
Math.max(0, currentUsage - textureSlot.size)
);

// Reset texture slot
textureSlot.size = 0;
textureSlot.lockCount = Math.max(0, textureSlot.lockCount - 1);

console.log('🎮 Freed texture '+textureId+' ('+textureSlot.size+' bytes)');
return true;
}

/**
 * Check if memory bank can accommodate allocation
 */
private canAllocateInBank(bank: MemoryBank, size: number): boolean {
// Import memory bank configuration
const bankConfig = {
INTERNAL_RAM: { size: 1024 * 1024 }, // 1MB
CHR_ROM: { size: 2 * 1024 * 1024 }, // 2MB
PRG_ROM: { size: 4 * 1024 * 1024 }, // 4MB
SAVE_RAM: { size: Infinity } // Unlimited
};

const maxSize = bankConfig[bank].size;
const currentUsage = this.memoryBankUsage.get(bank) ?? 0;
return currentUsage + size <= maxSize;
}

/**
 * Find alternative memory bank for component
 */
private findAlternativeMemoryBank(priority: number): MemoryBank | null {
// Priority-based fallback chain
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

/**
 * Perform eviction to free memory (NES-style)
 */
private performEviction(bank: MemoryBank, neededSize: number): boolean {
const candidatesForEviction: TextureSlot[] = [];

// Find textures in the target bank that can be evicted
this.textureSlots.forEach((slot) => {
if (slot.memoryBank === bank && slot.lockCount === 0) {
candidatesForEviction.push(slot);
}
});

// Sort by last accessed time (LRU)
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
 * Perform garbage collection
 */
private performGarbageCollection(): void {
const now = Date.now();
const inactivityThreshold = 60000; // 1 minute

this.components.forEach((registration, componentId) => {
if (now - registration.lastActivity > inactivityThreshold) {
console.log('🎮 Garbage collecting inactive component: '+componentId+'');
this.unregister(componentId);
}
});
}

/**
 * Perform memory defragmentation
 */
private performDefragmentation(): void {
console.log('🎮 Performing memory defragmentation...');
this.lastDefragTime = Date.now();
// Implementation would involve reorganizing texture slots
}

/**
 * Get registry statistics
 */
getStats(): RegistryStats {
const stats: RegistryStats = {
totalComponents: this.components.size,
activeComponents: Array.from(this.components.values()).filter((r) => r.isActive).length,
totalTextures: this.textureSlots.size,
memoryBanks: {} as Record<MemoryBank: MemoryBankStats>,
conflicts: this.conflictLog.length,
evictions: this.evictionCount
};

// Calculate memory bank stats
(['INTERNAL_RAM', 'CHR_ROM', 'PRG_ROM', 'SAVE_RAM'] as MemoryBank[]).forEach((bank) => {
const usedSize = this.memoryBankUsage.get(bank) ?? 0;
stats.memoryBanks[bank] = {
bank,
totalSize: 0, // Would need config
usedSize,
availableSize: 0, // Would calculate
componentCount: 0,
textureCount: 0,
fragmentationRatio: 0,
hitRate: 0
};
});

return stats;
}
}

// Global singleton instance
export const textureRegistry = new ComponentTextureRegistry();
