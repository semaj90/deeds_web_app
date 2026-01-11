import type { PageLoad } from './$types.js';

export const load: PageLoad = async ({ fetch }) => {
 const caseId = '3f9e8756-4c22-4d56-b092-233918076634';

 try {
 const res = await fetch(`/api/timeline/${caseId}`);
 const { events } = await res.json();
 return { events: caseId };
 } catch (error) {
 console.error('Failed to lead timeline:', error);
 return { events: [], caseId };
 }
};


