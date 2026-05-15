// Progress Component - Svelte 5 Compound Pattern
import Progress from './Progress.svelte';
import ProgressRoot from './ProgressRoot.svelte';
import ProgressIndicator from './ProgressIndicator.svelte';

// Default exports
export { Progress, ProgressRoot, ProgressIndicator };

// Compound pattern exports
export {
	ProgressRoot as Root,
	ProgressIndicator as Indicator
};
