/**
 * Optimized Enhanced-Bits Component Exports
 * Tree-shakable, categorized, and performance-optimized imports
 */

// ======================================
// CORE COMPONENTS (Always Tree-Shakable)
// ======================================

// Essential UI primitives - most commonly used
export { default as Button } from './Button.svelte';
export { default as Input } from './Input.svelte';
export { default as Label } from './Label.svelte';

// Card system - grouped for optimal chunking
export { default as Card } from './Card.svelte';
export { default as CardContent } from './CardContent.svelte';
export { default as CardDescription } from './CardDescription.svelte';
export { default as CardFooter } from './CardFooter.svelte';
export { default as CardHeader } from './CardHeader.svelte';
export { default as CardTitle } from './CardTitle.svelte';

// ======================================
// CATEGORY-BASED EXPORTS (Lazy Loadable)
// ======================================

/**
 * Legal AI Components - Evidence Analysis Focus
 * These can be dynamically imported when needed
 */
export const LEGAL_COMPONENTS = {
    EvidenceBoard: () => import('./EvidenceBoard.svelte'),
    EvidenceCard: () => import('./EvidenceCard.svelte'),
    CaseManager: () => import('./CaseManager.svelte'),
    LegalDocumentViewer: () => import('./LegalDocumentViewer.svelte')
} as const;

/**
 * AI & Chat Components - Conversational Interfaces
 */
export const AI_COMPONENTS = {
    EmbeddingGemmaChat: () => import('./EmbeddingGemmaChat.svelte'),
    EnhancedRAGStudio: () => import('./EnhancedRAGStudio.svelte'),
    AIDialog: () => import('../AIDialog.svelte'),
    ChatMessage: () => import('../ChatMessage.svelte')
} as const;

/**
 * Gaming & Theme Components - NES/Retro Styling
 */
export const GAMING_COMPONENTS = {
    NESButton: () => import('./gaming/NESButton.svelte'),
    NESContainer: () => import('./gaming/NESContainer.svelte'),
    PixelCard: () => import('./gaming/PixelCard.svelte'),
    RetroLoadingSpinner: () => import('./gaming/RetroLoadingSpinner.svelte')
} as const;

/**
 * Advanced UI Components - Complex Interactions
 */
export const ADVANCED_COMPONENTS = {
    Board: () => import('./Board.svelte'),
    Dialog: () => import('./Dialog.svelte'),
    DialogWrapper: () => import('../DialogWrapper.svelte'),
    Select: () => import('../Select.svelte'),
    YoRHaSearchBar: () => import('./YoRHaSearchBar.svelte'),
    ThemeToggle: () => import('./ThemeToggle.svelte')
} as const;

// ======================================
// COMPOUND COMPONENT PATTERNS
// ======================================

/**
 * shadcn/ui style compound exports
 * Import as import * as Card from '$lib/components/ui/enhanced-bits/compound/card.svelte'
 */
import CardRoot from './Card.svelte';
import CardHeader from './CardHeader.svelte';
import CardTitle from './CardTitle.svelte';
import CardDescription from './CardDescription.svelte';
import CardContent from './CardContent.svelte';
import CardFooter from './CardFooter.svelte';

export const CompoundComponents = {
    Card: {
        Root: CardRoot,
        Header: CardHeader,
        Title: CardTitle,
        Description: CardDescription,
        Content: CardContent,
        Footer: CardFooter
    }
} as const;

// ======================================
// DYNAMIC COMPONENT LOADER
// ======================================

export interface ComponentLoadOptions {
    category?: 'legal' | 'ai' | 'gaming' | 'advanced';
    priority?: 'immediate' | 'lazy' | 'background';
    cache?: boolean;
}

class ComponentLoader {
    private loadedComponents = new Map<string, any>();
    private loadingPromises = new Map<string, Promise<any>>();

    async loadComponent(name: string, options: ComponentLoadOptions = {}): Promise<any> {
        const { category = 'advanced', priority = 'lazy', cache = true } = options;

        // Check cache first
        if (cache && this.loadedComponents.has(name)) {
            return this.loadedComponents.get(name);
        }

        // Check if already loading
        if (this.loadingPromises.has(name)) {
            return this.loadingPromises.get(name);
        }

        // Get the appropriate component map
        const componentMap = this.getComponentMap(category);
        const loader = componentMap[name as keyof typeof componentMap] as () => Promise<any>;

        if (!loader) {
            throw new Error(`Component "${name}" not found in category "${category}"`);
        }

        // Create loading promise
        const loadingPromise = this.loadWithPriority(loader, priority);
        this.loadingPromises.set(name, loadingPromise);

        try {
            const component = await loadingPromise;
            if (cache) {
                this.loadedComponents.set(name, component.default || component);
            }
            return component.default || component;
        } finally {
            this.loadingPromises.delete(name);
        }
    }

