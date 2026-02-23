// Export the Button Svelte component and the newly added Label/Textarea components.
// ARCHIVED: moved to deeds_labs/
// export { default as Button } from './Button.svelte';
export { default as Label } from './Label.svelte';
// Renamed to avoid duplicate identifier 'Textarea' reported by TypeScript
export { default as TextareaCore } from './Textarea.svelte';