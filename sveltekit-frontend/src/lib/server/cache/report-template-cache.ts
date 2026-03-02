/**
 * Report Template Caching Service
 * Priority #9: Redis-backed template and AI-generated content caching
 *
 * Caches:
 * - Template metadata (1 hour TTL - rarely changes)
 * - AI-generated report content (30 minutes TTL - case-specific)
 * - Template rendering results (15 minutes TTL)
 */

import { redisPool } from '$lib/server/redis.js';
import { REPORT_TEMPLATES, getTemplate, type ReportTemplate } from '$lib/data/report-templates.js';
import type { Redis } from 'ioredis';

const CACHE_VERSION = 'v1'; // Increment to invalidate all cached templates

/**
 * Cache key patterns for report templates
 */
export const TEMPLATE_CACHE_KEYS = {
	/**
	 * Template metadata cache
	 * Key: template:meta:{type}:v1
	 * TTL: 1 hour
	 */
	metadata: (type: string) => `template:meta:${type}:${CACHE_VERSION}`,

	/**
	 * All templates list cache
	 * Key: template:all:v1
	 * TTL: 1 hour
	 */
	allTemplates: () => `template:all:${CACHE_VERSION}`,

	/**
	 * AI-generated content cache
	 * Key: template:ai:{templateType}:{caseId}:v1
	 * TTL: 30 minutes
	 */
	aiContent: (templateType: string, caseId: string) =>
		`template:ai:${templateType}:${caseId}:${CACHE_VERSION}`,

	/**
	 * Rendered template cache
	 * Key: template:rendered:{templateType}:{caseId}:{hash}:v1
	 * TTL: 15 minutes
	 */
	rendered: (templateType: string, caseId: string, paramsHash: string) =>
		`template:rendered:${templateType}:${caseId}:${paramsHash}:${CACHE_VERSION}`
} as const;

/**
 * TTL values (in seconds)
 */
const TTL = {
	METADATA: 60 * 60, // 1 hour - templates rarely change
	ALL_TEMPLATES: 60 * 60, // 1 hour
	AI_CONTENT: 30 * 60, // 30 minutes - AI-generated content
	RENDERED: 15 * 60 // 15 minutes - rendered templates
} as const;

/**
 * Cached AI-generated content structure
 */
export interface CachedAIContent {
	content: string;
	templateType: string;
	caseId: string;
	generatedAt: string;
	model: string;
	tokenCount?: number;
}

/**
 * Cached rendered template structure
 */
export interface CachedRenderedTemplate {
	content: string;
	title: string;
	templateType: string;
	caseId: string;
	renderedAt: string;
	paramsHash: string;
}

/**
 * Get template metadata from cache, falling back to source
 */
export async function getCachedTemplate(type: string): Promise<ReportTemplate | null> {
	const redis = redisPool.getConnection();
	try {
		// Try cache first
		const cacheKey = TEMPLATE_CACHE_KEYS.metadata(type);
		const cached = await redis.get(cacheKey);

		if (cached) {
			console.log(`[TemplateCache] HIT: ${cacheKey}`);
			return JSON.parse(cached) as ReportTemplate;
		}

		console.log(`[TemplateCache] MISS: ${cacheKey}`);

		// Fallback to source
		const template = getTemplate(type);
		if (template) {
			// Cache for future use
			await redis.setex(cacheKey, TTL.METADATA, JSON.stringify(template));
		}

		return template;
	} catch (err) {
		console.error('[TemplateCache] Error getting template:', err);
		// Fallback to source on cache error
		return getTemplate(type);
	}
}

/**
 * Get all templates from cache
 */
export async function getCachedAllTemplates(): Promise<ReportTemplate[]> {
	const redis = redisPool.getConnection();
	try {
		// Try cache first
		const cacheKey = TEMPLATE_CACHE_KEYS.allTemplates();
		const cached = await redis.get(cacheKey);

		if (cached) {
			console.log(`[TemplateCache] HIT: ${cacheKey}`);
			return JSON.parse(cached) as ReportTemplate[];
		}

		console.log(`[TemplateCache] MISS: ${cacheKey}`);

		// Fallback to source
		const templates = Object.values(REPORT_TEMPLATES);

		// Cache for future use
		await redis.setex(cacheKey, TTL.ALL_TEMPLATES, JSON.stringify(templates));

		return templates;
	} catch (err) {
		console.error('[TemplateCache] Error getting all templates:', err);
		// Fallback to source on cache error
		return Object.values(REPORT_TEMPLATES);
		
	}
}