    private getComponentMap(category: string) {
        switch (category) {
            case 'legal':
                return LEGAL_COMPONENTS;
            case 'ai':
                return AI_COMPONENTS;
            case 'gaming':
                return GAMING_COMPONENTS;
            case 'advanced':
            default:
                return ADVANCED_COMPONENTS;
        }
    }

    private async loadWithPriority(loader: () => Promise<any>, priority: string) {
        switch (priority) {
            case 'immediate':
                return await loader();
            case 'lazy':
                // Use requestIdleCallback for non-critical loading if available
                return new Promise((resolve, reject) => {
                    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
                        (window as any).requestIdleCallback(async () => {
                            try {
                                resolve(await loader());
                            } catch (error) {
                                reject(error);
                            }
                        });
                    } else {
                        setTimeout(async () => {
                            try {
                                resolve(await loader());
                            } catch (error) {
                                reject(error);
                            }
                        }, 0);
                    }
                });
            case 'background':
                // Load in the next frame
                return new Promise((resolve, reject) => {
                    if (typeof window !== 'undefined') {
                        requestAnimationFrame(async () => {
                            try {
                                resolve(await loader());
                            } catch (error) {
                                reject(error);
                            }
                        });
                    } else {
                         // Fallback for SSR
                        setTimeout(async () => {
                            try {
                                resolve(await loader());
                            } catch (error) {
                                reject(error);
                            }
                        }, 0);
                    }
                });
            default:
                return await loader();
        }
    }

    getCacheStats() {
         return {
             loadedComponents: this.loadedComponents.size,
             currentlyLoading: this.loadingPromises.size,
             cachedComponentNames: Array.from(this.loadedComponents.keys())
         };
    }

    clearCache() {
        this.loadedComponents.clear();
    }
}

// Create singleton instance
export const componentLoader = new ComponentLoader();

// ======================================
// CONVENIENCE FUNCTIONS
// ======================================

export function loadLegalComponent(name: keyof typeof LEGAL_COMPONENTS, cache = true) {
    return componentLoader.loadComponent(name, { category: 'legal', cache });
}

export function loadAIComponent(name: keyof typeof AI_COMPONENTS, cache = true) {
    return componentLoader.loadComponent(name, { category: 'ai', cache });
}

export function loadGamingComponent(name: keyof typeof GAMING_COMPONENTS, cache = true) {
    return componentLoader.loadComponent(name, { category: 'gaming', cache });
}

export async function preloadEssentialComponents(): Promise<void> {
    const essentialComponents = ['EvidenceBoard', 'EmbeddingGemmaChat', 'Dialog'] as const;
    const preloadPromises = essentialComponents.map((name) => {
        // Find category for each or just try all? Assuming keys are unique enough or we map them.
        // For simplicity, checking maps manually or try-catch.
        // Actually we know categories.
        let category: ComponentLoadOptions['category'] = 'advanced';
        if (name === 'EvidenceBoard') category = 'legal';
        if (name === 'EmbeddingGemmaChat') category = 'ai';
        if (name === 'Dialog') category = 'advanced';

        return componentLoader.loadComponent(name, { category, priority: 'background', cache: true });
    });

    await Promise.allSettled(preloadPromises);
}

// ======================================
// COMPONENT BUNDLE ANALYSIS
// ======================================

export const COMPONENT_BUNDLES = {
    core: ['Button', 'Input', 'Label', 'Card'],
    legal: ['EvidenceBoard', 'EvidenceCard', 'CaseManager'],
    ai: ['EmbeddingGemmaChat', 'EnhancedRAGStudio', 'AIDialog'],
    gaming: ['NESButton', 'NESContainer', 'PixelCard'],
    advanced: ['Board', 'Dialog', 'YoRHaSearchBar']
} as const;

export function getComponentBundleInfo() {
    return {
        bundles: COMPONENT_BUNDLES,
        estimatedSizes: {
            core: '~15KB',
            legal: '~45KB',
            ai: '~38KB',
            gaming: '~22KB',
            advanced: '~31KB'
        },
        totalEstimatedSize: '~151KB',
        treeShakeableCore: true
    };
}
