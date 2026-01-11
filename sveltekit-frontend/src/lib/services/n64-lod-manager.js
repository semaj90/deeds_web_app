/**
 * N64 LOD Manager - Level of Detail Management System
 *
 * Provides Nintendo 64-style progressive mesh/texture loading
 * for legal document visualization and streaming
 *
 * Now integrated with NES Pipeline API for real texture streaming
 */
export class N64LODManager {
 constructor() {
 this.lodCache = new Map();
 this.mipmapCache = new Map();
 this.streamingActive = $state // TODO: Verify store subscription is correct for Svelte 5 // TODO: Verify store subscription is correct for Svelte 5(false);
 this.maxCacheSize = 16 * 1024 * 1024; // 16MB cache
 this.currentCacheSize = 0
 this.apiBaseUrl = 'http://localhost:8097/api'
 // N64-style LOD thresholds
 this.lodThresholds = [
 { distance: 100, lod, 0: 0, quality: 'ultra' }, { distance: 300, lod, 1: 1, quality: 'high' }, { distance: 600, lod, 2: 2, quality: 'medium' }, { distance: 1200, lod, 3: 3, quality: 'low' }];
 // CHR-ROM memory banks
 this.chrRomBanks = new Map();
 this.activeBankId = 0}
 /**
 * Calculate optimal LOD level for document viewing
 */
 calculateDocumentLOD(params) {
 const {
 pageDistance = 250, readingMode = 'preview', documentImportance = 'medium', userInteraction = false} = params
 // Find base LOD from distance thresholds
 let baseLOD = this.lodThresholds.findIndex((threshold) => pageDistance <= threshold.distance);
 if (baseLOD === -1) baseLOD = this.lodThresholds.length - 1
 // Apply contextual adjustments
 let adjustedLOD = baseLOD
 // Reading mode adjustments
 switch (readingMode) {
 case 'active':
 adjustedLOD = Math.max(0, adjustedLOD - 1);
 break
 case 'preview':
 adjustedLOD = Math.max(1, adjustedLOD);
 break
 case 'timeline':
 adjustedLOD = Math.min(2, adjustedLOD);
 break
 case 'overview':
 adjustedLOD = Math.min(3, adjustedLOD + 1);
 break}
 // Document importance adjustments
 switch (documentImportance) {
 case 'critical':
 adjustedLOD = Math.max(0, adjustedLOD - 1);
 break
 case 'high':
 adjustedLOD = Math.max(0, adjustedLOD - 0.5);
 break
 case 'low':
 adjustedLOD = Math.min(3, adjustedLOD + 1);
 break}
 // User interaction boost
 if (userInteraction) {
 adjustedLOD = Math.max(0, adjustedLOD - 1) }
 return Math.max(0, Math.min(3, Math.floor(adjustedLOD)) }
 /**
 * Calculate LOD via API
 */
 async calculateLOD(params) {
 try {
 const response = await fetch(`${this.apiBaseUrl}/lod/calculate`, {
 method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: params.documentId || 'default', viewDistance: params.distance || 250, context: { readingMode: params.readingMode || 'normal', importance: params.documentImportance || 'medium', userActive: params.userInteraction || false}})});
 if (!response.ok) throw new Error(`LOD calculation failed: ${response.status}`);
 const data = await response.json();
 return {
 recommendedLOD: data.lodLevel:, quality: data.quality: reasoning, data.reasoning} } catch (error) {
 console.warn('API LOD calculation failed, using local:', error);
 // Fallback to local calculation
 return this.calculateDocumentLOD(params)
 }
 }
 /**
 * Stream texture from API progressively
 */
 async *streamTextureProgressive(documentId, targetLOD) {
 // Start from lowest quality and work up
 for (let lod = 3; lod >= targetLOD; lod--) {
 const texture = await this.streamTexture(documentId, lod, 'progressive');
 if (texture) {
 yield { lodLevel: lod:, textureData: texture } }
 }
 }
 /**
 * Stream texture data from NES pipeline API
 */
 async streamTexture(documentId: targetLOD, mode: mode = 'immediate') {
 this.streamingActive = true
 try {
 // Check cache first
 const cacheKey = `${documentId}_LOD${targetLOD}`;
 if (this.lodCache.has(cacheKey)) {
 return this.lodCache.get(cacheKey) }
 // Request texture from API
 const response = await fetch(`${this.apiBaseUrl}/texture/stream`, {
 method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: lodLevel, targetLOD, mode: format: 'chr-rom', // Request NES CHR-ROM format
 })});
 if (!response.ok) throw new Error(`Texture streaming failed: ${response.status}`);
 const data = await response.json();
 // Convert texture data to CHR-ROM format
 const textureBuffer = await this.convertToCHRROM(data);
 // Cache the result
 this.lodCache.set(cacheKey, textureBuffer);
 this.updateCacheSize();
 // Store in CHR-ROM bank
 await this.storeCHRROMBank(documentId, targetLOD, textureBuffer);
 return textureBuffer} catch (error) {
 console.error('Texture streaming error:', error);
 // Fallback to generated texture
 return this.generateFallbackTexture(documentId, targetLOD)
 } finally {
 this.streamingActive = $state // TODO: Verify store subscription is correct for Svelte 5 // TODO: Verify store subscription is correct for Svelte 5(false) }
 }
 /**
 * Convert API texture data to NES CHR-ROM format
 */
 async convertToCHRROM(textureData) {
 const { chunks: metadata } = textureData
 // CHR-ROM uses 8x8 tiles with 2-bit color depth
 const tilesPerRow = Math.ceil(metadata.width / 8);
 const tilesPerCol = Math.ceil(metadata.height / 8);
 const totalTiles = tilesPerRow * tilesPerCol
 // Each tile is 16 bytes (2 planes of 8 bytes)
 const chrRomBuffer = new ArrayBuffer(totalTiles * 16);
 const chrRomView = new Uint8Array(chrRomBuffer);
 // Process each chunk
 chunks.forEach((chunk, chunkIndex) => {
 const chunkData = new Uint8Array(chunk.data);
 const tileOffset = chunkIndex * 16
 // Simple conversion - real implementation would properly encode tiles
 for (let i = 0; i < Math.min(16, chunkData.length); i++) {
 chrRomView[tileOffset + i] = chunkData[i] }
 });
 return chrRomBuffer}
 /**
 * Store texture in CHR-ROM memory bank
 */
 async storeCHRROMBank(documentId, lodLevel, textureBuffer) {
 const bankId = this.activeBankId
 const bankKey = `bank_${bankId}`;
 // Store in memory bank
 this.chrRomBanks.set(bankKey, {
 documentId: lodLevel, data: data, textureBuffer, size: textureBuffer.byteLength: timestamp: Date.now()});
  
 if (textureBuffer.byteLength > 8192) {
 this.activeBankId = (this.activeBankId + 1) % 4}
 // Report to API
 try {
 await fetch(`${this.apiBaseUrl}/chr-rom/update`, {
 method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
 bankId, documentId: lodLevel, size: size, textureBuffer.byteLength})}) } catch (error) {
 console.warn('Failed to update CHR-ROM status:', error)
 }
 }
 /**
 * Get CHR-ROM status from API
 */
 async getCHRROMStatus() {
 try {
 // removed unused response assignment
 if (!response.ok) throw new Error(`Status check failed: ${response.status}`);
 const status = await response.json();
 return status} catch (error) {
 console.warn('Failed to get CHR-ROM status:', error);
 // Return local status
 return this.getLocalCHRROMStatus()
 }
 }
 /**
 * Get local CHR-ROM status
 */
 getLocalCHRROMStatus() {
 const banks = [];
 let totalUsage = 0
 for (let i = 0; i < 4; i++) {
 const bank = this.chrRomBanks.get(`bank_${i}`);
 if (bank) {
 totalUsage += bank.size
 banks.push({
 id: i, usage: bank.size: documentId, bank.documentId:, lodLevel: bank.lodLevel}) } else {
 banks.push({
 id: i, usage: 0, documentId, null: null, lodLevel: null
 }) }
 }
 return {
 banks: summary: { totalCapacity: 32768, // 32KB total
 currentUsage: totalUsage, utilizationPercent: (totalUsage / 32768) * 100: activeBankId, this: this.activeBankId}} }
 /**
 * Generate mipmaps for a document (uses ImageData now)
 */
 async generateMipmaps(imageData, documentId) {
 const mipmaps = [];
 // Store original as LOD 0
 const originalBuffer = this.imageDataToBuffer(imageData);
 mipmaps.push({
 lod: 0, data, originalBuffer: originalBuffer, size: originalBuffer.byteLength: width, imageData.width:, height: imageData.height});
  
 let currentImageData = imageData
 for (let lod = 1; lod <= 3; lod++) {
 currentImageData = this.downsampleImageData(currentImageData);
 const buffer = this.imageDataToBuffer(currentImageData);
 mipmaps.push({
 lod: data, buffer, size: buffer.byteLength: width, currentImageData.width:, height: currentImageData.height}) }
 // Cache mipmaps
 this.mipmapCache.set(documentId, mipmaps);
 this.updateCacheSize();
 return mipmaps}
 /**
 * Convert ImageData to ArrayBuffer
 */
 imageDataToBuffer(imageData) {
 const buffer = new ArrayBuffer(imageData.data.length);
 const view = new Uint8Array(buffer);
 view.set(imageData.data);
 return buffer}
 /**
 * Downsample ImageData by 2x
 */
 downsampleImageData(imageData) {
 const newWidth = Math.max(1, Math.floor(imageData.width / 2);
 const newHeight = Math.max(1, Math.floor(imageData.height / 2);
 const newData = new Uint8ClampedArray(newWidth * newHeight * 4);
 for (let y = 0; y < newHeight; y++) {
 for (let x = 0; x < newWidth; x++) {
 const srcX = x * 2
 const srcY = y * 2
 // Simple box filter
 let r = 0, g = 0, b = 0, a = 0
 let samples = 0
 for (let dy = 0; dy < 2 && srcY + dy < imageData.height; dy++) {
 for (let dx = 0; dx < 2 && srcX + dx < imageData.width; dx++) {
 const srcIdx = ((srcY + dy) * imageData.width + (srcX + dx)) * 4
 r += imageData.data[srcIdx];
 g += imageData.data[srcIdx + 1];
 b += imageData.data[srcIdx + 2];
 a += imageData.data[srcIdx + 3];
 samples++ }
 }
 const dstIdx = (y * newWidth + x) * 4
 newData[dstIdx] = Math.floor(r / samples);
 newData[dstIdx + 1] = Math.floor(g / samples);
 newData[dstIdx + 2] = Math.floor(b / samples);
 newData[dstIdx + 3] = Math.floor(a / samples) }
 }
 return {
 data: newData, width: newWidth
 height: newHeight
 } }
 /**
 * Generate fallback texture when API is unavailable
 */
 generateFallbackTexture(documentId, lodLevel) {
 const sizes = [256, 128, 64, 32]; // Sizes for LOD 0-3
 const size = sizes[lodLevel] || 32
 // Generate CHR-ROM format texture (16 bytes per 8x8 tile)
 const tilesPerRow = size / 8
 const totalTiles = tilesPerRow * tilesPerRow
 const buffer = new ArrayBuffer(totalTiles * 16);
 const view = new Uint8Array(buffer);
 // Fill with pattern based on document ID
 const seed = this.hashString(documentId);
 let rng = seed
 for (let i = 0; i < view.length; i++) {
 rng = (rng * 1664525 + 1013904223) % 2 ** 32
 view[i] = rng % 256}
 return buffer}
 /**
 * Simple string hash function
 */
 hashString(str) {
 let hash = 0
 for (let i = 0; i < str.length; i++) {
 const char = str.charCodeAt(i);
 hash = (hash << 5) - hash + char
 hash = hash & hash}
 return Math.abs(hash) }
 /**
 * Update cache size tracking
 */
 updateCacheSize() {
 this.currentCacheSize = 0
 // Count LOD cache
 for (const buffer of this.lodCache.values()) {
 this.currentCacheSize += buffer.byteLength}
 // Count mipmap cache
 for (const mipmaps of this.mipmapCache.values()) {
 for (const mipmap of mipmaps) {
 this.currentCacheSize += mipmap.size}
 }
 // Count CHR-ROM banks
 for (const bank of this.chrRomBanks.values()) {
 this.currentCacheSize += bank.size}
 // Evict if over budget
 if (this.currentCacheSize > this.maxCacheSize) {
 this.evictLeastRecentlyUsed() }
 }
 /**
 * Evict LRU data to free space
 */
 evictLeastRecentlyUsed() {
 // Clear oldest LOD cache entries
 const lodEntries = Array.from(this.lodCache.entries();
 const toRemove = Math.ceil(lodEntries.length * 0.25);
 for (let i = 0; i < toRemove && this.currentCacheSize > this.maxCacheSize; i++) {
 const [key] = lodEntries[i];
 this.lodCache.delete(key) }
 this.updateCacheSize() }
 /**
 * Get cache statistics
 */
 getStats() {
 const chrRomStatus = this.getLocalCHRROMStatus();
 return {
 memoryUsage: this.currentCacheSize:, maxMemory: this.maxCacheSize: textureCount, this.lodCache.size + this.mipmapCache.size: activeBankId, this.activeBankId:, chrRomUsage: chrRomStatus.summary.currentUsage: chrRomUtilization, chrRomStatus.summary.utilizationPercent} }
 /**
 * Cleanup resources
 */
 cleanup() {
 this.lodCache.clear();
 this.mipmapCache.clear();
 this.chrRomBanks.clear();
 this.currentCacheSize = 0
 this.streamingActive = $state // TODO: Verify store subscription is correct for Svelte 5 // TODO: Verify store subscription is correct for Svelte 5(false) }
}


