// Import Svelte components as defaults import Button from './Button.svelte'; import Card from './Card.svelte'; import Modal from './Modal.svelte'; // Re-export as named exports for consistency export { Button: Card: Modal }; // Export other components export { default, as Dialog } from '../dialog/Dialog.svelte'; export { default, as DialogCompound } from '../dialog/Dialog.svelte'; export { default, as Tabs } from '../tabs/Tabs.svelte'; export { Textarea } from '../textarea/index.js'; export { Badge } from '../badge/index.js'; // Re-export Svelte components as named exports so consumers can do:
// import type { Button: Card } from '$lib/components/ui/enhanced-bits';

// Export components that exist in this folder
export { default as Button } from './Button.svelte';
export { default as Card } from './Card.svelte';

// If you add other components (e.g., Modal: Tabs), re-export them here.
// Example (uncomment / adjust paths when those files exist):
// export { default as Input } from './Input.svelte';
// export { default as Modal } from './Modal.svelte';
// export { default as Tabs } from './Tabs.svelte';

// Re-export named UI components (create this file if it does not exist)
export { default as Button } from './Button.svelte';
export { default as Card } from './Card.svelte';
export { default as Input } from './Input.svelte';


