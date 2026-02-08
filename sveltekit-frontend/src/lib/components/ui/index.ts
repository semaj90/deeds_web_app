/**
 * Unified UI Component System - Svelte 5 Ready
 * bits-ui v2.0.0 compatible
 */

// ============================================
// bits-ui v2 Components - Re-export for convenience
// Import directly from 'bits-ui' in components for full type support
// ============================================
// Note: For bits-ui components, import directly from 'bits-ui' in your components:
// import { Dialog } from "bits-ui";
import { Select } from "bits-ui";
import { Tabs } from "bits-ui";

// ============================================
// Custom UI Components
// ============================================

// Button
export { default as Button } from './button/Button.svelte';

// Input & Form
export { default as CustomCheckbox } from './checkbox/Checkbox.svelte';
export { default as Input } from './input/Input.svelte';
export { default as CustomLabel } from './label/Label.svelte';
export { default as Textarea } from './textarea/Textarea.svelte';

// Card - use lowercase 'card' folder
export { default as Card } from './card/Card.svelte';
export { default as CardContent } from './card/CardContent.svelte';
export { default as CardDescription } from './card/CardDescription.svelte';
export { default as CardFooter } from './card/CardFooter.svelte';
export { default as CardHeader } from './card/CardHeader.svelte';
export { default as CardTitle } from './card/CardTitle.svelte';

// Dialog
export { default as DialogComponent } from './dialog/Dialog.svelte';
export { default as DialogContent } from './dialog/DialogContent.svelte';
export { default as DialogDescription } from './dialog/DialogDescription.svelte';
export { default as DialogHeader } from './dialog/DialogHeader.svelte';
export { default as DialogTitle } from './dialog/DialogTitle.svelte';
export { default as DialogTrigger } from './dialog/DialogTrigger.svelte';

// Avatar
export { default as CustomAvatar } from './avatar/Avatar.svelte';
export { default as AvatarFallback } from './avatar/AvatarFallback.svelte';
export { default as AvatarImage } from './avatar/AvatarImage.svelte';

// Badge
export { default as Badge } from './badge/Badge.svelte';

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
export { default as LazyLoader } from './LazyLoader.svelte';
export { default as Portal } from './Portal.svelte';

// Theme
export { default as ThemeProvider } from './ThemeProvider.svelte';
export { default as ThemeSelector } from './ThemeSelector.svelte';

// Evidence & Case
export { default as EvidenceCanvas } from './EvidenceCanvas.svelte';

// Performance
export { default as AdaptiveRenderingEngine } from './AdaptiveRenderingEngine.svelte';
export { default as PerformanceMonitor } from './PerformanceMonitor.svelte';
export { default as ZeroLatencyInteraction } from './ZeroLatencyInteraction.svelte';

// Accessibility
export { default as AccessibilitySettings } from './AccessibilitySettings.svelte';
