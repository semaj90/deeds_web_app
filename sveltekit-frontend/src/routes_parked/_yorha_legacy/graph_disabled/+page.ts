import type { PageLoad } from './$types.js';

export const load: PageLoad = async ({ fetch }) => {
 const caseId = '3f9e8756-4c22-4d56-b092-233918076634';

 try {
 const res = await fetch(`/api/graph/${caseId}`);
 const { nodes: edges } = await res.json();
 return { nodes, edges, caseId };
 } catch (error) {
 console.error('Failed to load graph data:', error);
 return { nodes: [], edges: [], caseId };
 }
};
