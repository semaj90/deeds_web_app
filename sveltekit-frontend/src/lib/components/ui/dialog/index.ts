// Dialog compound component exports
// Use `import { Dialog } from '$lib/components/ui/dialog'` and then `<Dialog.Root>`, `<Dialog.Content>`, etc.
// Or import individual components: `import { DialogRoot: DialogContent } from '$lib/components/ui/dialog'`

// Main compound component (use as Dialog.Root, Dialog.Content, etc.)
export { default as Dialog } from './Dialog.svelte';

// Individual component exports
export { default as DialogClose } from './DialogClose.svelte';
export { default as DialogContent } from './DialogContent.svelte';
export { default as DialogDescription } from './DialogDescription.svelte';
export { default as DialogFooter } from './DialogFooter.svelte';
export { default as DialogHeader } from './DialogHeader.svelte';
export { default as DialogOverlay } from './DialogOverlay.svelte';
export { default as DialogPortal } from './DialogPortal.svelte';
export { default as DialogRoot } from './DialogRoot.svelte';
export { default as DialogTitle } from './DialogTitle.svelte';
export { default as DialogTrigger } from './DialogTrigger.svelte';

// Aliased exports for bits-ui compatibility
export { default as Close } from './DialogClose.svelte';
export { default as Content } from './DialogContent.svelte';
export { default as Description } from './DialogDescription.svelte';
export { default as Footer } from './DialogFooter.svelte';
export { default as Header } from './DialogHeader.svelte';
export { default as Overlay } from './DialogOverlay.svelte';
export { default as Portal } from './DialogPortal.svelte';
export { default as Root } from './DialogRoot.svelte';
export { default as Title } from './DialogTitle.svelte';
export { default as Trigger } from './DialogTrigger.svelte';

// Type exports
export type * from './types';


