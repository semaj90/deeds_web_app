import type { PageLoad } from './$types.js';

export const load: PageLoad = async ({ fetch, params }) => {
 const res = await fetch(`/api/cases/${params.id}/evidence`);

 let evidence = [];
 if (res.ok) {
 evidence = await res.json();
 }

 return {
 evidence,
 };
};
