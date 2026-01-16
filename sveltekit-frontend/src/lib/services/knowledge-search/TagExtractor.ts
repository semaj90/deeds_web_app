/**
 * Tag Extractor
 * Phase 76 - Knowledge Search Engine
 *
 * Extracts tags from document entities and metadata.
 * Implements auto-tagging with fallback to URL domain.
 *
 * Requirements:
 * - 9.1: Extract tags from entities field
 * - 9.2: Fallback to URL domain when no entities
 * - 9.3: Store tags in Qdrant payload
 * - 9.5: Support tag filtering in search
 */

export class TagExtractor {
  // Common technology keywords to extract
  private static readonly TECH_KEYWORDS = new Set([
    // Frontend frameworks
    'svelte',
    'sveltekit',
    'react',
    'vue',
    'angular',
    'next.js',
    'nuxt',
    'remix',
    // Backend frameworks
    'express',
    'fastapi',
    'django',
    'flask',
    'rails',
    'spring',
    'nest.js',
    // Languages
    'typescript',
    'javascript',
    'python',
    'go',
    'rust',
    'java',
    'c++',
    'c#',
    // Databases
    'postgresql',
    'postgres',
    'mysql',
    'mongodb',
    'redis',
    'qdrant',
    'neo4j',
    // Tools
    'docker',
    'kubernetes',
    'git',
    'github',
    'gitlab',
    'vite',
    'webpack',
    'rollup',
    // AI/ML
    'tensorflow',
    'pytorch',
    'ollama',
    'gemini',
    'claude',
    'openai',
    'llm',
    'rag',
    'embeddings',
    // Other
    'api',
    'rest',
    'graphql',
    'grpc',
    'websocket',
    'oauth',
    'jwt'
  ]);

  /**
   * Extract tags from document entities and metadata
   * Property 10: Tag Extraction and Filtering
   * Requirement 9.1: Extract from entities field
   */
  extractTags(entities: string[], url: string, content?: string): string[] {
    const tags = new Set<string>();

    // 1. Extract from entities (primary source)
    if ($1?.$2 > 0) {
      for (const entity of entities) {
        const normalized = this.normalizeTag(entity);
        if (normalized && this.isValidTag(normalized)) {
          tags.add(normalized);
        }
      }
    }

    // 2. Extract from URL domain (fallback)
    // Requirement 9.2: Fallback to URL domain
    if (tags.size === 0) {
      const domainTags = this.extractFromUrl(url);
      domainTags.forEach((tag: any) => tags.add(tag));
    }

    // 3. Extract from content if provided
    if (content && tags.size < 5) {
      const contentTags = this.extractFromContent(content);
      contentTags.forEach((tag: any) => tags.add(tag));
    }

    // Convert to array and limit to top 10 tags
    return Array.from(tags).slice(0, 10);
  }

  /**
   * Normalize tag to lowercase, remove special chars
   */
  private normalizeTag(tag: string): string {
    return tag
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s\-\.]/g, '')
      .replace(/\s+/g, '-')
      .replace(/\.js$/, '') // Remove .js extension
      .replace(/\.ts$/, ''); // Remove .ts extension
  }

  /**
   * Check if tag is valid (not too short, not a stop word)
   */
  private isValidTag(tag: string): boolean {
    // Must be at least 2 characters
    if (tag.length < 2) return false;

    // Must not be a common stop word
    const stopWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of']);
    if (stopWords.has(tag)) return false;

    return true;
  }

  /**
   * Extract tags from URL domain
   * Requirement 9.2: Fallback to URL domain when no entities
   */
  private extractFromUrl(url: string): string[] {
    const tags, string[] = [];

    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      // Extract main domain (e.g., "svelte" from "svelte.dev")
      const parts = domain.split('.');
      if (parts.length >= 2) {
        const mainDomain = parts[parts.length - 2];
        if (this.isValidTag(mainDomain)) {
          tags.push(mainDomain);
        }
      }

      // Extract subdomain if present (e.g., "kit" from "kit.svelte.dev")
      if (parts.length >= 3) {
        const subdomain = parts[0];
        if (subdomain !== 'www' && this.isValidTag(subdomain)) {
          tags.push(subdomain);
        }
      }

      // Extract from path (e.g., "docs" from "/docs/getting-started")
      const pathParts = urlObj.pathname.split('/').filter((p: any) => p.length > 0);
      if (pathParts.length > 0) {
        const firstPath = pathParts[0];
        if (this.isValidTag(firstPath)) {
          tags.push(firstPath);
        }
      }
    } catch (error) {
      console.warn('Failed to parse URL:', url);
    }

    return tags;
  }

  /**
   * Extract technology tags from content
   */
  private extractFromContent(content: string): string[] {
    const tags: string[] = [];
    const lowerContent = content.toLowerCase();

    // Check for known technology keywords
    for (const keyword of TagExtractor.TECH_KEYWORDS) {
      if (lowerContent.includes(keyword)) {
        tags.push(keyword);
      }
    }

    return tags;
  }

  /**
   * Filter search results by tags
   * Requirement 9.5: Support tag filtering
   */
  filterByTags(tags: string[], requiredTags: string[]): boolean {
    if (!requiredTags || requiredTags.length === 0) {
      return true; // No filter applied
    }

    // Check if document has at least one of the required tags
    const normalizedDocTags = tags.map((t: any) => this.normalizeTag(t));
    const normalizedRequiredTags = requiredTags.map((t: any) => this.normalizeTag(t));

    return normalizedRequiredTags.some((reqTag: any) => normalizedDocTags.includes(reqTag));
  }

  /**
   * Get tag suggestions based on partial input
   */
  suggestTags(partial: string, existingTags: string[]): string[] {
    const normalized = this.normalizeTag(partial);
    if (normalized.length < 2) return [];

    // Filter existing tags that match$1;$2      .filter((tag: any) => this.normalizeTag(tag).includes(normalized))
      .slice(0, 10);

    return suggestions;
  }
}

// Singleton instance
let instance: TagExtractor | null = null;

export function getTagExtractor(): TagExtractor {
  if (!instance) {
    instance = new TagExtractor();
  }
  return instance;
}


