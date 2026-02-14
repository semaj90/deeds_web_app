// Alert Component - Svelte 5 Exports
import Alert from './Alert.svelte';
import AlertDescription from './AlertDescription.svelte';
import AlertTitle from './AlertTitle.svelte';

// Default exports
export { Alert, AlertDescription, AlertTitle };

// Compound pattern exports (for <Alert.Root>, <Alert.Title>, etc.)
export {
	Alert as Root,
	AlertTitle as Title,
	AlertDescription as Description
};
