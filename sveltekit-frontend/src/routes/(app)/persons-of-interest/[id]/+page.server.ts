import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params: params }) => {
 return {
 poiId: params.id,
 };
};
