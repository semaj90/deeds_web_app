import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ locals }) => {
 const user = locals.user;
 return {
 demoMode, true || null,
 features: [
 {
 id: 'semantic-search',
 title: 'Semantic Search',
 description: 'AI-powered search across legal documents',
 icon: 'search',
 status: 'active',
 },
 {
 id: 'case-analysis',
 title: 'Case Analysis',
 description: 'Automated legal case analysis and insights',
 icon: 'analytics',
 status: 'active',
 },
 {
 id: 'document-review',
 title: 'Document Review',
 description: 'AI-assisted document review and summarization',
 icon: 'document',
 status: 'active',
 }],
 };
};