/**
 * Cache AI-generated report content
 */
export async function cacheAIContent(
	templateType: string,
	caseId: string,
	content: string,
	model: string = 'gemma3-legal:latest',
	tokenCount?: number
): Promise<void> {
	const redis = redisPool.getConnection();
	try {
		const cacheKey = TEMPLATE_CACHE_KEYS.aiContent(templateType, caseId);
		const data: CachedAIContent = {
			content,
			templateType,
			caseId,
			generatedAt: new Date().toISOString(),
			model,
			tokenCount
		};

		await redis.setex(cacheKey, TTL.AI_CONTENT, JSON.stringify(data));
		console.log(`[TemplateCache] Cached AI content: ${cacheKey}`);
	} catch (err) {
		console.error('[TemplateCache] Error caching AI content:', err);
		// Non-fatal - continue without caching
		
	}
}

/**
 * Get cached AI-generated content
 */
export async function getCachedAIContent(
	templateType: string,
	caseId: string
): Promise<CachedAIContent | null> {
	const redis = redisPool.getConnection();
	try {
		const cacheKey = TEMPLATE_CACHE_KEYS.aiContent(templateType, caseId);
		const cached = await redis.get(cacheKey);

		if (cached) {
			console.log(`[TemplateCache] HIT (AI): ${cacheKey}`);
			return JSON.parse(cached) as CachedAIContent;
		}

		console.log(`[TemplateCache] MISS (AI): ${cacheKey}`);
		return null;
	} catch (err) {
		console.error('[TemplateCache] Error getting AI content:', err);
		return null;
		
	}
}

/**
 * Cache rendered template (with placeholder replacements)
 */
export async function cacheRenderedTemplate(
	templateType: string,
	caseId: string,
	paramsHash: string,
	content: string,
	title: string
): Promise<void> {
	const redis = redisPool.getConnection();
	try {
		const cacheKey = TEMPLATE_CACHE_KEYS.rendered(templateType, caseId, paramsHash);
		const data: CachedRenderedTemplate = {
			content,
			title,
			templateType,
			caseId,
			renderedAt: new Date().toISOString(),
			paramsHash
		};

		await redis.setex(cacheKey, TTL.RENDERED, JSON.stringify(data));
		console.log(`[TemplateCache] Cached rendered template: ${cacheKey}`);
	} catch (err) {
		console.error('[TemplateCache] Error caching rendered template:', err);
		// Non-fatal - continue without caching
		
	}
}

/**
 * Get cached rendered template
 */
export async function getCachedRenderedTemplate(
	templateType: string,
	caseId: string,
	paramsHash: string
): Promise<CachedRenderedTemplate | null> {
	const redis = redisPool.getConnection();
	try {
		const cacheKey = TEMPLATE_CACHE_KEYS.rendered(templateType, caseId, paramsHash);
		const cached = await redis.get(cacheKey);

		if (cached) {
			console.log(`[TemplateCache] HIT (rendered): ${cacheKey}`);
			return JSON.parse(cached) as CachedRenderedTemplate;
		}

		console.log(`[TemplateCache] MISS (rendered): ${cacheKey}`);
		return null;
	} catch (err) {
		console.error('[TemplateCache] Error getting rendered template:', err);
		return null;
		
	}
}

/**
 * Invalidate template cache for a specific template type
 * Used when templates are updated
 */
export async function invalidateTemplateCache(templateType: string): Promise<void> {
	const redis = redisPool.getConnection();
	try {
		const pattern = `template:*:${templateType}:*`;
		const keys = await redis.keys(pattern);

		if (keys.length > 0) {
			await redis.del(...keys);
			console.log(`[TemplateCache] Invalidated ${keys.length} keys for template: ${templateType}`);
		}
	} catch (err) {
		console.error('[TemplateCache] Error invalidating template cache:', err);
		// Non-fatal
		
	}
}

