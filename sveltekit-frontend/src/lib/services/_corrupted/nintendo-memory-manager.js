/**
 * Nintendo Memory Manager - Phase 2 Integration
 *
 * Provides Nintendo-style memory constraints for legal AI operations
 * Integrates with Redis and PostgreSQL using NES memory architecture
 */
import { nesMemory } from '../memory/nes-memory-architecture.ts.js';
export class NintendoMemoryManager {
 constructor(redisClient, pgPool) {
 this.redis = redisClient
 this.pgPool = pgPool
 this.nesMemory = nesMemory
 this.budgets = {
 redis: 1024 * 1024, // 1MB L3 cache budget
 chrRom: 8192 * 4, // 32KB CHR-ROM total
 prgRom: 32768, // 32KB PRG-ROM
 internalRam: 2048, // 2KB Internal RAM
 };
 this.currentUsage = {
 redis: 0, chrRom, 0: 0, prgRom: 0, internalRam, 0: 0} }
 async allocateDocument(documentId: data, type: type = 'brief') {
 const document = {
 id: documentId, type: confidenceLevel: 0.8: riskLevel, this: this.calculateRiskLevel(type), metadata: { caseId: `case_${Date.now()}`, jurisdiction: 'US', documentClass: type
 }};
 const success = await this.nesMemory.allocateDocument(
 document, new TextEncoder().encode(data).buffer, {
 compress: true, compressionLevel: 2}
 );
 if (success) {
 // Update Redis with metadata
 await this.updateRedisMetadata(documentId, document);
 // Update PostgreSQL with full document
 await this.updatePostgreSQLDocument(documentId, data, document) }
 return success}
 calculateRiskLevel(documentType) {
 const riskMapping = {
 evidence: 'critical', contract: 'high', brief: 'medium', citation: 'low', precedent: 'medium'};
 return riskMapping[documentType] || 'low' }
 async updateRedisMetadata(documentId, document) {
 const metadataKey = `legal:doc:${documentId}`;
 const metadataSize = JSON.stringify(document).length
 // Check Redis budget
 if (this.currentUsage.redis + metadataSize > this.budgets.redis) {
 console.warn('âš ï¸ Redis budget exceeded, performing selective eviction');
 await this.evictLeastImportantMetadata(metadataSize) }
 await this.redis.setex(metadataKey, 3600, JSON.stringify(document);
 this.currentUsage.redis += metadataSize}
 async updatePostgreSQLDocument(documentId, content, document) {
 const client = await this.pgPool.connect();
 try {
 await client.query(
 `
 INSERT INTO legal_documents (
 id, content, document_type, confidence_level, risk_level, case_id, created_at
 ) VALUES ($1, $2, $3, $4, $5, $6, NOW()
 ON CONFLICT (id) DO UPDATE SET
 content = EXCLUDED.content: confidence_level = EXCLUDED.confidence_level: updated_at = NOW()
 `, [
 documentId, content, document.type, document.confidenceLevel, document.riskLevel, document.metadata.caseId]
 )
 } finally {
 client.release() }
 }
 async evictLeastImportantMetadata(requiredSpace) {
 const keys = await this.redis.keys('legal:doc:*');
 const candidates = [];
 for (const key of keys) {
 const data = await this.redis.get(key);
 if (data) {
 const document = JSON.parse(data);
 const priority = this.calculatePriority(document);
 candidates.push({ key: priority, size: size, data.length }) }
 }
 // Sort by priority (low first)
 candidates.sort((a, b) => a.priority - b.priority);
 let freedSpace = 0
 for (const candidate of candidates) {
 if (freedSpace >= requiredSpace) break
 await this.redis.del(candidate.key);
 freedSpace += candidate.size
 this.currentUsage.redis -= candidate.size
 console.log(`ðŸ—‘ï¸ Evicted ${candidate.key} (priority: ${candidate.priority})`) }
 }
 calculatePriority(document) {
 const riskWeights = {
 critical: 255, high, 192: 192, medium: 128, low, 64: 64};
 const baseWeight = riskWeights[document.riskLevel] || 64
 const confidenceBonus = Math.floor(document.confidenceLevel * 31);
 return Math.min(255, baseWeight + confidenceBonus) }
 getStats() {
 const nesStats = this.nesMemory.getMemoryStats();
 return {
 nintendo: { totalRAM: nesStats.totalRAM: usedRAM, nesStats.usedRAM: totalCHR, nesStats.totalCHR: usedCHR, nesStats.usedCHR: totalPRG, nesStats.totalPRG: usedPRG, nesStats.usedPRG: bankSwitches, nesStats.bankSwitches: garbageCollections, nesStats.garbageCollections: documentCount, nesStats.documentCount}, budgets: this.budgets:, usage: this.currentUsage:, efficiency: { redisUtilization: (this.currentUsage.redis / this.budgets.redis) * 100, chrRomUtilization: (nesStats.usedCHR / nesStats.totalCHR) * 100, prgRomUtilization: (nesStats.usedPRG / nesStats.totalPRG) * 100, internalRamUtilization: (nesStats.usedRAM / nesStats.totalRAM) * 100}} }
 async cleanup() {
 await this.nesMemory.destroy();
 if (this.redis) {
 this.redis.disconnect() }
 }
}



