/**
 * bits-ui v2 Barrel Export for Svelte 5
 *
 * bits-ui v2 uses the new Svelte 5 API with:
 * - $props() instead of export let
 * - $state() for reactive state
 * - Snippet-based children instead of slots
 *
 * Note: bits-ui v2 uses default exports for components
 * @see https://bits-ui.com/docs/getting-started
 */

// Re-export bits-ui components that use named exports
export {
    Avatar,
    Button,
    Checkbox,
    Combobox,
    DatePicker,
    Dialog,
    Popover,
    Select,
    Tabs,
    Tooltip
} from 'bits-ui';

// Export custom bits components
export { default as Alert } from './Alert.svelte';
export { default as AlertDescription } from './AlertDescription.svelte';
export { default as AnimationLibrary } from './AnimationLibrary.svelte';
export { default as AvatarDisplay } from './AvatarDisplay.svelte';
export { default as Board } from './Board.svelte';
export { default as BitsButton } from './Button.svelte';
export { default as BitsCard } from './Card.svelte';
export { default as CardContent } from './CardContent.svelte';
export { default as CardDescription } from './CardDescription.svelte';
export { default as CardFooter } from './CardFooter.svelte';
export { default as CardHeader } from './CardHeader.svelte';
export { default as CardTitle } from './CardTitle.svelte';
export { default as ChatMessage } from './ChatMessage.svelte';
// BitsDialog removed - use Dialog from svelte5-index or Dialog compound component
export { default as AIAssistantTest } from './AIAssistantTest.svelte';
export { default as AIChatMessage } from './AIChatMessage.svelte';
export { default as AIDialog } from './AIDialog.svelte';
export { default as AIRecommendations } from './AIRecommendations.svelte';
export { default as AISearchBar } from './AISearchBar.svelte';
export { default as DialogWrapper } from './DialogWrapper.svelte';
export { default as DocumentCard } from './DocumentCard.svelte';
export { default as DraggableModal } from './DraggableModal.svelte';
export { default as EditorCard } from './EditorCard.svelte';
export { default as EmbeddingForm } from './EmbeddingForm.svelte';
export { default as EmbeddingGemmaChat } from './EmbeddingGemmaChat.svelte';
export { default as EmbeddingSearch } from './EmbeddingSearch.svelte';
export { default as EnhancedBitsDemo } from './EnhancedBitsDemo.svelte';
export { default as EnhancedModal } from './EnhancedModal.svelte';
export { default as EnhancedRAGStudio } from './EnhancedRAGStudio.svelte';
export { default as EvidenceAIAnalysis } from './EvidenceAIAnalysis.svelte';
export { default as EvidenceBoard } from './EvidenceBoard.svelte';
export { default as EvidenceThumbnail } from './EvidenceThumbnail.svelte';
export { default as FormGrid } from './FormGrid.svelte';
export { default as FullStackLegalAI } from './FullStackLegalAI.svelte';
export { default as GemmaEmbeddingDemo } from './GemmaEmbeddingDemo.svelte';
export { default as GlyphEngineRenderer } from './GlyphEngineRenderer.svelte';
export { default as GoldenRatioLoader } from './GoldenRatioLoader.svelte';
export { default as HybridLegalAnalysis3D } from './HybridLegalAnalysis3D.svelte';
export { default as BitsInput } from './Input.svelte';
export { default as IntelligentRenderer } from './IntelligentRenderer.svelte';
export { default as KeyboardHelp } from './KeyboardHelp.svelte';
export { default as KeyboardMapping } from './KeyboardMapping.svelte';
export { default as KeyboardProvider } from './KeyboardProvider.svelte';
export { default as BitsLabel } from './Label.svelte';
export { default as LegalAIDashboard } from './LegalAIDashboard.svelte';
export { default as LegalAIDemo } from './LegalAIDemo.svelte';
export { default as LegalPOICard } from './LegalPOICard.svelte';
export { default as LinkButton } from './LinkButton.svelte';
export { default as NESButton } from './NESButton.svelte';
export { default as NESCard } from './NESCard.svelte';
export { default as NESGamingShowcase } from './NESGamingShowcase.svelte';
export { default as NESModal } from './NESModal.svelte';
export { default as BitsPopover } from './Popover.svelte';
export { default as ProfileContainer } from './ProfileContainer.svelte';
export { default as ProfileHeader } from './ProfileHeader.svelte';
export { default as SearchInput } from './SearchInput.svelte';
export { default as BitsSelect } from './Select.svelte';
export { default as Sidebar } from './Sidebar.svelte';
export { default as SidebarDemo } from './SidebarDemo.svelte';
export { default as SPACanvasRenderer } from './SPACanvasRenderer.svelte';
export { default as SSRWebGPULoader } from './SSRWebGPULoader.svelte';
export { default as StatCard } from './StatCard.svelte';
export { default as BitsTabs } from './Tabs.svelte';
export { default as ThemeDemo } from './ThemeDemo.svelte';
export { default as ThemeProvider } from './ThemeProvider.svelte';
export { default as ThemeToggle } from './ThemeToggle.svelte';
export { default as BitsToolbar } from './Toolbar.svelte';
export { default as BitsTooltip } from './Tooltip.svelte';
export { default as VectorIntelligenceDemo } from './VectorIntelligenceDemo.svelte';
export { default as WebAssemblyIntegrationDemo } from './WebAssemblyIntegrationDemo.svelte';
export { default as YoRHaHarvardButton } from './YoRHaHarvardButton.svelte';
export { default as YoRHaHarvardCard } from './YoRHaHarvardCard.svelte';
export { default as YoRHaSearchBar } from './YoRHaSearchBar.svelte';

// Svelte 5 Runes-based components (new architecture)
export { default as Svelte5Button } from './Svelte5Button.svelte';
export { default as Svelte5Dialog } from './Svelte5Dialog.svelte';

// Export types
export * from './types.js';
