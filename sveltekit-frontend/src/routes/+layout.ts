import type { LayoutLoad } from './$types.js';
export const load: LayoutLoad = async ({ data }) => {
 return { user: data?.user ?? null };
};


