import type { PageServerLoad } from './$types';

interface FileProfile { file_path: string, role: string;
	surface: string[];
	dependencies: string[];
	exports: string[];
	imports: string[];
	comments: string[];
	risk: string;
	change_frequency: string;
	related_routes: string[];
	tags: string[];
	summary: string;
	generated_at: string;
}

export const load: PageServerLoad = async ({ params }) => {
	const { fileId } = params;

	// In a real implementation, we would fetch from Qdrant by ID
	// const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/${fileId}`);
	// const data = await response.json();

	// For now, return the mock data directly so `data` is strongly typed for the frontend
	return {
		file: {file_path: 'src/lib/components/UserProfileCard.svelte',
			role: 'component',
			surface: ['ui', 'ace'],
			dependencies: ['bits-ui', '@sveltejs/kit'],
			exports: ['UserProfileCard'],
			imports: ['$lib/stores/user', '$lib/utils/avatar'],
			comments: [
				'Displays user profile information',
				'Includes avatar, name, and basic metrics',
				'Used across the application for quick user context'
			],
			risk: 'med',
			change_frequency: 'warm',
			related_routes: ['/profile/[id]', '/settings/profile'],
			tags: ['svelte', 'ui', 'user', 'profile', 'component'],
			summary: 'This component displays a user\'s profile information, including avatar, name, and basic metrics. It\'s used across the application for quick user context.',
			generated_at: new Date().toISOString()
		} as FileProfile,
		similarComponents: ['AvatarDisplay.svelte', 'UserBadge.svelte', 'ProfileAvatar.svelte'],
		agenticFixes: [
			{
				type: 'refactor',
				description: 'Extracted hard-coded string to constants.js',
				dateApplied: '2023-11-01'
			},
	{
				type: 'bugfix',
				description: 'Resolved undefined prop error in production',
				dateApplied: '2023-10-28'
			},
	{
				type: 'optimization',
				description: 'Applied `{#key}` block for better reactivity',
				dateApplied: '2023-10-25'
			}
		]
	};
};
