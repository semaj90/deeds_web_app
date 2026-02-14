/**
 * Statute Scraper Service
 * Fetches statutes from public APIs and government portals
 * Supports multiple jurisdictions and sources
 */

import { ingestStatuteWithChunks } from './statute-ingestion-service.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface ScraperSource {
    name: string;
	url: string;
    parser: (html: string) => Promise<Array<{ title: string;
	content: string; section?: string }>>;
    jurisdiction: string;
    category?: string;
}

/**
 * Fetch statute from URL
 */
async function fetchStatuteContent(url: string): Promise<string> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
	});

        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.statusText}`);
        }

        return await response.text();
    } catch (error) {
        console.error(`Failed to fetch statute from ${url}:`, error);
        throw error;
    }
}

/**
 * Parse California Penal Code from legislature.ca.gov
 */
async function parseCaliforniaPenalCode(html: string) {
    // This is a simplified parser - in production, use a proper HTML parser
    const statutes = [];

    // Extract statute sections using regex
    const sectionRegex = /§\s*(\d+(?:\.\d+)?)\s*[–-]\s*([^<]+)/g;
    let match;

    while ((match = sectionRegex.exec(html)) !== null) {
        statutes.push({
            title: `California Penal Code §${match[1]}`,
            section: `§${match[1]}`,
            content: match[2].trim(),
        });
    }

    return statutes;
}

/**
 * Parse US Code from congress.gov
 */
async function parseUSCode(html: string) {
    const statutes = [];

    // Extract statute sections
    const sectionRegex = /(\d+\s+U\.S\.C\.\s+§\s+\d+)\s*[–-]\s*([^<]+)/g;
    let match;

    while ((match = sectionRegex.exec(html)) !== null) {
        statutes.push({
            title: match[1],
            content: match[2].trim(),
        });
    }

    return statutes;
}

/**
 * Parse New York Penal Law from nysenate.gov
 */
async function parseNewYorkPenalLaw(html: string) {
    const statutes = [];

    // Extract statute sections
    const sectionRegex = /Article\s+(\d+)\s*[–-]\s*([^<]+)/g;
    let match;

    while ((match = sectionRegex.exec(html)) !== null) {
        statutes.push({
            title: `New York Penal Law Article ${match[1]}`,
            section: `Article ${match[1]}`,
            content: match[2].trim(),
        });
    }

    return statutes;
}

/**
 * Scrape statutes from a source
 */
export async function scrapeStatutes(source: ScraperSource) {
    try {
        console.log(`Scraping statutes from ${source.name}...`);

        const html = await fetchStatuteContent(source.url);
        const parsedStatutes = await source.parser(html);

        console.log(`Found ${parsedStatutes.length} statutes from ${source.name}`);

        const results = [];

        for (const statute of parsedStatutes) {
            try {
                const result = await ingestStatuteWithChunks({
                    title: statute.title,
                    content: statute.content,
                    jurisdiction: source.jurisdiction,
                    section: statute.section,
                    category: source.category,
                    sourceUrl: source.url,
                });

                results.push({
                    title: statute.title,
                    success: true,
                    statuteId: result.statuteId,
                    chunksCreated: result.chunksCreated,
                });
            } catch (error) {
                results.push({
                    title: statute.title,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        return results;
    } catch (error) {
        console.error(`Failed to scrape statutes from ${source.name}:`, error);
        throw error;
    }
}

/**
 * Batch scrape from multiple sources
 */
export async function batchScrapeStatutes(sources: ScraperSource[]) {
    const allResults = [];

    for (const source of sources) {
        try {
            const results = await scrapeStatutes(source);
            allResults.push({
                source: source.name,
                results,
            });
        } catch (error) {
            allResults.push({
                source: source.name,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    return allResults;
}

/**
 * Predefined statute sources
 */
export const STATUTE_SOURCES: Record<string, ScraperSource> = {
    california_penal_code: {
	name: 'California Penal Code',
        url: 'https://leginfo.legislature.ca.gov/faces/codes_displayexpanded.xhtml?lawCode=PEN',
        parser: parseCaliforniaPenalCode,
        jurisdiction: 'CA',
        category: 'criminal',
    },
	us_code_title_18: {
	name: 'US Code Title 18 (Crimes)',
        url: 'https://www.congress.gov/uscode/text/18',
        parser: parseUSCode,
        jurisdiction: 'US',
        category: 'criminal',
    },
	new_york_penal_law: {
	name: 'New York Penal Law',
        url: 'https://www.nysenate.gov/legislation/laws/PL',
        parser: parseNewYorkPenalLaw,
        jurisdiction: 'NY',
        category: 'criminal',
    },
	};

/**
 * Get available statute sources
 */
export function getAvailableSources(): string[] {
    return Object.keys(STATUTE_SOURCES);
}

/**
 * Get statute source by name
 */
export function getStatuteSource(name: string): ScraperSource | null {
    return STATUTE_SOURCES[name] ?? null;
}
