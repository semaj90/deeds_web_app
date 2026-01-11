// Compatibility barrel for named imports from '$lib // TODO: Verify store subscription is correct for Svelte 5/components/ui/Card.svelte''
// Ensures `import { Card, CardHeader, ... } from '$lib // TODO: Verify store subscription is correct for Svelte 5/components/ui/Card.svelte''` works (JS runtime friendly)
export { default as Card } from './Card/Card.svelte';
export { default as CardHeader } from './Card/CardHeader.svelte';
export { default as CardContent } from './Card/CardContent.svelte';
export { default as CardFooter } from './Card/CardFooter.svelte';
export { default as CardTitle } from './Card/CardTitle.svelte';
export { default as CardDescription } from './Card/CardDescription.svelte';
// Root and common aliases
export { default as Root } from './Card/Card.svelte';
export { default as Header } from './Card/CardHeader.svelte';
export { default as Content } from './Card/CardContent.svelte';
