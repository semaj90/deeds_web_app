import type { PageServerLoad } from './$types.js';
export const load: PageServerLoad = async () => {
 return {
 title: 'Evidence Analysis Workspace',
 description: 'Comprehensive AI-powered legal evidence processing',
 };
};
