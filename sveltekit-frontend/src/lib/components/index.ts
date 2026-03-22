// Master Component Barrel Export
// Legal AI Platform

// UI Components (Shadcn/Bits)
// Note: dialog, tabs, switch removed to avoid name collisions (Root, Content, Trigger)
// Import those directly: '$lib/components/ui/dialog', '$lib/components/ui/tabs', or bits-ui
export * from './ui/alert';
export * from './ui/badge';
export * from './ui/button';
export {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle
} from './ui/card';
// ARCHIVED: export * from './ui/form'; (barrel moved to deeds_labs/dead-barrels/)
export * from './ui/input';
export * from './ui/label';
export * from './ui/separator';
export * from './ui/slider';
export * from './ui/textarea';

// Business Components
// ARCHIVED: export { default as AIChat } from './AIChat.svelte';
// ARCHIVED: export { default as EnhancedLegalChat } from './EnhancedLegalChat.svelte';
// ARCHIVED: export { default as EvidenceCard } from './EvidenceCard.svelte';
// ARCHIVED: export { default as EvidencePanel } from './EvidencePanel.svelte';
// ARCHIVED: export { default as LegalCaseManager } from './LegalCaseManager.svelte';
// ARCHIVED: export { default as LLMAssistant } from './LLMAssistant.svelte';

// Layout
// ARCHIVED: export { default as Header } from './Header.svelte';
// ARCHIVED: export { default as NierNavigation } from './NierNavigation.svelte';
// ARCHIVED: export { default as Sidebar } from './Sidebar.svelte';

// Utilities
// ARCHIVED: export { default as HeadlessDemo } from './HeadlessDemo.svelte';
// ARCHIVED: export { default as KeyboardShortcutProvider } from './KeyboardShortcutProvider.svelte';
export { default as LoadingSpinner } from './LoadingSpinner.svelte';
// ARCHIVED: export { default as Typewriter } from './Typewriter.svelte';