/**
 * Invalidate all AI-generated content for a case
 * Used when case data changes significantly
 */
export async function invalidateCaseAIContent(caseId: string): Promise<void> {
	const redis = redisPool.getConnection();
	try {
		const pattern = `template:ai:*:${caseId}:*`;
		const keys = await redis.keys(pattern);

		if (keys.length > 0) {
			await redis.del(...keys);
			console.log(`[TemplateCache] Invalidated ${keys.length} AI content keys for case: ${caseId}`);
		}
	} catch (err) {
		console.error('[TemplateCache] Error invalidating case AI content:', err);
		// Non-fatal
		
	}
}

/**
 * Invalidate all rendered templates for a case
 * Used when case data changes
 */
export async function invalidateCaseRenderedTemplates(caseId: string): Promise<void> {
	const redis = redisPool.getConnection();
	try {
		const pattern = `template:rendered:*:${caseId}:*`;
		const keys = await redis.keys(pattern);

		if (keys.length > 0) {
			await redis.del(...keys);
			console.log(`[TemplateCache] Invalidated ${keys.length} rendered template keys for case: ${caseId}`);
		}
	} catch (err) {
		console.error('[TemplateCache] Error invalidating case rendered templates:', err);
		// Non-fatal
		
	}
}

/**
 * Invalidate all template-related caches for a case
 * Comprehensive invalidation when case data changes
 */
export async function invalidateAllCaseTemplates(caseId: string): Promise<void> {
	await Promise.all([
		invalidateCaseAIContent(caseId),
		invalidateCaseRenderedTemplates(caseId)
	]).catch(err => console.warn('[TemplateCache] Error invalidating all case templates:', err));
}

/**
 * Get cache statistics
 */
export async function getTemplateCacheStats(): Promise<{
	totalKeys: number;
	metadataKeys: number;
	aiContentKeys: number;
	renderedKeys: number;
}> {
	const redis = redisPool.getConnection();
	try {
		const [allKeys, metaKeys, aiKeys, renderedKeys] = await Promise.all([
			redis.keys(`template:*:${CACHE_VERSION}`),
			redis.keys(`template:meta:*:${CACHE_VERSION}`),
			redis.keys(`template:ai:*:${CACHE_VERSION}`),
			redis.keys(`template:rendered:*:${CACHE_VERSION}`)
		]);

		return {
			totalKeys: allKeys.length,
			metadataKeys: metaKeys.length,
			aiContentKeys: aiKeys.length,
			renderedKeys: renderedKeys.length
		};
	} catch (err) {
		console.error('[TemplateCache] Error getting stats:', err);
		return {
			totalKeys: 0,
			metadataKeys: 0,
			aiContentKeys: 0,
			renderedKeys: 0
		};
		
	}
}

/**
 * Warm up template cache by pre-loading all templates
 * Call on server startup for better first-request performance
 */
export async function warmupTemplateCache(): Promise<void> {
	console.log('[TemplateCache] Warming up cache...');
	const start = Date.now();

	try {
		// Pre-cache all templates
		await getCachedAllTemplates();

		// Pre-cache individual templates
		const templateTypes = Object.keys(REPORT_TEMPLATES);
		await Promise.all(templateTypes.map(type => getCachedTemplate(type)));

		const elapsed = Date.now() - start;
		console.log(`[TemplateCache] Warmup complete (${elapsed}ms) - cached ${templateTypes.length} templates`);
	} catch (err) {
		console.error('[TemplateCache] Warmup failed:', err);
		// Non-fatal - server can continue without warmup
	}
}

/**
 * Generate a hash of template parameters for cache key
 * Used for rendered template caching
 */
export function hashTemplateParams(params: Record<string, unknown>): string {
	// Simple hash of JSON stringified params
	const json = JSON.stringify(params, Object.keys(params).sort());
	let hash = 0;
	for (let i = 0; i < json.length; i++) {
		const char = json.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return Math.abs(hash).toString(36);
}