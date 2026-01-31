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
    EvidenceAIAnalysis: () => import('./EvidenceAIAnalysis.svelte'),
    LegalAIDashboard: () => import('./LegalAIDashboard.svelte'),
    LegalAIDemo: () => import('./LegalAIDemo.svelte')
} as const;

/**
 * AI & Chat Components - Conversational Interfaces
 */
export const AI_COMPONENTS = {
    EmbeddingGemmaChat: () => import('./EmbeddingGemmaChat.svelte'),
    EnhancedRAGStudio: () => import('./EnhancedRAGStudio.svelte'),
    AIDialog: () => import('./AIDialog.svelte'),
    ChatMessage: () => import('./ChatMessage.svelte')
} as const;

/**
 * Gaming & Theme Components - NES/Retro Styling
 */
export const GAMING_COMPONENTS = {
    NESButton: () => import('./NESButton.svelte'),
    NESCard: () => import('./NESCard.svelte'),
    NESModal: () => import('./NESModal.svelte'),
    NESGamingShowcase: () => import('./NESGamingShowcase.svelte')
} as const;

/**
 * Advanced UI Components - Complex Interactions
 */
export const ADVANCED_COMPONENTS = {
    Board: () => import('./Board.svelte'),
    DialogWrapper: () => import('./DialogWrapper.svelte'),
    YoRHaSearchBar: () => import('./YoRHaSearchBar.svelte'),
    ThemeToggle: () => import('./ThemeToggle.svelte')
} as const;

// ======================================
// COMPOUND COMPONENT PATTERNS
// ======================================

/**
 * shadcn/ui style compound exports
 */
import CardRoot from './Card.svelte';
import CardHeaderComp from './CardHeader.svelte';
import CardTitleComp from './CardTitle.svelte';
import CardDescriptionComp from './CardDescription.svelte';
import CardContentComp from './CardContent.svelte';
import CardFooterComp from './CardFooter.svelte';

export const CompoundComponents = {
    Card: {
        Root: CardRoot,
        Header: CardHeaderComp,
        Title: CardTitleComp,
        Description: CardDescriptionComp,
        Content: CardContentComp,
        Footer: CardFooterComp
    }
} as const;

// ======================================
// COMPONENT BUNDLE ANALYSIS
// ======================================

export const COMPONENT_BUNDLES = {
    core: ['Button', 'Input', 'Label', 'Card'],
    legal: ['EvidenceBoard', 'EvidenceAIAnalysis', 'LegalAIDashboard'],
    ai: ['EmbeddingGemmaChat', 'EnhancedRAGStudio', 'AIDialog'],
    gaming: ['NESButton', 'NESCard', 'NESModal'],
    advanced: ['Board', 'DialogWrapper', 'YoRHaSearchBar']
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
