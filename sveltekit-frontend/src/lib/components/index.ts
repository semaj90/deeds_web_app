// Master Component Barrel Export
// Legal AI Platform

// UI Components (Shadcn/Bits)
export * from './ui/alert';
export * from './ui/badge';
export * from './ui/breadcrumb';
export * from './ui/button';
export {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle
} from './ui/card';
export * from './ui/dialog';
export * from './ui/form';
export * from './ui/input';
export * from './ui/label';
export * from './ui/select';
export * from './ui/separator';
export * from './ui/slider';
export * from './ui/switch';
export * from './ui/tabs';
export * from './ui/textarea';

// Business Components
export { default as CaseCard } from './+CaseCard.svelte';
export { default as AIChat } from './AIChat.svelte';
export { default as EnhancedLegalChat } from './EnhancedLegalChat.svelte';
export { default as EvidenceCard } from './EvidenceCard.svelte';
export { default as EvidencePanel } from './EvidencePanel.svelte';
export { default as LegalCaseManager } from './LegalCaseManager.svelte';
export { default as LLMAssistant } from './LLMAssistant.svelte';

// Layout
export { default as Header } from './Header.svelte';
export { default as NierNavigation } from './NierNavigation.svelte';
export { default as Sidebar } from './Sidebar.svelte';

// Utilities
export { default as HeadlessDemo } from './HeadlessDemo.svelte';
export { default as KeyboardShortcutProvider } from './KeyboardShortcutProvider.svelte';
export { default as LoadingSpinner } from './LoadingSpinner.svelte';
export { default as Typewriter } from './Typewriter.svelte';

