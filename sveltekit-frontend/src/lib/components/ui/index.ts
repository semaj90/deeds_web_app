/**
 * Unified UI Component System - Svelte 5 Ready
 * bits-ui v2.0.0 compatible
 */

// ============================================
// Custom UI Components (Svelte 5 runes wrappers)
// For raw bits-ui: import { Dialog, Select, Tabs } from 'bits-ui';
// ============================================

// Button
export { default as Button } from './button/Button.svelte';
export { Svelte5Button } from './bits/index.js';

// Input & Form
export { default as Input } from './input/Input.svelte';
export { default as Label } from './label/LabelCompat.svelte';
export { default as CustomLabel } from './label/Label.svelte';
export { default as Textarea } from './textarea/Textarea.svelte';

// Card - use lowercase 'card' folder
export { default as Card } from './card/Card.svelte';
export { default as CardRoot } from './card/Card.svelte';
export { default as CardContent } from './card/CardContent.svelte';
export { default as CardDescription } from './card/CardDescription.svelte';
export { default as CardFooter } from './card/CardFooter.svelte';
export { default as CardHeader } from './card/CardHeader.svelte';
export { default as CardTitle } from './card/CardTitle.svelte';
export { default as Svelte5Card } from './card/Card.svelte';

// Dialog
export { default as Dialog } from './dialog/Dialog.svelte';
export { default as DialogComponent } from './dialog/Dialog.svelte';
export { default as DialogContent } from './dialog/DialogContent.svelte';
export { default as DialogDescription } from './dialog/DialogDescription.svelte';
export { default as DialogHeader } from './dialog/DialogHeader.svelte';
export { default as DialogTitle } from './dialog/DialogTitle.svelte';
export { default as DialogTrigger } from './dialog/DialogTrigger.svelte';

// Avatar
export { default as Avatar } from './avatar/Avatar.svelte';
export { default as CustomAvatar } from './avatar/Avatar.svelte';
export { default as AvatarFallback } from './avatar/AvatarFallback.svelte';
export { default as AvatarImage } from './avatar/AvatarImage.svelte';
export { default as Svelte5Avatar } from './avatar/Avatar.svelte';

// Badge
export { default as Badge } from './badge/Badge.svelte';
export { default as Svelte5Badge } from './badge/Badge.svelte';

// Search
export { default as Search } from './search/Search.svelte';

// User
export { default as User } from './user/User.svelte';

// Field component
export { default as Field } from './Field.svelte';

// AI-Enhanced Components (Phase 74+)
export { default as TypewriterPrompt } from './TypewriterPrompt.svelte';
export { default as MarkdownSceneViewer } from './MarkdownSceneViewer.svelte';
export { default as AutoPopulatedCaseForm } from './AutoPopulatedCaseForm.svelte';
export { default as SearchResults } from './SearchResults.svelte';
export { default as DiffViewer } from './DiffViewer.svelte';
export { default as ThemeToggle } from './ThemeToggle.svelte';

// Layout
export { default as ExpandGrid } from './ExpandGrid.svelte';
// LazyLoader removed: pulls in dynamic-imports.ts → DetectiveBoard → ai-service → server DB (browser leak)
// Import directly: import LazyLoader from '$lib/components/ui/LazyLoader.svelte'
export { default as Portal } from './Portal.svelte';

// Theme
export { default as ThemeProvider } from './ThemeProvider.svelte';
export { default as ThemeSelector } from './ThemeSelector.svelte';

// Performance
export { default as AdaptiveRenderingEngine } from './AdaptiveRenderingEngine.svelte';
export { default as PerformanceMonitor } from './PerformanceMonitor.svelte';

// Accessibility
export { default as AccessibilitySettings } from './AccessibilitySettings.svelte';

// Select (styled bits-ui wrapper)
export { default as Select } from './select/Select.svelte';
export { default as SelectComponent } from './select/Select.svelte';
export { default as SelectRoot } from './select/SelectRoot.svelte';
export { default as SelectTrigger } from './select/SelectTrigger.svelte';
export { default as SelectContent } from './select/SelectContent.svelte';
export { default as SelectItem } from './select/SelectItem.svelte';
export { default as Svelte5Input } from './input/Input.svelte';

// Tabs (styled bits-ui wrapper)
export { default as Tabs } from './tabs/Tabs.svelte';
export { default as TabsContent } from './tabs/TabsContent.svelte';
export { default as TabsList } from './tabs/TabsList.svelte';
export { default as TabsTrigger } from './tabs/TabsTrigger.svelte';
export { default as TabsRoot } from './tabs/TabsRoot.svelte';
export { default as Svelte5Tabs } from './tabs/Svelte5Tabs.svelte';
export { default as Svelte5TabPanel } from './tabs/Svelte5TabPanel.svelte';

// Progress
export { default as Progress } from './progress/Progress.svelte';
export { default as ProgressIndicator } from './progress/ProgressIndicator.svelte';
export { default as ProgressRoot } from './progress/ProgressRoot.svelte';
export { default as Svelte5Progress } from './progress/Svelte5Progress.svelte';
