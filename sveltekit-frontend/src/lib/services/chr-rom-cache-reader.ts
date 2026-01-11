/** * CHR-ROM Cache Reader Service * Zero-latency UI pattern retrieval from Redis L1 cache * * This service provides instant access to pre-computed UI patterns * with graceful fallbacks when cache misses occur */ // Singleton instance export const chrROMCacheReader = new CHRROMCacheReader(); // Utility functions for Svelte components export async function getDocumentIcon(docId): Promise<string> { const result = await chrROMCacheReader.getPattern(docId, 'summary_icon'); return result.pattern.data || ''}
export async function getDocumentRiskGauge(docId): Promise<string> {
 const result = await chrROMCacheReader.getPattern(docId, 'risk_gauge');
 return result.pattern.data || '';
}
export async function getDocumentCategoryColor(docId): Promise<string> {
 const result = await chrROMCacheReader.getPattern(docId, 'category_color');
 return result.pattern.data || '#6B7280';
}
export async function getDocumentConfidenceBadge(docId): Promise<string> {
 const result = await chrROMCacheReader.getPattern(docId, 'confidence_badge');
 return result.pattern.data || '';
}
export async function getDocumentStatusIndicator(docId): Promise<string> {
 const result = await chrROMCacheReader.getPattern(docId, 'status_indicator');
 return result.pattern.data || '';
}

