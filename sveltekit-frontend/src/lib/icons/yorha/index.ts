// Legal AI Yorha Icon Pack — Monochrome geometric SVG icons
// Usage: import { IconLawBook, IconCitation } from '$lib/icons/yorha';

export { default as IconLawBook } from './IconLawBook.svelte';
export { default as IconCitation } from './IconCitation.svelte';
export { default as IconGlossaryTerm } from './IconGlossaryTerm.svelte';
export { default as IconPrecedentCase } from './IconPrecedentCase.svelte';
export { default as IconRegulation } from './IconRegulation.svelte';
export { default as IconSubjectProfile } from './IconSubjectProfile.svelte';
export { default as IconEvidenceFile } from './IconEvidenceFile.svelte';
export { default as IconTimeline } from './IconTimeline.svelte';
export { default as IconNetworkGraph } from './IconNetworkGraph.svelte';
export { default as IconIntegrityShield } from './IconIntegrityShield.svelte';
export { default as IconWarningFlag } from './IconWarningFlag.svelte';
export { default as IconAiAssistant } from './IconAiAssistant.svelte';

/** Shared props type for all Yorha icons */
export interface YorhaIconProps {
	class?: string;
	size?: number;
	strokeWidth?: number;
}
